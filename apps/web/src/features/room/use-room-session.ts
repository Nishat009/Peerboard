'use client';

import {
  EncryptedIndexedDbPersistence,
  PeerBoardProvider,
  importRoomKey,
} from '@peerboard/provider';
import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { SIGNALING_URL } from '@/lib/env';
import { loadUser } from '@/lib/identity';
import { readKeyFromHash } from '@/lib/room-link';

export type RoomSession = {
  roomId: string;
  doc: Y.Doc;
  provider: PeerBoardProvider;
  persistence: EncryptedIndexedDbPersistence;
  awareness: Awareness;
};

export type RoomSessionState =
  | { status: 'loading' }
  | { status: 'missing-key' }
  | { status: 'invalid-key' }
  | { status: 'ready'; session: RoomSession };

/**
 * Owns the lifecycle of one room: Y.Doc, encrypted local persistence and the P2P provider.
 * Local state is loaded before connecting, so the first sync step only exchanges real deltas
 * and the UI shows the board immediately, even offline.
 */
export function useRoomSession(roomId: string): RoomSessionState {
  const [state, setState] = useState<RoomSessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;

    void (async () => {
      const encodedKey = readKeyFromHash(window.location.hash);
      if (!encodedKey) return setState({ status: 'missing-key' });

      let roomKey: CryptoKey;
      try {
        roomKey = await importRoomKey(encodedKey);
      } catch {
        return setState({ status: 'invalid-key' });
      }
      if (cancelled) return;

      const doc = new Y.Doc();
      const persistence = new EncryptedIndexedDbPersistence(roomId, doc, roomKey);
      const provider = new PeerBoardProvider(doc, {
        roomId,
        roomKey,
        signalingUrl: SIGNALING_URL,
        connect: false,
      });
      provider.awareness.setLocalState({
        user: loadUser(),
        peerId: provider.peerId,
        pointer: null,
      });

      dispose = () => {
        provider.destroy();
        void persistence.destroy();
        doc.destroy();
      };
      setState({
        status: 'ready',
        session: { roomId, doc, provider, persistence, awareness: provider.awareness },
      });

      // IndexedDB can be unavailable (some private modes); collaboration still works without it.
      await persistence.whenSynced.catch(() => undefined);
      if (!cancelled) void provider.connect();
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [roomId]);

  return state;
}
