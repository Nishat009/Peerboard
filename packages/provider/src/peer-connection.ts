import type { SignalData } from '@peerboard/shared';
import { Emitter } from './emitter';

export type PeerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export type PeerTransportStats = {
  /** ICE round trip time of the selected candidate pair, in ms. */
  rttMs?: number;
  /** True when traffic flows through a TURN relay rather than directly. */
  relayed: boolean;
};

type PeerConnectionEvents = {
  state: (state: PeerConnectionState) => void;
  open: () => void;
  close: () => void;
  message: (data: Uint8Array) => void;
  signal: (data: SignalData) => void;
};

const DATA_CHANNEL_LABEL = 'yjs-sync';
const MAX_ICE_RESTARTS = 3;
const DISCONNECTED_GRACE_MS = 4_000;
/** Back-pressure: above HIGH we queue locally and resume once the buffer drains below LOW. */
const BUFFER_HIGH_BYTES = 4 * 1024 * 1024;
const BUFFER_LOW_BYTES = 512 * 1024;

/**
 * One RTCPeerConnection to one remote peer, implementing the W3C "perfect negotiation" pattern.
 * Both sides may start negotiating at any time (e.g. ICE restarts), and offer collisions (glare)
 * are resolved deterministically: the polite peer rolls back, the impolite peer ignores.
 *
 * The data channel is pre-negotiated (`negotiated: true, id: 0`), so both sides create it
 * symmetrically and no `ondatachannel` race exists.
 */
export class PeerConnection extends Emitter<PeerConnectionEvents> {
  readonly pc: RTCPeerConnection;
  private readonly channel: RTCDataChannel;
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;
  /** Signals are applied strictly in arrival order (a candidate must follow its description). */
  private signalQueue: Promise<void> = Promise.resolve();
  /** Frames held back while the SCTP buffer is above the high watermark. Never dropped. */
  private readonly outbox: Uint8Array[] = [];
  private iceRestarts = 0;
  private disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private _state: PeerConnectionState = 'connecting';

  constructor(
    readonly remotePeerId: string,
    readonly polite: boolean,
    config: RTCConfiguration,
  ) {
    super();
    this.pc = new RTCPeerConnection(config);
    this.channel = this.pc.createDataChannel(DATA_CHANNEL_LABEL, {
      negotiated: true,
      id: 0,
      ordered: true,
    });
    this.channel.binaryType = 'arraybuffer';
    this.channel.bufferedAmountLowThreshold = BUFFER_LOW_BYTES;
    this.channel.onbufferedamountlow = () => this.flush();

    this.pc.onnegotiationneeded = () => void this.negotiate();
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        this.emit('signal', { kind: 'candidate', candidate: candidate.toJSON() as never });
    };
    this.pc.onconnectionstatechange = () => this.handleConnectionState();

    this.channel.onopen = () => {
      this.iceRestarts = 0;
      this.setState('connected');
      this.emit('open');
    };
    this.channel.onclose = () => {
      this.outbox.length = 0;
      if (this._state !== 'closed') this.emit('close');
    };
    this.channel.onmessage = ({ data }) => {
      if (data instanceof ArrayBuffer) this.emit('message', new Uint8Array(data));
    };
  }

  get state(): PeerConnectionState {
    return this._state;
  }

  get isOpen(): boolean {
    return this.channel.readyState === 'open';
  }

  send(data: Uint8Array): void {
    if (!this.isOpen) return;
    this.outbox.push(data);
    this.flush();
  }

  handleSignal(data: SignalData): Promise<void> {
    this.signalQueue = this.signalQueue
      .then(() => this.applySignal(data))
      .catch((error: unknown) => console.warn('[peerboard] signal failed', error));
    return this.signalQueue;
  }

  async getStats(): Promise<PeerTransportStats> {
    const report = await this.pc.getStats();
    let pair: (RTCIceCandidatePairStats & { localCandidateId?: string }) | undefined;
    report.forEach((s: RTCStats) => {
      if (s.type === 'transport') {
        const selected = (s as RTCTransportStats).selectedCandidatePairId;
        if (selected) pair = report.get(selected) as typeof pair;
      }
    });
    // Firefox does not expose selectedCandidatePairId; fall back to the nominated pair.
    if (!pair) {
      report.forEach((s: RTCStats) => {
        const candidate = s as RTCIceCandidatePairStats;
        if (s.type === 'candidate-pair' && candidate.nominated && candidate.state === 'succeeded') {
          pair = candidate;
        }
      });
    }
    if (!pair) return { relayed: false };

    const local = pair.localCandidateId ? report.get(pair.localCandidateId) : undefined;
    return {
      rttMs:
        pair.currentRoundTripTime !== undefined
          ? Math.round(pair.currentRoundTripTime * 1000)
          : undefined,
      relayed: (local as { candidateType?: string } | undefined)?.candidateType === 'relay',
    };
  }

  close(): void {
    if (this._state === 'closed') return;
    clearTimeout(this.disconnectTimer);
    this.setState('closed');
    this.emit('close');
    this.channel.close();
    this.pc.close();
    this.removeAllListeners();
  }

  private flush(): void {
    while (this.outbox.length > 0 && this.isOpen) {
      if (this.channel.bufferedAmount > BUFFER_HIGH_BYTES) return;
      this.channel.send(this.outbox.shift() as Uint8Array<ArrayBuffer>);
    }
  }

  private async negotiate(): Promise<void> {
    try {
      this.makingOffer = true;
      // Implicit createOffer/createAnswer (parameterless setLocalDescription).
      await this.pc.setLocalDescription();
      this.emitDescription();
    } catch (error) {
      console.warn('[peerboard] negotiation failed', error);
    } finally {
      this.makingOffer = false;
    }
  }

  private async applySignal(data: SignalData): Promise<void> {
    if (this._state === 'closed') return;

    if (data.kind === 'description') {
      const { description } = data;
      const readyForOffer =
        !this.makingOffer &&
        (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
      const offerCollision = description.type === 'offer' && !readyForOffer;

      this.ignoreOffer = !this.polite && offerCollision;
      if (this.ignoreOffer) return;

      this.isSettingRemoteAnswerPending = description.type === 'answer';
      // For the polite peer, setRemoteDescription(offer) implicitly rolls back its own offer.
      await this.pc.setRemoteDescription(description);
      this.isSettingRemoteAnswerPending = false;

      if (description.type === 'offer') {
        await this.pc.setLocalDescription();
        this.emitDescription();
      }
      return;
    }

    try {
      await this.pc.addIceCandidate(data.candidate);
    } catch (error) {
      // Candidates belonging to an offer we deliberately ignored are expected to fail.
      if (!this.ignoreOffer) throw error;
    }
  }

  private emitDescription(): void {
    const local = this.pc.localDescription;
    if (local && (local.type === 'offer' || local.type === 'answer')) {
      this.emit('signal', {
        kind: 'description',
        description: { type: local.type, sdp: local.sdp },
      });
    }
  }

  private handleConnectionState(): void {
    clearTimeout(this.disconnectTimer);
    switch (this.pc.connectionState) {
      case 'connected':
        if (this.isOpen) this.setState('connected');
        break;
      case 'disconnected':
        // Often transient (Wi-Fi handover); give ICE a moment to recover before restarting.
        this.setState('disconnected');
        this.disconnectTimer = setTimeout(() => this.restartIce(), DISCONNECTED_GRACE_MS);
        break;
      case 'failed':
        this.restartIce();
        break;
      default:
        break;
    }
  }

  private restartIce(): void {
    if (this.iceRestarts >= MAX_ICE_RESTARTS) {
      this.setState('failed');
      return;
    }
    this.iceRestarts += 1;
    this.setState('connecting');
    // Triggers negotiationneeded with an ICE-restart offer, handled by perfect negotiation.
    this.pc.restartIce();
  }

  private setState(state: PeerConnectionState): void {
    if (state === this._state || this._state === 'closed') return;
    this._state = state;
    this.emit('state', state);
  }
}
