import type { IceServersResponse } from '@peerboard/shared';
import { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { decrypt, encrypt } from './crypto';
import { Emitter } from './emitter';
import { PeerConnectionManager } from './peer-connection-manager';
import type { PeerConnectionState } from './peer-connection';
import { SignalingClient, type SignalingStatus } from './signaling-client';
import { SyncEngine, type FrameTransport } from './sync-engine';

export type PeerInfo = {
  peerId: string;
  state: PeerConnectionState;
  /** Application-level round trip (includes encryption + Yjs framing), in ms. */
  rttMs?: number;
  relayed?: boolean;
};

export type ProviderStatus = SignalingStatus | 'room-full';

export type PeerBoardProviderOptions = {
  roomId: string;
  signalingUrl: string;
  peerId?: string;
  awareness?: Awareness;
  /** AES-GCM room key. When set, every data channel frame is end-to-end encrypted. */
  roomKey?: CryptoKey;
  /** Static ICE servers; otherwise fetched from `${signalingUrl}/ice-servers`. */
  iceServers?: RTCIceServer[];
  /** How often to measure per-peer latency. */
  statsIntervalMs?: number;
  connect?: boolean;
};

type ProviderEvents = {
  status: (status: ProviderStatus) => void;
  peers: (peers: PeerInfo[]) => void;
  /** Fired whenever state from a remote peer was applied. */
  synced: (at: number) => void;
  /** A peer sent data we could not decrypt: it does not hold the room key. */
  'unauthorized-peer': (peerId: string) => void;
};

const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function randomPeerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Yjs provider that syncs a Y.Doc over a WebRTC full mesh.
 * The signaling server is used only to exchange SDP/ICE; document data travels peer-to-peer.
 */
export class PeerBoardProvider extends Emitter<ProviderEvents> {
  readonly awareness: Awareness;
  readonly peerId: string;
  readonly roomId: string;

  private readonly signaling: SignalingClient;
  private readonly manager: PeerConnectionManager;
  private readonly engine: SyncEngine;
  private readonly roomKey: CryptoKey | undefined;
  private readonly peerInfo = new Map<string, PeerInfo>();
  private readonly unsubscribe: Array<() => void> = [];
  /** One ordered pipeline for outgoing frames (encryption is async; order must be preserved). */
  private sendQueue: Promise<void> = Promise.resolve();
  /** Per-peer ordered pipelines for incoming frames. */
  private readonly receiveQueues = new Map<string, Promise<void>>();
  private rtcConfig: RTCConfiguration = { iceServers: DEFAULT_ICE };
  private iceExpiresAt: number | undefined;
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private _status: ProviderStatus = 'disconnected';
  private _lastSyncedAt: number | null = null;

  constructor(
    readonly doc: Y.Doc,
    private readonly options: PeerBoardProviderOptions,
  ) {
    super();
    this.roomId = options.roomId;
    this.peerId = options.peerId ?? randomPeerId();
    this.awareness = options.awareness ?? new Awareness(doc);
    this.roomKey = options.roomKey;
    if (options.iceServers) this.rtcConfig = { iceServers: options.iceServers };

    this.signaling = new SignalingClient(options.signalingUrl, this.roomId, this.peerId);
    this.manager = new PeerConnectionManager(this.signaling, () => this.rtcConfig);

    const transport: FrameTransport = {
      send: (peerId, frame) => this.enqueueSend(frame, [peerId]),
      broadcast: (frame) => this.enqueueSend(frame, null),
    };
    this.engine = new SyncEngine(doc, this.awareness, transport);

    this.unsubscribe.push(
      this.signaling.on('status', (s) => this.setStatus(s)),
      this.signaling.on('join-error', (e) => e === 'room-full' && this.setStatus('room-full')),
      this.manager.on('peer-state', (peerId, state) => this.updatePeer(peerId, { state })),
      this.manager.on('peer-open', (peerId) => this.engine.addPeer(peerId)),
      this.manager.on('peer-close', (peerId) => this.handlePeerClose(peerId)),
      this.manager.on('message', (peerId, data) => this.enqueueReceive(peerId, data)),
      this.engine.on('synced', () => {
        this._lastSyncedAt = Date.now();
        this.emit('synced', this._lastSyncedAt);
      }),
      this.engine.on('rtt', (peerId, ms) => this.updatePeer(peerId, { rttMs: Math.round(ms) })),
    );

    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.handleUnload);
    if (options.connect !== false) void this.connect();
  }

  get status(): ProviderStatus {
    return this._status;
  }

  get peers(): PeerInfo[] {
    return [...this.peerInfo.values()];
  }

  get lastSyncedAt(): number | null {
    return this._lastSyncedAt;
  }

  get encrypted(): boolean {
    return this.roomKey !== undefined;
  }

  async connect(): Promise<void> {
    await this.refreshIceServers();
    this.signaling.connect();
    clearInterval(this.statsTimer);
    this.statsTimer = setInterval(
      () => void this.collectStats(),
      this.options.statsIntervalMs ?? 3_000,
    );
  }

  disconnect(): void {
    clearInterval(this.statsTimer);
    this.signaling.disconnect();
    [...this.manager.connections.keys()].forEach((id) => this.manager.closePeer(id));
  }

  destroy(): void {
    if (typeof window !== 'undefined')
      window.removeEventListener('beforeunload', this.handleUnload);
    // Best effort "I left" for awareness; peers also drop our state when the connection closes.
    this.awareness.setLocalState(null);
    this.disconnect();
    this.unsubscribe.forEach((fn) => fn());
    this.engine.destroy();
    this.manager.destroy();
    this.signaling.destroy();
    this.removeAllListeners();
  }

  private readonly handleUnload = () => this.awareness.setLocalState(null);

  private context(): string {
    return `peerboard:rtc:${this.roomId}`;
  }

  private enqueueSend(frame: Uint8Array, targets: string[] | null): void {
    const key = this.roomKey;
    this.sendQueue = this.sendQueue
      .then(async () => {
        // Encrypt once, fan out to every target.
        const payload = key ? await encrypt(key, frame, this.context()) : frame;
        if (targets) targets.forEach((id) => this.manager.send(id, payload));
        else this.manager.broadcast(payload);
      })
      .catch((error: unknown) => console.warn('[peerboard] send failed', error));
  }

  private enqueueReceive(peerId: string, data: Uint8Array): void {
    const key = this.roomKey;
    const previous = this.receiveQueues.get(peerId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const frame = key ? await decrypt(key, data, this.context()) : data;
        if (!frame) {
          this.emit('unauthorized-peer', peerId);
          this.manager.closePeer(peerId);
          return;
        }
        this.engine.receive(peerId, frame);
      })
      .catch((error: unknown) => console.warn('[peerboard] receive failed', error));
    this.receiveQueues.set(peerId, next);
  }

  private handlePeerClose(peerId: string): void {
    this.engine.removePeer(peerId);
    this.receiveQueues.delete(peerId);
    this.peerInfo.delete(peerId);
    this.emit('peers', this.peers);
  }

  private updatePeer(peerId: string, patch: Partial<PeerInfo>): void {
    if (patch.state === 'closed') return;
    const current = this.peerInfo.get(peerId) ?? { peerId, state: 'connecting' as const };
    this.peerInfo.set(peerId, { ...current, ...patch });
    this.emit('peers', this.peers);
  }

  private async collectStats(): Promise<void> {
    this.engine.ping();
    if (this.iceExpiresAt && Date.now() / 1000 > this.iceExpiresAt - 300) {
      void this.refreshIceServers();
    }
    await Promise.all(
      [...this.manager.connections].map(async ([peerId, peer]) => {
        if (!peer.isOpen) return;
        const stats = await peer.getStats().catch(() => null);
        if (stats && this.peerInfo.get(peerId)?.relayed !== stats.relayed) {
          this.updatePeer(peerId, { relayed: stats.relayed });
        }
      }),
    );
  }

  /** TURN credentials are short-lived and fetched at runtime, never bundled into the client. */
  private async refreshIceServers(): Promise<void> {
    if (this.options.iceServers) return;
    try {
      const url = new URL('/ice-servers', this.options.signalingUrl);
      url.searchParams.set('peerId', this.peerId);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as IceServersResponse;
      this.rtcConfig = { iceServers: body.iceServers };
      this.iceExpiresAt = body.expiresAt;
    } catch {
      // Offline or signaling down: keep the previous / default STUN configuration.
    }
  }

  private setStatus(status: ProviderStatus): void {
    if (this._status === 'room-full' && status === 'disconnected') return;
    if (status === this._status) return;
    this._status = status;
    this.emit('status', status);
  }
}
