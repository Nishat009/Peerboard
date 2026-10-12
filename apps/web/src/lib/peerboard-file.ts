import * as Y from 'yjs';

/**
 * `.peerboard` file: [magic "PBRD"][format version][Yjs state update].
 * Importing merges into the live document (CRDT merge), so it is safe even in a busy room,
 * and it is the recovery path when every peer has left and local storage was cleared.
 */
const MAGIC = new Uint8Array([0x50, 0x42, 0x52, 0x44]);
const VERSION = 1;

export function exportDoc(doc: Y.Doc): Blob {
  const update = Y.encodeStateAsUpdate(doc);
  const out = new Uint8Array(MAGIC.length + 1 + update.byteLength);
  out.set(MAGIC);
  out[MAGIC.length] = VERSION;
  out.set(update, MAGIC.length + 1);
  return new Blob([out], { type: 'application/octet-stream' });
}

export async function importDoc(doc: Y.Doc, file: Blob): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = MAGIC.every((b, i) => bytes[i] === b) && bytes[MAGIC.length] === VERSION;
  if (!valid) throw new Error('Not a PeerBoard file');
  Y.applyUpdate(doc, bytes.subarray(MAGIC.length + 1));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
