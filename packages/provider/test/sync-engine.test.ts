import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { MessageType } from '../src/protocol';
import { SimNetwork, prng, snapshot, type SimPeer } from './network';

let net: SimNetwork;
afterEach(() => net?.destroy());

function randomEdit(peer: SimPeer, rand: ReturnType<typeof prng>): void {
  const { doc } = peer;
  switch (rand.int(5)) {
    case 0:
      doc.getMap('map').set(`k${rand.int(8)}`, `${peer.id}:${rand.int(1000)}`);
      break;
    case 1:
      doc.getMap('map').delete(`k${rand.int(8)}`);
      break;
    case 2: {
      const text = doc.getText('text');
      text.insert(rand.int(text.length + 1), String.fromCharCode(97 + rand.int(26)));
      break;
    }
    case 3: {
      const text = doc.getText('text');
      if (text.length > 0) text.delete(rand.int(text.length), 1);
      break;
    }
    default: {
      const list = doc.getArray<number>('list');
      if (list.length > 0 && rand.next() < 0.3) list.delete(rand.int(list.length), 1);
      else list.insert(rand.int(list.length + 1), [rand.int(100)]);
    }
  }
}

describe('SyncEngine convergence', () => {
  it.each([1, 2, 3, 42, 1337])('converges under random concurrent edits (seed %i)', (seed) => {
    const rand = prng(seed);
    net = new SimNetwork();
    const peers = ['a', 'b', 'c', 'd'].map((id) => net.addPeer(id));
    net.connectAll();

    for (let step = 0; step < 600; step++) {
      // Interleave local edits with partial delivery so many edits are truly concurrent.
      if (rand.next() < 0.6) randomEdit(peers[rand.int(peers.length)]!, rand);
      else net.deliverOne(rand.next);
    }
    net.flush(rand.next);

    const expected = snapshot(peers[0]!.doc);
    peers.forEach((p) => expect(snapshot(p.doc)).toEqual(expected));
    expect(expected.text.length + expected.list.length).toBeGreaterThan(0);
  });

  it('gives a late joiner the full state via sync step 1/2', () => {
    net = new SimNetwork();
    const a = net.addPeer('a');
    const b = net.addPeer('b');
    net.connect('a', 'b');
    a.doc.getText('text').insert(0, 'hello');
    b.doc.getMap('map').set('title', 'board');
    net.flush();

    const late = net.addPeer('late');
    net.connect('late', 'a');
    net.flush();

    expect(snapshot(late.doc)).toEqual(snapshot(a.doc));
    expect(late.doc.getText('text').toString()).toBe('hello');
  });

  it('merges edits made while partitioned once peers reconnect', () => {
    net = new SimNetwork();
    const a = net.addPeer('a');
    const b = net.addPeer('b');
    net.connect('a', 'b');
    a.doc.getText('text').insert(0, 'base');
    net.flush();

    net.disconnect('a', 'b');
    a.doc.getText('text').insert(0, 'A-');
    b.doc.getText('text').insert(4, '-B');
    expect(snapshot(a.doc)).not.toEqual(snapshot(b.doc));

    net.connect('a', 'b');
    net.flush();
    expect(a.doc.getText('text').toString()).toBe('A-base-B');
    expect(snapshot(b.doc)).toEqual(snapshot(a.doc));
  });

  it('does not echo or relay remote updates', () => {
    net = new SimNetwork();
    const a = net.addPeer('a');
    const b = net.addPeer('b');
    net.addPeer('c');
    net.connectAll();
    net.flush();

    const before = new Map(net.linkBytes);
    a.doc.getMap('map').set('x', 1);
    net.flush();
    const delta = (link: string) => (net.linkBytes.get(link) ?? 0) - (before.get(link) ?? 0);

    expect(delta('a>b')).toBeGreaterThan(0);
    expect(delta('a>c')).toBeGreaterThan(0);
    // Receivers neither echo back to the author nor relay to each other.
    expect(delta('b>a') + delta('c>a') + delta('b>c') + delta('c>b')).toBe(0);
    expect(b.doc.getMap('map').get('x')).toBe(1);
  });
});

describe('SyncEngine awareness', () => {
  it('shares presence and removes it when a peer leaves', () => {
    net = new SimNetwork();
    const a = net.addPeer('a');
    const b = net.addPeer('b');
    a.awareness.setLocalStateField('user', { name: 'Brave Otter' });
    net.connect('a', 'b');
    net.flush();

    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({ user: { name: 'Brave Otter' } });

    net.disconnect('a', 'b');
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false);
  });
});

describe('SyncEngine misc', () => {
  it('measures round trip time with ping/pong', () => {
    net = new SimNetwork();
    const a = net.addPeer('a');
    net.addPeer('b');
    net.connect('a', 'b');
    net.flush();

    const rtts: number[] = [];
    a.engine.on('rtt', (_peer, ms) => rtts.push(ms));
    a.engine.ping();
    net.flush();
    expect(rtts).toHaveLength(1);
    expect(rtts[0]).toBeGreaterThanOrEqual(0);
  });

  it('ignores unknown message types for forward compatibility', () => {
    net = new SimNetwork();
    const a = net.addPeer('a');
    net.addPeer('b');
    net.connect('a', 'b');
    expect(() => a.engine.receive('b', new Uint8Array([99, 1, 2]))).not.toThrow();
    expect(MessageType.Sync).toBe(0);
  });

  it('applies the same final state regardless of update arrival order', () => {
    const source = new Y.Doc();
    const updates: Uint8Array[] = [];
    source.on('update', (u: Uint8Array) => updates.push(u));
    for (let i = 0; i < 20; i++) source.getArray('list').insert(0, [i]);

    const reversed = new Y.Doc();
    [...updates].reverse().forEach((u) => Y.applyUpdate(reversed, u));
    expect(reversed.getArray('list').toJSON()).toEqual(source.getArray('list').toJSON());
  });
});
