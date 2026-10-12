import { createHmac } from 'node:crypto';
import type { IceServersResponse } from '@peerboard/shared';
import type { ServerConfig } from './config';

const PUBLIC_STUN = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

/**
 * Builds the ICE server list handed to browsers at runtime, so TURN secrets never ship in the
 * client bundle. With a shared secret we mint short-lived credentials (coturn REST API scheme):
 *   username = "<expiry>:<peerId>", credential = base64(HMAC-SHA1(secret, username))
 */
export function buildIceServers(
  turn: ServerConfig['turn'],
  peerId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): IceServersResponse {
  const iceServers: IceServersResponse['iceServers'] = [{ urls: PUBLIC_STUN }];
  if (turn.urls.length === 0) return { iceServers };

  if (turn.secret) {
    const expiresAt = nowSeconds + turn.ttlSeconds;
    const username = `${expiresAt}:${peerId}`;
    const credential = createHmac('sha1', turn.secret).update(username).digest('base64');
    iceServers.push({ urls: turn.urls, username, credential });
    return { iceServers, expiresAt };
  }

  if (turn.username && turn.credential) {
    iceServers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
  }
  return { iceServers };
}
