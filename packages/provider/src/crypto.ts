/**
 * End-to-end encryption helpers (WebCrypto AES-GCM 256).
 * The room key lives in the URL fragment (#key=...), which browsers never send to any server.
 */

const IV_BYTES = 12;
const encoder = new TextEncoder();
/** WebCrypto typings require ArrayBuffer-backed views (TS 5.7+); our buffers always are. */
const buf = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Returns a new random 256-bit key, base64url encoded for use in a URL fragment. */
export function generateRoomKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Imports the fragment key as a non-extractable AES-GCM key. Throws on malformed input. */
export async function importRoomKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded);
  if (raw.byteLength !== 32) throw new Error('Room key must be 256 bits');
  return crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Output layout: [iv (12 bytes)][ciphertext + GCM tag].
 * `context` is bound as additional authenticated data so a frame from one room or purpose
 * (e.g. data channel vs. IndexedDB) cannot be replayed into another.
 */
export async function encrypt(
  key: CryptoKey,
  data: Uint8Array,
  context: string,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    buf(data),
  );
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ciphertext), IV_BYTES);
  return out;
}

/** Returns null when authentication fails (wrong key, tampering, or wrong context). */
export async function decrypt(
  key: CryptoKey,
  data: Uint8Array,
  context: string,
): Promise<Uint8Array | null> {
  if (data.byteLength <= IV_BYTES) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: buf(data.subarray(0, IV_BYTES)),
        additionalData: encoder.encode(context),
      },
      key,
      buf(data.subarray(IV_BYTES)),
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}
