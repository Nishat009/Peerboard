import * as Y from 'yjs';
import { decrypt, encrypt } from './crypto';
import { Emitter } from './emitter';

const STORE = 'updates';
/** Once this many incremental updates pile up, they are merged into a single snapshot. */
const COMPACT_THRESHOLD = 300;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function openDatabase(name: string): Promise<IDBDatabase> {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
  return request(req);
}

/**
 * Offline-first local persistence, like y-indexeddb but with every stored update sealed with
 * the room key (AES-GCM). Reading another room's database, or the raw IndexedDB files on disk,
 * reveals nothing without the key from the URL fragment.
 *
 * Layout: an append-only log of encrypted Yjs updates, periodically compacted into one
 * snapshot (Yjs garbage-collects deleted content during the merge).
 */
export class EncryptedIndexedDbPersistence extends Emitter<{ synced: () => void }> {
  readonly whenSynced: Promise<void>;
  private readonly db: Promise<IDBDatabase>;
  private readonly dbName: string;
  private writeQueue: Promise<void>;
  private storedCount = 0;
  private destroyed = false;

  constructor(
    roomId: string,
    readonly doc: Y.Doc,
    private readonly key?: CryptoKey,
  ) {
    super();
    this.dbName = `peerboard:${roomId}`;
    this.db = openDatabase(this.dbName);
    this.whenSynced = this.load();
    this.writeQueue = this.whenSynced.catch(() => undefined);
    doc.on('update', this.handleUpdate);
  }

  private get context(): string {
    return `peerboard:idb:${this.dbName}`;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.doc.off('update', this.handleUpdate);
    this.removeAllListeners();
    await this.writeQueue;
    (await this.db).close();
  }

  /** Deletes all locally stored data for this room. */
  async clearData(): Promise<void> {
    await this.destroy();
    await request(indexedDB.deleteDatabase(this.dbName));
  }

  private async load(): Promise<void> {
    const db = await this.db;
    const records = await request(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<Uint8Array[]>,
    );
    const updates = (await Promise.all(records.map((r) => this.open(r)))).filter(
      (u): u is Uint8Array => u !== null,
    );
    if (updates.length > 0) Y.applyUpdate(this.doc, Y.mergeUpdates(updates), this);
    this.storedCount = records.length;
    if (this.storedCount > COMPACT_THRESHOLD) await this.compact();
    this.emit('synced');
  }

  private readonly handleUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed) return;
    this.writeQueue = this.writeQueue
      .then(async () => {
        const db = await this.db;
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(await this.seal(update));
        await transactionDone(tx);
        this.storedCount += 1;
        if (this.storedCount > COMPACT_THRESHOLD) await this.compact();
      })
      .catch((error: unknown) => console.warn('[peerboard] persist failed', error));
  };

  private async compact(): Promise<void> {
    const snapshot = await this.seal(Y.encodeStateAsUpdate(this.doc));
    const db = await this.db;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    store.add(snapshot);
    await transactionDone(tx);
    this.storedCount = 1;
  }

  private seal(update: Uint8Array): Promise<Uint8Array> {
    return this.key ? encrypt(this.key, update, this.context) : Promise.resolve(update);
  }

  private async open(record: Uint8Array): Promise<Uint8Array | null> {
    return this.key ? decrypt(this.key, record, this.context) : record;
  }
}
