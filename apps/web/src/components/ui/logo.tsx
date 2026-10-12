import Link from 'next/link';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-semibold text-slate-900">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-brand-600" />
        <path
          d="M11 11 21 21M21 11 21 21M11 11h10"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="11" cy="11" r="3.5" fill="#fff" />
        <circle cx="21" cy="21" r="3.5" fill="#fff" />
        <circle cx="21" cy="11" r="3.5" className="fill-brand-200" />
      </svg>
      {!compact && <span className="tracking-tight">PeerBoard</span>}
    </Link>
  );
}
