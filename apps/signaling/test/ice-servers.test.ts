import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildIceServers } from '../src/ice-servers';

describe('buildIceServers', () => {
  it('mints time-limited coturn REST credentials from a shared secret', () => {
    const res = buildIceServers(
      { urls: ['turn:turn.example.com:3478'], secret: 's3cret', ttlSeconds: 600 },
      'peer-aaaa',
      1_000,
    );
    const turn = res.iceServers[1]!;
    expect(res.expiresAt).toBe(1_600);
    expect(turn.username).toBe('1600:peer-aaaa');
    expect(turn.credential).toBe(
      createHmac('sha1', 's3cret').update('1600:peer-aaaa').digest('base64'),
    );
  });

  it('falls back to static credentials, then to STUN only', () => {
    const urls = ['turn:turn.example.com:3478'];
    expect(
      buildIceServers({ urls, ttlSeconds: 0, username: 'u', credential: 'c' }, 'peer-aaaa')
        .iceServers[1],
    ).toEqual({ urls, username: 'u', credential: 'c' });
    expect(buildIceServers({ urls: [], ttlSeconds: 0 }, 'peer-aaaa').iceServers).toHaveLength(1);
  });
});
