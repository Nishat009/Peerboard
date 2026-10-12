'use client';

import { MAX_PEERS_PER_ROOM } from '@peerboard/shared';
import { Lock, Radio, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cx } from '@/lib/cx';
import { formatRelative, useTicker } from '@/lib/hooks';
import { USER_COLORS } from '@/lib/identity';
import {
  useLastSyncedAt,
  useLocalUser,
  useParticipants,
  usePeers,
  useProviderStatus,
  useRoom,
} from './room-context';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-4 py-4 last:border-b-0">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function rttTone(ms: number | undefined): string {
  if (ms === undefined) return 'text-slate-400';
  if (ms < 100) return 'text-emerald-600';
  if (ms < 250) return 'text-amber-600';
  return 'text-rose-600';
}

function IdentityEditor() {
  const [user, setUser] = useLocalUser();
  const [draft, setDraft] = useState(user.name);

  const commit = () => {
    const name = draft.trim().slice(0, 32);
    if (name && name !== user.name) setUser({ ...user, name });
    else setDraft(user.name);
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Display name</span>
        <input
          value={draft}
          maxLength={32}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-xs focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </label>
      <div role="radiogroup" aria-label="Cursor color" className="flex flex-wrap gap-1.5">
        {USER_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={user.color === color}
            aria-label={`Color ${color}`}
            onClick={() => setUser({ ...user, color })}
            style={{ backgroundColor: color }}
            className={cx(
              'size-6 rounded-full ring-offset-2',
              user.color === color ? 'ring-2 ring-slate-900' : 'hover:ring-2 hover:ring-slate-300',
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function PresencePanel({ className }: { className?: string }) {
  const { provider } = useRoom();
  const participants = useParticipants();
  const peers = usePeers();
  const status = useProviderStatus();
  const lastSyncedAt = useLastSyncedAt();
  const now = useTicker(10_000);
  const peerById = new Map(peers.map((p) => [p.peerId, p]));
  const nearLimit = participants.length >= MAX_PEERS_PER_ROOM - 1;

  return (
    <aside
      aria-label="Room details"
      className={cx(
        'flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white',
        className,
      )}
    >
      <Section title={`In this room · ${participants.length}/${MAX_PEERS_PER_ROOM}`}>
        <ul className="space-y-2.5">
          {participants.map((p) => {
            const peer = p.peerId ? peerById.get(p.peerId) : undefined;
            return (
              <li key={p.clientId} className="flex items-center gap-3">
                <Avatar name={p.user.name} color={p.user.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {p.user.name}
                    {p.isSelf && <span className="ml-1.5 font-normal text-slate-500">(you)</span>}
                  </p>
                  {!p.isSelf && (
                    <p className="text-xs text-slate-500">
                      {peer?.state === 'connected'
                        ? 'Direct connection'
                        : (peer?.state ?? 'Via peer')}
                      {peer?.relayed && ' · TURN relay'}
                    </p>
                  )}
                </div>
                {!p.isSelf && peer?.rttMs !== undefined && (
                  <span className={cx('text-xs font-medium tabular-nums', rttTone(peer.rttMs))}>
                    {peer.rttMs} ms
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {nearLimit && (
          <p className="mt-4 flex gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            Full-mesh WebRTC does not scale past {MAX_PEERS_PER_ROOM} peers; each one adds a
            connection to everyone else.
          </p>
        )}
      </Section>

      <Section title="You">
        <IdentityEditor />
      </Section>

      <Section title="Connection">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Signaling</dt>
            <dd className="font-medium text-slate-900 capitalize">{status.replace('-', ' ')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Last synced</dt>
            <dd className="font-medium text-slate-900">
              {lastSyncedAt ? formatRelative(lastSyncedAt, now) : 'Not yet'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Topology</dt>
            <dd className="flex items-center gap-1 font-medium text-slate-900">
              <Radio className="size-3.5" aria-hidden /> P2P mesh
            </dd>
          </div>
        </dl>
        {provider.encrypted && (
          <p className="mt-4 flex gap-2 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600 ring-1 ring-slate-200 ring-inset">
            <Lock className="size-4 shrink-0 text-emerald-600" aria-hidden />
            End-to-end encrypted with AES-GCM 256. The key is in the link fragment and never leaves
            your browser.
          </p>
        )}
      </Section>
    </aside>
  );
}
