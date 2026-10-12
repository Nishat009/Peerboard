'use client';

import { Avatar } from '@/components/ui/avatar';
import { useParticipants } from './room-context';

const MAX_VISIBLE = 4;

export function AvatarStack() {
  const participants = useParticipants();
  const visible = participants.slice(0, MAX_VISIBLE);
  const hidden = participants.length - visible.length;

  return (
    <div className="hidden items-center -space-x-2 md:flex" aria-label="People in this room">
      {visible.map((p) => (
        <Avatar
          key={p.clientId}
          name={p.isSelf ? `${p.user.name} (you)` : p.user.name}
          color={p.user.color}
          size="sm"
        />
      ))}
      {hidden > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700 ring-2 ring-white">
          +{hidden}
        </span>
      )}
    </div>
  );
}
