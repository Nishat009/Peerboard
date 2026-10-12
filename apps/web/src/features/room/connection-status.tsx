'use client';

import { Badge, type Tone } from '@/components/ui/badge';
import { formatRelative, useOnline, useTicker } from '@/lib/hooks';
import { useLastSyncedAt, usePeers, useProviderStatus } from './room-context';

export function useConnectionSummary(): { tone: Tone; label: string } {
  const online = useOnline();
  const status = useProviderStatus();
  const connected = usePeers().filter((p) => p.state === 'connected').length;

  if (!online) return { tone: 'warning', label: 'Offline · saved locally' };
  if (status === 'room-full') return { tone: 'danger', label: 'Room full' };
  if (status === 'connecting') return { tone: 'neutral', label: 'Connecting…' };
  if (status === 'disconnected' && connected === 0)
    return { tone: 'danger', label: 'Disconnected' };
  if (connected === 0) return { tone: 'brand', label: 'Waiting for peers' };
  return { tone: 'success', label: `Live · ${connected} ${connected === 1 ? 'peer' : 'peers'}` };
}

export function ConnectionStatus() {
  const { tone, label } = useConnectionSummary();
  const lastSyncedAt = useLastSyncedAt();
  const now = useTicker(10_000);

  return (
    <span
      role="status"
      title={lastSyncedAt ? `Last synced ${formatRelative(lastSyncedAt, now)}` : 'Not synced yet'}
    >
      <Badge tone={tone} dot>
        {label}
      </Badge>
    </span>
  );
}
