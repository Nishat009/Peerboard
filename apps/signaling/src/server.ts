import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  MAX_PEERS_PER_ROOM,
  MAX_SIGNAL_BYTES,
  PEER_ID_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@peerboard/shared';
import type { ServerConfig } from './config';
import { buildIceServers } from './ice-servers';
import { log } from './logger';
import { KeyedRateLimiter, TokenBucket } from './rate-limiter';
import { RoomRegistry } from './room-registry';
import { isJoinRoomRequest, isOutgoingSignal } from './validation';

type PeerSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export type SignalingServerOptions = Pick<ServerConfig, 'corsOrigins' | 'trustProxy' | 'turn'> & {
  maxPeersPerRoom?: number;
};

export function createSignalingServer(options: SignalingServerOptions) {
  const registry = new RoomRegistry(options.maxPeersPerRoom ?? MAX_PEERS_PER_ROOM);
  // Joins and ICE-credential requests are cheap to spam, so both are limited per client IP.
  const joinLimiter = new KeyedRateLimiter(20, 20 / 60);
  const httpLimiter = new KeyedRateLimiter(30, 30 / 60);

  const clientIp = (req: IncomingMessage): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (options.trustProxy && typeof forwarded === 'string') {
      return forwarded.split(',')[0]!.trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  const httpServer = createServer((req, res) => handleHttp(req, res));

  function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && options.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, rooms: registry.roomCount });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ice-servers') {
      if (!httpLimiter.tryRemove(clientIp(req))) return json(res, 429, { error: 'rate-limited' });
      const peerId = url.searchParams.get('peerId') ?? '';
      if (!PEER_ID_PATTERN.test(peerId)) return json(res, 400, { error: 'invalid-peer-id' });
      res.setHeader('Cache-Control', 'no-store');
      return json(res, 200, buildIceServers(options.turn, peerId));
    }

    // Socket.IO attaches its own request listener for /socket.io/; everything else is a 404.
    if (!url.pathname.startsWith('/socket.io/')) json(res, 404, { error: 'not-found' });
  }

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: options.corsOrigins },
    maxHttpBufferSize: MAX_SIGNAL_BYTES,
    serveClient: false,
  });

  io.on('connection', (socket: PeerSocket) => {
    const ip = clientIp(socket.request);
    const signalBucket = new TokenBucket(120, 40);

    socket.on('join-room', (req, ack) => {
      if (typeof ack !== 'function') return;
      if (!joinLimiter.tryRemove(ip)) return ack({ ok: false, error: 'rate-limited' });
      if (!isJoinRoomRequest(req)) return ack({ ok: false, error: 'invalid-request' });

      const result = registry.join(socket.id, req.roomId, req.peerId);
      if (!result.ok) {
        log.warn('join.rejected', { reason: result.error, size: registry.roomSize(req.roomId) });
        return ack(result);
      }

      if (result.replacedSocketId) {
        io.sockets.sockets.get(result.replacedSocketId)?.disconnect(true);
      }
      void socket.join(req.roomId);
      socket.to(req.roomId).emit('peer-joined', { peerId: req.peerId });
      ack({
        ok: true,
        peers: result.peers,
        maxPeers: options.maxPeersPerRoom ?? MAX_PEERS_PER_ROOM,
      });
      log.info('join', { size: registry.roomSize(req.roomId) });
    });

    socket.on('signal', (msg) => {
      if (!signalBucket.tryRemove())
        return void socket.emit('server-error', { code: 'rate-limited' });
      if (!isOutgoingSignal(msg))
        return void socket.emit('server-error', { code: 'invalid-signal' });

      const from = registry.membershipOf(socket.id);
      const target = registry.resolvePeer(socket.id, msg.to);
      if (!from || !target) return void socket.emit('server-error', { code: 'unknown-peer' });

      // Opaque relay: the payload is forwarded untouched and never inspected or stored.
      io.to(target).emit('signal', { from: from.peerId, data: msg.data });
    });

    const leave = () => {
      const membership = registry.leave(socket.id);
      if (!membership) return;
      void socket.leave(membership.roomId);
      socket.to(membership.roomId).emit('peer-left', { peerId: membership.peerId });
      log.info('leave', { size: registry.roomSize(membership.roomId) });
    };

    socket.on('leave-room', leave);
    socket.on('disconnect', leave);
  });

  const sweepTimer = setInterval(() => {
    joinLimiter.sweep();
    httpLimiter.sweep();
  }, 60_000);
  sweepTimer.unref();

  return {
    httpServer,
    io,
    registry,
    listen(port: number): Promise<number> {
      return new Promise((resolve) => {
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    async close(): Promise<void> {
      clearInterval(sweepTimer);
      await io.close();
    },
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
