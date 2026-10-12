'use client';

import type { Awareness } from 'y-protocols/awareness';
import type { PresenceState } from '@/features/room/types';
import { useAwarenessSelector } from '@/lib/hooks';

type RemoteCursor = { clientId: number; x: number; y: number; name: string; color: string };
export type Viewport = { x: number; y: number; scale: number };

const sameCursors = (a: RemoteCursor[], b: RemoteCursor[]) =>
  a.length === b.length &&
  a.every((c, i) => {
    const o = b[i]!;
    return (
      c.clientId === o.clientId &&
      c.x === o.x &&
      c.y === o.y &&
      c.name === o.name &&
      c.color === o.color
    );
  });

/**
 * Collaborator cursors as an HTML overlay positioned with transforms. Moving a cursor is a
 * compositor-only change, so it never forces the Konva canvas to redraw.
 */
export function RemoteCursors({
  awareness,
  viewport,
}: {
  awareness: Awareness;
  viewport: Viewport;
}) {
  const cursors = useAwarenessSelector(
    awareness,
    (states, selfId) => {
      const out: RemoteCursor[] = [];
      states.forEach((raw, clientId) => {
        const s = raw as PresenceState;
        if (clientId !== selfId && s.pointer && s.user) {
          out.push({ clientId, ...s.pointer, name: s.user.name, color: s.user.color });
        }
      });
      return out.sort((a, b) => a.clientId - b.clientId);
    },
    sameCursors,
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {cursors.map((c) => (
        <div
          key={c.clientId}
          className="absolute top-0 left-0 will-change-transform"
          style={{
            transform: `translate(${c.x * viewport.scale + viewport.x}px, ${c.y * viewport.scale + viewport.y}px)`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow-sm">
            <path
              d="M2 1.5 15.5 8 9 9.5 6 16Z"
              fill={c.color}
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="absolute top-4 left-3.5 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow-sm"
            style={{ backgroundColor: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
