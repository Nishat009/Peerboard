import { generateRoomKey } from '@peerboard/provider/crypto';
import { nanoid } from 'nanoid';

/**
 * A room link is `/room/<id>#key=<base64url>`. The id routes signaling; the key, kept in the
 * fragment, never reaches any server (browsers do not send fragments in requests).
 */
export function createRoomPath(): string {
  return `/room/${nanoid()}#key=${generateRoomKey()}`;
}

export function readKeyFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('key');
}
