'use client';

import { Minus, Plus } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

export function ZoomControls({
  scale,
  onZoom,
  onReset,
}: {
  scale: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm [&_svg]:size-4">
      <IconButton size="sm" label="Zoom out" onClick={() => onZoom(1 / 1.2)}>
        <Minus />
      </IconButton>
      <button
        type="button"
        onClick={onReset}
        title="Reset zoom"
        className="h-7 min-w-14 rounded-md px-1 text-xs font-medium text-slate-700 tabular-nums hover:bg-slate-100"
      >
        {Math.round(scale * 100)}%
      </button>
      <IconButton size="sm" label="Zoom in" onClick={() => onZoom(1.2)}>
        <Plus />
      </IconButton>
    </div>
  );
}
