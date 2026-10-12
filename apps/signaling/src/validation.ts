import {
  MAX_SIGNAL_BYTES,
  PEER_ID_PATTERN,
  ROOM_ID_PATTERN,
  type JoinRoomRequest,
  type OutgoingSignal,
} from '@peerboard/shared';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function isJoinRoomRequest(v: unknown): v is JoinRoomRequest {
  return (
    isObject(v) &&
    typeof v.roomId === 'string' &&
    typeof v.peerId === 'string' &&
    ROOM_ID_PATTERN.test(v.roomId) &&
    PEER_ID_PATTERN.test(v.peerId)
  );
}

/**
 * Structural check only. SDP/ICE are opaque to the server; we verify shape and size
 * so the relay cannot be abused as a generic message bus.
 */
export function isOutgoingSignal(v: unknown): v is OutgoingSignal {
  if (!isObject(v) || typeof v.to !== 'string' || !PEER_ID_PATTERN.test(v.to)) return false;
  const data = v.data;
  if (!isObject(data)) return false;

  if (data.kind === 'description') {
    const d = data.description;
    if (!isObject(d) || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string') {
      return false;
    }
  } else if (data.kind === 'candidate') {
    const c = data.candidate;
    if (!isObject(c) || typeof c.candidate !== 'string') return false;
  } else {
    return false;
  }

  return JSON.stringify(data).length <= MAX_SIGNAL_BYTES;
}
