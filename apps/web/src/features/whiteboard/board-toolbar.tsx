'use client';

import {
  ArrowUpRight,
  Circle,
  Hand,
  ImageDown,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Divider } from '@/components/ui/divider';
import { IconButton } from '@/components/ui/icon-button';
import { cx } from '@/lib/cx';
import { STROKE_COLORS, STROKE_WIDTHS, type Tool } from './model';

export const TOOLS: Array<{ tool: Tool; label: string; key: string; icon: ReactNode }> = [
  { tool: 'select', label: 'Select', key: 'v', icon: <MousePointer2 /> },
  { tool: 'hand', label: 'Pan', key: 'h', icon: <Hand /> },
  { tool: 'pen', label: 'Pen', key: 'p', icon: <Pencil /> },
  { tool: 'rect', label: 'Rectangle', key: 'r', icon: <Square /> },
  { tool: 'ellipse', label: 'Ellipse', key: 'o', icon: <Circle /> },
  { tool: 'arrow', label: 'Arrow', key: 'a', icon: <ArrowUpRight /> },
  { tool: 'text', label: 'Text', key: 't', icon: <Type /> },
];

export type BoardToolbarProps = {
  tool: Tool;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onStrokeWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onExport: () => void;
};

export function BoardToolbar(props: BoardToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Whiteboard tools"
      className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md [&_svg]:size-4"
    >
      {TOOLS.map((t) => (
        <IconButton
          key={t.tool}
          label={`${t.label} (${t.key.toUpperCase()})`}
          active={props.tool === t.tool}
          onClick={() => props.onTool(t.tool)}
        >
          {t.icon}
        </IconButton>
      ))}

      <Divider vertical />

      <div role="radiogroup" aria-label="Stroke color" className="flex items-center gap-1 px-1">
        {STROKE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={props.color === c}
            aria-label={`Color ${c}`}
            title={c}
            onClick={() => props.onColor(c)}
            style={{ backgroundColor: c }}
            className={cx(
              'size-5 shrink-0 rounded-full ring-offset-1',
              props.color === c ? 'ring-2 ring-brand-500' : 'hover:ring-2 hover:ring-slate-300',
            )}
          />
        ))}
        <label
          title="Custom color"
          className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)]"
        >
          <span className="sr-only">Custom color</span>
          <input
            type="color"
            value={props.color}
            onChange={(e) => props.onColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <Divider vertical />

      <div role="radiogroup" aria-label="Stroke width" className="flex items-center">
        {STROKE_WIDTHS.map((w) => (
          <IconButton
            key={w}
            label={`Stroke ${w}px`}
            active={props.strokeWidth === w}
            onClick={() => props.onStrokeWidth(w)}
          >
            <span
              className="block w-4 rounded-full bg-current"
              style={{ height: Math.min(w, 6) }}
            />
          </IconButton>
        ))}
      </div>

      <Divider vertical />

      <IconButton label="Undo (Ctrl+Z)" disabled={!props.canUndo} onClick={props.onUndo}>
        <Undo2 />
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={props.onRedo}>
        <Redo2 />
      </IconButton>
      <IconButton
        label="Delete selection (Del)"
        disabled={!props.hasSelection}
        onClick={props.onDelete}
      >
        <Trash2 />
      </IconButton>
      <IconButton label="Export PNG" onClick={props.onExport}>
        <ImageDown />
      </IconButton>
    </div>
  );
}
