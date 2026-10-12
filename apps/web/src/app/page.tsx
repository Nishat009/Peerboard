import { CloudOff, GitMerge, Lock, Network } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { CreateRoomButton } from '@/features/landing/create-room-button';

const FEATURES: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <Network className="size-5" />,
    title: 'Peer-to-peer',
    body: 'Browsers connect directly over a WebRTC mesh. The server only introduces peers.',
  },
  {
    icon: <GitMerge className="size-5" />,
    title: 'Conflict-free',
    body: 'Yjs CRDTs merge concurrent edits deterministically. No locks, no lost keystrokes.',
  },
  {
    icon: <CloudOff className="size-5" />,
    title: 'Offline-first',
    body: 'Work without a connection. Changes persist locally and merge when you reconnect.',
  },
  {
    icon: <Lock className="size-5" />,
    title: 'End-to-end encrypted',
    body: 'AES-GCM room key lives in the link fragment and never reaches any server.',
  },
];

const STEPS = [
  ['Signal', 'A tiny Socket.IO server relays SDP offers and ICE candidates.'],
  ['Connect', 'Peers open encrypted data channels using perfect negotiation.'],
  ['Sync', 'A custom Yjs provider exchanges state vectors, then streams updates.'],
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <a
          href="https://github.com/Nishat009/Peerboard"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          GitHub
        </a>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 text-center sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 ring-inset">
            WebRTC · Yjs CRDT · E2EE
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-slate-900 sm:text-5xl">
            A shared whiteboard and notes, with no server in the middle.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-slate-600">
            Create a room, share the link, and collaborate in real time. Your data moves directly
            between browsers and stays encrypted end to end.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CreateRoomButton />
            <span className="text-sm text-slate-500">No sign-up. Up to 6 people per room.</span>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-canvas p-8">
                <div className="flex size-10 items-center justify-center rounded-lg bg-white text-brand-600 shadow-xs ring-1 ring-slate-200">
                  {f.icon}
                </div>
                <h2 className="mt-4 font-semibold text-slate-900">{f.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-xl border border-slate-200 p-6">
                <span className="text-sm font-semibold text-brand-600">0{i + 1}</span>
                <h3 className="mt-2 font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        PeerBoard · open source
      </footer>
    </div>
  );
}
