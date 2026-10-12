import { Emitter } from './emitter';
import { PeerConnection, type PeerConnectionState } from './peer-connection';
import type { SignalingClient } from './signaling-client';

type ManagerEvents = {
  'peer-state': (peerId: string, state: PeerConnectionState) => void;
  'peer-open': (peerId: string) => void;
  'peer-close': (peerId: string) => void;
  message: (peerId: string, data: Uint8Array) => void;
};

/**
 * Maintains a full mesh: one PeerConnection per remote peer in the room.
 *
 * To keep glare rare, only the newcomer dials: it connects to every peer listed in its join
 * response, while existing peers create their side lazily on the first incoming signal.
 * Perfect negotiation still covers the remaining races (reconnects, ICE restarts).
 */
export class PeerConnectionManager extends Emitter<ManagerEvents> {
  private readonly peers = new Map<string, PeerConnection>();
  private readonly unsubscribe: Array<() => void>;

  constructor(
    private readonly signaling: SignalingClient,
    private readonly getRtcConfig: () => RTCConfiguration,
  ) {
    super();
    this.unsubscribe = [
      signaling.on('joined', (peers) => peers.forEach((id) => this.ensurePeer(id))),
      signaling.on('peer-left', (peerId) => this.closePeer(peerId)),
      signaling.on('signal', ({ from, data }) => void this.ensurePeer(from).handleSignal(data)),
    ];
  }

  get connections(): ReadonlyMap<string, PeerConnection> {
    return this.peers;
  }

  send(peerId: string, data: Uint8Array): void {
    this.peers.get(peerId)?.send(data);
  }

  broadcast(data: Uint8Array): void {
    this.peers.forEach((peer) => peer.send(data));
  }

  closePeer(peerId: string): void {
    this.peers.get(peerId)?.close();
  }

  destroy(): void {
    this.unsubscribe.forEach((fn) => fn());
    [...this.peers.keys()].forEach((id) => this.closePeer(id));
    this.removeAllListeners();
  }

  private ensurePeer(peerId: string): PeerConnection {
    const existing = this.peers.get(peerId);
    if (existing && existing.state !== 'failed' && existing.state !== 'closed') return existing;
    existing?.close();

    // Deterministic role assignment: both sides compute the same answer independently.
    const polite = this.signaling.peerId > peerId;
    const peer = new PeerConnection(peerId, polite, this.getRtcConfig());
    this.peers.set(peerId, peer);

    peer.on('signal', (data) => this.signaling.send(peerId, data));
    peer.on('state', (state) => this.emit('peer-state', peerId, state));
    peer.on('open', () => this.emit('peer-open', peerId));
    peer.on('message', (data) => this.emit('message', peerId, data));
    peer.on('close', () => {
      if (this.peers.get(peerId) === peer) this.peers.delete(peerId);
      this.emit('peer-close', peerId);
    });

    this.emit('peer-state', peerId, peer.state);
    return peer;
  }
}
