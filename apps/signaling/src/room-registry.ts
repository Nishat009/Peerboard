import type { JoinRoomError } from '@peerboard/shared';

type Membership = { roomId: string; peerId: string };

export type JoinResult =
  { ok: true; peers: string[]; replacedSocketId?: string } | { ok: false; error: JoinRoomError };

/**
 * Pure in-memory room bookkeeping. Holds membership only, never document data.
 * Kept free of Socket.IO so it can be unit tested in isolation.
 */
export class RoomRegistry {
  /** roomId -> (peerId -> socketId) */
  private readonly rooms = new Map<string, Map<string, string>>();
  private readonly bySocket = new Map<string, Membership>();

  constructor(private readonly maxPeers: number) {}

  join(socketId: string, roomId: string, peerId: string): JoinResult {
    if (this.bySocket.has(socketId)) return { ok: false, error: 'already-joined' };

    const room = this.rooms.get(roomId) ?? new Map<string, string>();
    // Same peerId on a new socket = client reconnected before the old socket timed out.
    const replacedSocketId = room.get(peerId);
    if (!replacedSocketId && room.size >= this.maxPeers) return { ok: false, error: 'room-full' };

    if (replacedSocketId) this.bySocket.delete(replacedSocketId);
    const peers = [...room.keys()].filter((id) => id !== peerId);

    room.set(peerId, socketId);
    this.rooms.set(roomId, room);
    this.bySocket.set(socketId, { roomId, peerId });

    return replacedSocketId ? { ok: true, peers, replacedSocketId } : { ok: true, peers };
  }

  leave(socketId: string): Membership | null {
    const membership = this.bySocket.get(socketId);
    if (!membership) return null;
    this.bySocket.delete(socketId);

    const room = this.rooms.get(membership.roomId);
    if (room?.get(membership.peerId) === socketId) {
      room.delete(membership.peerId);
      if (room.size === 0) this.rooms.delete(membership.roomId);
    }
    return membership;
  }

  membershipOf(socketId: string): Membership | null {
    return this.bySocket.get(socketId) ?? null;
  }

  /** Resolves a target peer's socket, but only if it shares a room with the sender. */
  resolvePeer(fromSocketId: string, targetPeerId: string): string | null {
    const membership = this.bySocket.get(fromSocketId);
    if (!membership) return null;
    return this.rooms.get(membership.roomId)?.get(targetPeerId) ?? null;
  }

  roomSize(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
