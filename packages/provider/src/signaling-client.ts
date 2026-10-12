import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  IncomingSignal,
  JoinRoomError,
  ServerToClientEvents,
  SignalData,
} from '@peerboard/shared';
import { Emitter } from './emitter';

export type SignalingStatus = 'connecting' | 'connected' | 'disconnected';

type SignalingEvents = {
  status: (status: SignalingStatus) => void;
  /** Fired after every successful (re)join with the peers already in the room. */
  joined: (peers: string[]) => void;
  'peer-joined': (peerId: string) => void;
  'peer-left': (peerId: string) => void;
  signal: (msg: IncomingSignal) => void;
  'join-error': (error: JoinRoomError) => void;
};

/**
 * Thin typed wrapper over Socket.IO. Reconnection uses Socket.IO's exponential backoff with
 * jitter (randomizationFactor), and the room is re-joined automatically after each reconnect.
 * Existing peer-to-peer connections survive signaling outages; only new handshakes need it.
 */
export class SignalingClient extends Emitter<SignalingEvents> {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private _status: SignalingStatus = 'disconnected';

  constructor(
    private readonly url: string,
    readonly roomId: string,
    readonly peerId: string,
  ) {
    super();
  }

  get status(): SignalingStatus {
    return this._status;
  }

  connect(): void {
    if (this.socket) return;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(this.url, {
      transports: ['websocket'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      randomizationFactor: 0.5,
    });
    this.socket = socket;
    this.setStatus('connecting');

    socket.on('connect', () => {
      socket.emit('join-room', { roomId: this.roomId, peerId: this.peerId }, (res) => {
        if (res.ok) {
          this.setStatus('connected');
          this.emit('joined', res.peers);
        } else {
          this.emit('join-error', res.error);
          // A full room or invalid request will not fix itself by retrying.
          if (res.error === 'room-full' || res.error === 'invalid-request') this.disconnect();
        }
      });
    });
    socket.on('disconnect', () => this.setStatus(this.socket ? 'connecting' : 'disconnected'));
    socket.on('peer-joined', ({ peerId }) => this.emit('peer-joined', peerId));
    socket.on('peer-left', ({ peerId }) => this.emit('peer-left', peerId));
    socket.on('signal', (msg) => this.emit('signal', msg));
  }

  send(to: string, data: SignalData): void {
    this.socket?.emit('signal', { to, data });
  }

  disconnect(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    socket.emit('leave-room');
    socket.removeAllListeners();
    socket.disconnect();
    this.setStatus('disconnected');
  }

  destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }

  private setStatus(status: SignalingStatus): void {
    if (status === this._status) return;
    this._status = status;
    this.emit('status', status);
  }
}
