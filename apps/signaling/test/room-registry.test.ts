import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/room-registry';

describe('RoomRegistry', () => {
  it('returns existing peers on join', () => {
    const r = new RoomRegistry(6);
    expect(r.join('s1', 'room', 'peer-aaaa')).toEqual({ ok: true, peers: [] });
    expect(r.join('s2', 'room', 'peer-bbbb')).toEqual({ ok: true, peers: ['peer-aaaa'] });
    expect(r.roomSize('room')).toBe(2);
  });

  it('rejects joins beyond max peers', () => {
    const r = new RoomRegistry(2);
    r.join('s1', 'room', 'peer-aaaa');
    r.join('s2', 'room', 'peer-bbbb');
    expect(r.join('s3', 'room', 'peer-cccc')).toEqual({ ok: false, error: 'room-full' });
  });

  it('rejects a socket joining twice', () => {
    const r = new RoomRegistry(6);
    r.join('s1', 'room', 'peer-aaaa');
    expect(r.join('s1', 'other', 'peer-aaaa')).toEqual({ ok: false, error: 'already-joined' });
  });

  it('replaces a stale socket when the same peer reconnects, even in a full room', () => {
    const r = new RoomRegistry(1);
    r.join('old', 'room', 'peer-aaaa');
    expect(r.join('new', 'room', 'peer-aaaa')).toEqual({
      ok: true,
      peers: [],
      replacedSocketId: 'old',
    });
    // The stale socket's later disconnect must not evict the fresh one.
    expect(r.leave('old')).toBeNull();
    expect(r.roomSize('room')).toBe(1);
  });

  it('cleans up empty rooms on leave', () => {
    const r = new RoomRegistry(6);
    r.join('s1', 'room', 'peer-aaaa');
    expect(r.leave('s1')).toEqual({ roomId: 'room', peerId: 'peer-aaaa' });
    expect(r.roomCount).toBe(0);
    expect(r.leave('s1')).toBeNull();
  });

  it('only resolves peers inside the sender room', () => {
    const r = new RoomRegistry(6);
    r.join('s1', 'room-a', 'peer-aaaa');
    r.join('s2', 'room-a', 'peer-bbbb');
    r.join('s3', 'room-b', 'peer-cccc');
    expect(r.resolvePeer('s1', 'peer-bbbb')).toBe('s2');
    expect(r.resolvePeer('s1', 'peer-cccc')).toBeNull();
    expect(r.resolvePeer('unknown', 'peer-bbbb')).toBeNull();
  });
});
