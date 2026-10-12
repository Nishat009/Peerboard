import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { SyncEngine, type FrameTransport } from '../src/sync-engine';

/** Deterministic PRNG (mulberry32) so failing seeds can be replayed. */
export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (max: number) => Math.floor(next() * max) };
}

export type SimPeer = { id: string; doc: Y.Doc; awareness: Awareness; engine: SyncEngine };

/**
 * In-memory stand-in for the WebRTC mesh. Each directed link is a FIFO queue, matching an
 * ordered data channel, while delivery across links is interleaved randomly.
 */
export class SimNetwork {
  readonly peers = new Map<string, SimPeer>();
  private readonly links = new Map<string, Uint8Array[]>();
  /** Total bytes ever queued per directed link, e.g. `linkBytes.get('a>b')`. */
  readonly linkBytes = new Map<string, number>();
  bytesSent = 0;

  addPeer(id: string): SimPeer {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const transport: FrameTransport = {
      send: (to, frame) => this.push(id, to, frame),
      broadcast: (frame) => engine.peerIds.forEach((to) => this.push(id, to, frame)),
    };
    const engine = new SyncEngine(doc, awareness, transport);
    const peer = { id, doc, awareness, engine };
    this.peers.set(id, peer);
    return peer;
  }

  connect(a: string, b: string): void {
    this.links.set(`${a}>${b}`, []);
    this.links.set(`${b}>${a}`, []);
    this.get(a).engine.addPeer(b);
    this.get(b).engine.addPeer(a);
  }

  disconnect(a: string, b: string): void {
    this.links.delete(`${a}>${b}`);
    this.links.delete(`${b}>${a}`);
    this.get(a).engine.removePeer(b);
    this.get(b).engine.removePeer(a);
  }

  connectAll(): void {
    const ids = [...this.peers.keys()];
    ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => this.connect(a, b)));
  }

  /** Delivers one pending frame from a randomly chosen link. Returns false when idle. */
  deliverOne(rand: () => number = Math.random): boolean {
    const pending = [...this.links].filter(([, queue]) => queue.length > 0);
    if (pending.length === 0) return false;
    const [key, queue] = pending[Math.floor(rand() * pending.length)]!;
    const [from, to] = key.split('>') as [string, string];
    this.get(to).engine.receive(from, queue.shift()!);
    return true;
  }

  flush(rand?: () => number): void {
    while (this.deliverOne(rand));
  }

  destroy(): void {
    this.peers.forEach((p) => {
      p.engine.destroy();
      p.awareness.destroy();
      p.doc.destroy();
    });
  }

  private get(id: string): SimPeer {
    const peer = this.peers.get(id);
    if (!peer) throw new Error(`unknown peer ${id}`);
    return peer;
  }

  private push(from: string, to: string, frame: Uint8Array): void {
    const queue = this.links.get(`${from}>${to}`);
    if (!queue) return; // link down: frame lost, like a closed data channel
    const key = `${from}>${to}`;
    this.bytesSent += frame.byteLength;
    this.linkBytes.set(key, (this.linkBytes.get(key) ?? 0) + frame.byteLength);
    queue.push(frame);
  }
}

export const snapshot = (doc: Y.Doc) => ({
  map: doc.getMap('map').toJSON(),
  text: doc.getText('text').toString(),
  list: doc.getArray('list').toJSON(),
});
