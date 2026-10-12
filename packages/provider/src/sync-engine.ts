import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';
import { Emitter } from './emitter';
import {
  MessageType,
  encodeAwareness,
  encodePing,
  encodePong,
  encodeSyncStep1,
  encodeUpdate,
} from './protocol';

/** Anything that can move opaque frames to peers: WebRTC data channels, or an in-memory bus in tests. */
export interface FrameTransport {
  send(peerId: string, frame: Uint8Array): void;
  broadcast(frame: Uint8Array): void;
}

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

type SyncEngineEvents = {
  /** A peer delivered its state (sync step 2) or a live update. */
  synced: (peerId: string) => void;
  rtt: (peerId: string, ms: number) => void;
};

/** Per-peer protocol state. Also used as the Yjs transaction origin for that peer's updates. */
class PeerSession {
  /** Awareness client ids this peer has told us about, cleaned up when it leaves. */
  readonly clientIds = new Set<number>();
  constructor(readonly peerId: string) {}
}

/**
 * Transport-agnostic Yjs sync over y-protocols:
 *  1. on connect each side sends SyncStep1 (its state vector)
 *  2. the other side answers with SyncStep2 (exactly the updates the sender is missing)
 *  3. afterwards every local update is broadcast incrementally
 * Late joiners therefore receive the full state from whichever peer they connect to first.
 */
export class SyncEngine extends Emitter<SyncEngineEvents> {
  private readonly sessions = new Map<string, PeerSession>();

  constructor(
    readonly doc: Y.Doc,
    readonly awareness: awarenessProtocol.Awareness,
    private readonly transport: FrameTransport,
    private readonly now: () => number = () => performance.now(),
  ) {
    super();
    doc.on('update', this.handleDocUpdate);
    awareness.on('update', this.handleAwarenessUpdate);
  }

  get peerIds(): string[] {
    return [...this.sessions.keys()];
  }

  addPeer(peerId: string): void {
    if (this.sessions.has(peerId)) return;
    this.sessions.set(peerId, new PeerSession(peerId));
    this.transport.send(peerId, encodeSyncStep1(this.doc));
    if (this.awareness.getLocalState() !== null) {
      this.transport.send(peerId, encodeAwareness(this.awareness, [this.doc.clientID]));
    }
  }

  removePeer(peerId: string): void {
    const session = this.sessions.get(peerId);
    if (!session) return;
    this.sessions.delete(peerId);
    awarenessProtocol.removeAwarenessStates(this.awareness, [...session.clientIds], session);
  }

  receive(peerId: string, frame: Uint8Array): void {
    const session = this.sessions.get(peerId);
    if (!session) return;
    const decoder = decoding.createDecoder(frame);

    switch (decoding.readVarUint(decoder)) {
      case MessageType.Sync: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.Sync);
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, session);
        if (encoding.length(encoder) > 1)
          this.transport.send(peerId, encoding.toUint8Array(encoder));
        if (syncType !== syncProtocol.messageYjsSyncStep1) this.emit('synced', peerId);
        break;
      }
      case MessageType.Awareness:
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          session,
        );
        break;
      case MessageType.Ping:
        this.transport.send(peerId, encodePong(decoding.readFloat64(decoder)));
        break;
      case MessageType.Pong:
        this.emit('rtt', peerId, this.now() - decoding.readFloat64(decoder));
        break;
      default:
        // Unknown types are ignored so newer clients can add messages without breaking older ones.
        break;
    }
  }

  ping(): void {
    if (this.sessions.size > 0) this.transport.broadcast(encodePing(this.now()));
  }

  destroy(): void {
    for (const peerId of [...this.sessions.keys()]) this.removePeer(peerId);
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.removeAllListeners();
  }

  /**
   * Updates that came from a peer are not re-broadcast: in a full mesh every peer already
   * receives them directly from the author, so relaying would only multiply traffic.
   */
  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin instanceof PeerSession || this.sessions.size === 0) return;
    this.transport.broadcast(encodeUpdate(update));
  };

  private readonly handleAwarenessUpdate = (change: AwarenessChange, origin: unknown) => {
    if (origin instanceof PeerSession) {
      change.added.forEach((id) => origin.clientIds.add(id));
      change.updated.forEach((id) => origin.clientIds.add(id));
      change.removed.forEach((id) => origin.clientIds.delete(id));
      return;
    }
    if (this.sessions.size === 0) return;
    const changed = [...change.added, ...change.updated, ...change.removed];
    this.transport.broadcast(encodeAwareness(this.awareness, changed));
  };
}
