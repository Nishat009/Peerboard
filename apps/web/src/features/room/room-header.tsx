'use client';

import { FileText, Lock, PanelRight, Presentation, SquareSplitHorizontal } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Logo } from '@/components/ui/logo';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AvatarStack } from './avatar-stack';
import { ConnectionStatus } from './connection-status';
import { useRoom } from './room-context';
import { RoomMenu } from './room-menu';
import { ShareButton } from './share-button';
import type { ViewMode } from './types';

const VIEW_OPTIONS = [
  {
    value: 'board' as const,
    label: 'Board',
    icon: <Presentation className="size-4" aria-hidden />,
  },
  { value: 'notes' as const, label: 'Notes', icon: <FileText className="size-4" aria-hidden /> },
  {
    value: 'split' as const,
    label: 'Split',
    icon: <SquareSplitHorizontal className="size-4" aria-hidden />,
  },
];

export function RoomHeader({
  view,
  onViewChange,
  panelOpen,
  onTogglePanel,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const { roomId, provider } = useRoom();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
      <Logo compact />
      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <span className="truncate font-mono text-sm text-slate-600" title={roomId}>
          {roomId.slice(0, 8)}
        </span>
        {provider.encrypted && (
          <Lock className="size-3.5 text-emerald-600" aria-label="End-to-end encrypted" />
        )}
      </div>

      <div className="flex flex-1 justify-center">
        <SegmentedControl
          label="View"
          value={view}
          options={VIEW_OPTIONS}
          onChange={onViewChange}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden lg:inline">
          <ConnectionStatus />
        </span>
        <AvatarStack />
        <ShareButton />
        <IconButton
          label={panelOpen ? 'Hide room details' : 'Show room details'}
          active={panelOpen}
          onClick={onTogglePanel}
        >
          <PanelRight className="size-4" />
        </IconButton>
        <RoomMenu />
      </div>
    </header>
  );
}
