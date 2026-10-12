/**
 * Reproducible micro-benchmarks for the sync layer (no network).
 * Run: pnpm bench
 *
 * Network latency between real browsers is measured in-app (presence panel shows per-peer RTT)
 * and by the Playwright e2e suite; see README "Benchmarks".
 */
import * as Y from 'yjs';
import { encrypt, generateRoomKey, importRoomKey } from '../src/crypto';
import { encodeUpdate } from '../src/protocol';
import { SimNetwork } from '../test/network';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!;
const fmt = (n: number, d = 2) => n.toFixed(d);
const kb = (bytes: number) => `${fmt(bytes / 1024, 1)} KB`;

function table(title: string, head: string[], rows: Array<Array<string | number>>) {
  console.log(`\n### ${title}\n`);
  console.log(`| ${head.join(' | ')} |`);
  console.log(`| ${head.map(() => '---').join(' | ')} |`);
  rows.forEach((r) => console.log(`| ${r.join(' | ')} |`));
}

/** Time from a local edit until every peer applied it, through encode/decode/apply. */
function fanOutLatency(peerCount: number, iterations = 300) {
  const net = new SimNetwork();
  const peers = Array.from({ length: peerCount }, (_, i) => net.addPeer(`p${i}`));
  net.connectAll();
  net.flush();

  const shapes = peers[0]!.doc.getMap('shapes');
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    shapes.set(`s${i}`, { type: 'rect', x: i, y: i, w: 100, h: 60, stroke: '#1f2937' });
    net.flush();
    samples.push(performance.now() - t0);
  }
  const converged = peers.every((p) => p.doc.getMap('shapes').size === iterations);
  net.destroy();
  return { median: median(samples), p95: p95(samples), converged };
}

/** Incremental update size stays tiny while the full document grows. */
function updateVsDocSize() {
  const rows: Array<Array<string | number>> = [];
  for (const shapeCount of [100, 1_000, 5_000]) {
    const doc = new Y.Doc();
    const shapes = doc.getMap('shapes');
    doc.transact(() => {
      for (let i = 0; i < shapeCount; i++) {
        shapes.set(`s${i}`, { type: 'rect', x: i, y: i, w: 100, h: 60, stroke: '#1f2937' });
      }
    });
    let lastUpdate = 0;
    doc.on('update', (u: Uint8Array) => (lastUpdate = encodeUpdate(u).byteLength));
    shapes.set('s0', { type: 'rect', x: 5, y: 5, w: 100, h: 60, stroke: '#1f2937' });
    rows.push([shapeCount, kb(Y.encodeStateAsUpdate(doc).byteLength), `${lastUpdate} B`]);
    doc.destroy();
  }
  return rows;
}

async function encryptionOverhead() {
  const key = await importRoomKey(generateRoomKey());
  const rows: Array<Array<string | number>> = [];
  for (const size of [64, 1_024, 64 * 1024]) {
    const data = crypto.getRandomValues(new Uint8Array(Math.min(size, 65_536)));
    const samples: number[] = [];
    for (let i = 0; i < 500; i++) {
      const t0 = performance.now();
      await encrypt(key, data, 'bench');
      samples.push(performance.now() - t0);
    }
    rows.push([`${size} B`, fmt(median(samples), 3), '+28 B']);
  }
  return rows;
}

table(
  'Sync fan-out (in-process, encode + apply on every peer)',
  ['Peers', 'Median (ms)', 'p95 (ms)', 'Converged'],
  [2, 3, 5].map((n) => {
    const r = fanOutLatency(n);
    return [n, fmt(r.median, 3), fmt(r.p95, 3), r.converged ? 'yes' : 'NO'];
  }),
);

table('Update size vs document size', ['Shapes', 'Full doc', 'One shape edit'], updateVsDocSize());

table(
  'AES-GCM frame encryption',
  ['Frame', 'Median (ms)', 'Size overhead'],
  await encryptionOverhead(),
);
