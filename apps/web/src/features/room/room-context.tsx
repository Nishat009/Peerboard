'use client';

import type { PeerInfo, ProviderStatus } from '@peerboard/provider';
import { createContext, use, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useAwarenessSelector } from '@/lib/hooks';
import { saveUser, type LocalUser } from '@/lib/identity';
import type { Participant, PresenceState } from './types';
import type { RoomSession } from './use-room-session';

const RoomContext = createContext<RoomSession | null>(null);

export const RoomProvider = RoomContext.Provider;

export function useRoom(): RoomSession {
  const session = use(RoomContext);
  if (!session) throw new Error('useRoom must be used inside <RoomProvider>');
  return session;
}

export function useProviderStatus(): ProviderStatus {
  const { provider } = useRoom();
  return useSyncExternalStore(
    useCallback((notify) => provider.on('status', notify), [provider]),
    () => provider.status,
    () => provider.status,
  );
}

export function useLastSyncedAt(): number | null {
  const { provider } = useRoom();
  return useSyncExternalStore(
    useCallback((notify) => provider.on('synced', notify), [provider]),
    () => provider.lastSyncedAt,
    () => null,
  );
}

export function usePeers(): PeerInfo[] {
  const { provider } = useRoom();
  const [peers, setPeers] = useState<PeerInfo[]>(() => provider.peers);
  useEffect(() => {
    setPeers(provider.peers);
    return provider.on('peers', setPeers);
  }, [provider]);
  return peers;
}

const sameParticipants = (a: Participant[], b: Participant[]) =>
  a.length === b.length &&
  a.every(
    (p, i) =>
      p.clientId === b[i]!.clientId &&
      p.user.name === b[i]!.user.name &&
      p.user.color === b[i]!.user.color &&
      p.peerId === b[i]!.peerId,
  );

/** Everyone in the room, self first. Ignores cursor-only changes to avoid needless renders. */
export function useParticipants(): Participant[] {
  const { awareness } = useRoom();
  return useAwarenessSelector(
    awareness,
    (states, selfId) =>
      [...states.entries()]
        .flatMap(([clientId, raw]) => {
          const state = raw as PresenceState;
          return state.user
            ? [{ clientId, isSelf: clientId === selfId, user: state.user, peerId: state.peerId }]
            : [];
        })
        .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.clientId - b.clientId),
    sameParticipants,
  );
}

export function useLocalUser(): [LocalUser, (user: LocalUser) => void] {
  const { awareness } = useRoom();
  const user = useAwarenessSelector(
    awareness,
    (states, selfId) => (states.get(selfId) as PresenceState | undefined)?.user,
  ) ?? { name: 'Anonymous', color: '#64748b' };

  const setUser = useCallback(
    (next: LocalUser) => {
      saveUser(next);
      awareness.setLocalStateField('user', next);
    },
    [awareness],
  );
  return [user, setUser];
}
