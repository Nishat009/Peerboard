'use client';

import { KeyRound, LoaderCircle, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { buttonStyles } from '@/components/ui/button';
import { FullPageMessage } from '@/components/ui/full-page-message';
import { cx } from '@/lib/cx';
import { ConnectionStatus } from './connection-status';
import { PresencePanel } from './presence-panel';
import { RoomProvider, useProviderStatus } from './room-context';
import { RoomHeader } from './room-header';
import type { ViewMode } from './types';
import { useRoomSession } from './use-room-session';

// Each surface is its own chunk: opening Notes never downloads Konva, and vice versa.
const Whiteboard = dynamic(() => import('@/features/whiteboard/whiteboard'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-canvas" />,
});
const NotesEditor = dynamic(() => import('@/features/notes/notes-editor'), {
  ssr: false,
  loading: () => <div className="flex-1 bg-white" />,
});

function Workspace() {
  const status = useProviderStatus();
  const [view, setView] = useState<ViewMode>('board');
  // Client-only component, so reading the viewport during init is safe. On small screens the
  // panel overlays the canvas, so it starts closed there.
  const [panelOpen, setPanelOpen] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  );

  if (status === 'room-full') {
    return (
      <FullPageMessage
        icon={<Users className="size-5" />}
        title="This room is full"
        actions={
          <Link href="/" className={buttonStyles('primary')}>
            Create a new room
          </Link>
        }
      >
        Rooms are limited to 6 people because every peer connects directly to every other peer.
      </FullPageMessage>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <RoomHeader
        view={view}
        onViewChange={setView}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />
      <div className="relative flex min-h-0 flex-1">
        <main
          className={cx('flex min-w-0 flex-1', view === 'split' && 'divide-x divide-slate-200')}
        >
          {view !== 'notes' && <Whiteboard />}
          {view !== 'board' && <NotesEditor />}
        </main>
        {panelOpen && (
          <PresencePanel className="absolute inset-y-0 right-0 z-20 shadow-lg lg:static lg:shadow-none" />
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 lg:hidden">
          <ConnectionStatus />
        </div>
      </div>
    </div>
  );
}

export default function RoomWorkspace({ roomId }: { roomId: string }) {
  const state = useRoomSession(roomId);

  switch (state.status) {
    case 'loading':
      return (
        <FullPageMessage
          icon={<LoaderCircle className="size-5 animate-spin" />}
          title="Opening room…"
        />
      );
    case 'missing-key':
    case 'invalid-key':
      return (
        <FullPageMessage
          icon={<KeyRound className="size-5" />}
          title={
            state.status === 'missing-key'
              ? 'This link is missing its key'
              : 'This link has an invalid key'
          }
          actions={
            <Link href="/" className={buttonStyles('primary')}>
              Create a new room
            </Link>
          }
        >
          Rooms are end-to-end encrypted. The key lives after the <code>#</code> in the invite link,
          so ask for the complete link.
        </FullPageMessage>
      );
    case 'ready':
      return (
        <RoomProvider value={state.session}>
          <Workspace />
        </RoomProvider>
      );
  }
}
