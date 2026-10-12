import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  IncomingSignal,
  JoinRoomResponse,
  ServerToClientEvents,
} from '@peerboard/shared';
import { createSignalingServer } from '../src/server';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const ROOM = 'room-0123456789';
let server: ReturnType<typeof createSignalingServer>;
let url: string;
const clients: Client[] = [];

const client = () => {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
};
const join = (socket: Client, peerId: string, roomId = ROOM) =>
  new Promise<JoinRoomResponse>((resolve) => socket.emit('join-room', { roomId, peerId }, resolve));
const next = <T>(socket: Client, event: keyof ServerToClientEvents) =>
  new Promise<T>((resolve) => socket.once(event, ((payload: T) => resolve(payload)) as never));

beforeEach(async () => {
  server = createSignalingServer({
    corsOrigins: ['http://localhost:3000'],
    trustProxy: false,
    turn: { urls: [], ttlSeconds: 3600 },
    maxPeersPerRoom: 2,
  });
  url = `http://localhost:${await server.listen(0)}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server.close();
});

describe('signaling server', () => {
  it('announces joins and leaves to the room', async () => {
    const a = client();
    const b = client();
    expect(await join(a, 'peer-aaaa')).toMatchObject({ ok: true, peers: [] });

    const joined = next<{ peerId: string }>(a, 'peer-joined');
    expect(await join(b, 'peer-bbbb')).toMatchObject({ ok: true, peers: ['peer-aaaa'] });
    expect(await joined).toEqual({ peerId: 'peer-bbbb' });

    const left = next<{ peerId: string }>(a, 'peer-left');
    b.disconnect();
    expect(await left).toEqual({ peerId: 'peer-bbbb' });
  });

  it('relays signals between peers of the same room only', async () => {
    const a = client();
    const b = client();
    await join(a, 'peer-aaaa');
    await join(b, 'peer-bbbb');

    const received = next<IncomingSignal>(b, 'signal');
    a.emit('signal', {
      to: 'peer-bbbb',
      data: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } },
    });
    expect(await received).toEqual({
      from: 'peer-aaaa',
      data: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } },
    });
  });

  it('rejects malformed signals and unknown targets', async () => {
    const a = client();
    await join(a, 'peer-aaaa');

    const invalid = next<{ code: string }>(a, 'server-error');
    a.emit('signal', { to: 'peer-bbbb', data: { kind: 'chat', text: 'hi' } } as never);
    expect(await invalid).toEqual({ code: 'invalid-signal' });

    const unknown = next<{ code: string }>(a, 'server-error');
    a.emit('signal', {
      to: 'peer-zzzz',
      data: { kind: 'candidate', candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 } },
    });
    expect(await unknown).toEqual({ code: 'unknown-peer' });
  });

  it('enforces the per-room peer limit', async () => {
    await join(client(), 'peer-aaaa');
    await join(client(), 'peer-bbbb');
    expect(await join(client(), 'peer-cccc')).toEqual({ ok: false, error: 'room-full' });
  });

  it('serves STUN-only ICE config when TURN is not configured', async () => {
    const res = await fetch(`${url}/ice-servers?peerId=peer-aaaa`);
    const body = (await res.json()) as { iceServers: unknown[]; expiresAt?: number };
    expect(res.status).toBe(200);
    expect(body.iceServers).toHaveLength(1);
    expect(body.expiresAt).toBeUndefined();
  });
});
