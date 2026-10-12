import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateRoomKey, importRoomKey } from '../src/crypto';

describe('room crypto', () => {
  it('round-trips data with the same key and context', async () => {
    const key = await importRoomKey(generateRoomKey());
    const data = new TextEncoder().encode('secret board');
    const sealed = await encrypt(key, data, 'ctx');
    expect(sealed).not.toEqual(data);
    expect(await decrypt(key, sealed, 'ctx')).toEqual(data);
  });

  it('uses a fresh IV per message', async () => {
    const key = await importRoomKey(generateRoomKey());
    const data = new Uint8Array([1, 2, 3]);
    const [x, y] = await Promise.all([encrypt(key, data, 'ctx'), encrypt(key, data, 'ctx')]);
    expect(x).not.toEqual(y);
  });

  it('rejects a wrong key, a wrong context, or tampered data', async () => {
    const key = await importRoomKey(generateRoomKey());
    const other = await importRoomKey(generateRoomKey());
    const sealed = await encrypt(key, new Uint8Array([1, 2, 3]), 'room-a');

    expect(await decrypt(other, sealed, 'room-a')).toBeNull();
    expect(await decrypt(key, sealed, 'room-b')).toBeNull();
    const tampered = sealed.slice();
    tampered[tampered.length - 1]! ^= 1;
    expect(await decrypt(key, tampered, 'room-a')).toBeNull();
  });

  it('refuses malformed keys', async () => {
    await expect(importRoomKey('too-short')).rejects.toThrow();
  });

  it('encodes keys as URL-safe base64 of 256 bits', () => {
    const encoded = generateRoomKey();
    expect(encoded).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
