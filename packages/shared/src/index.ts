/**
 * Wire contract between the signaling server and the browser client.
 * The server only ever sees these shapes: room membership and opaque SDP/ICE blobs.
 * No document content is part of this contract, by design.
 */

/** Full-mesh WebRTC cost grows O(n^2); beyond ~6 peers upstream bandwidth becomes the bottleneck. */
export const MAX_PEERS_PER_ROOM = 6;

export const ROOM_ID_LENGTH = 21;
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;
export const PEER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Upper bound for one relayed signal (an SDP with many candidates is ~10KB). */
export const MAX_SIGNAL_BYTES = 64 * 1024;

export type SessionDescription = { type: 'offer' | 'answer'; sdp: string };

export type IceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
};

export type SignalData =
  | { kind: 'description'; description: SessionDescription }
  | { kind: 'candidate'; candidate: IceCandidate };

export type JoinRoomRequest = { roomId: string; peerId: string };

export type JoinRoomError = 'invalid-request' | 'room-full' | 'rate-limited' | 'already-joined';

export type JoinRoomResponse =
  { ok: true; peers: string[]; maxPeers: number } | { ok: false; error: JoinRoomError };

export type OutgoingSignal = { to: string; data: SignalData };
export type IncomingSignal = { from: string; data: SignalData };

export interface ClientToServerEvents {
  'join-room': (req: JoinRoomRequest, ack: (res: JoinRoomResponse) => void) => void;
  'leave-room': () => void;
  signal: (msg: OutgoingSignal) => void;
}

export interface ServerToClientEvents {
  'peer-joined': (payload: { peerId: string }) => void;
  'peer-left': (payload: { peerId: string }) => void;
  signal: (msg: IncomingSignal) => void;
  'server-error': (payload: { code: 'rate-limited' | 'invalid-signal' | 'unknown-peer' }) => void;
}

export type IceServersResponse = {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  /** Unix seconds when TURN credentials expire; absent when only STUN is offered. */
  expiresAt?: number;
};
