import { ROOM_ID_PATTERN } from '@peerboard/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoomLoader } from '@/features/room/room-loader';

export const metadata: Metadata = {
  title: 'Room',
  // Room URLs are capabilities; keep them out of search indexes.
  robots: { index: false, follow: false },
};

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ROOM_ID_PATTERN.test(id)) notFound();
  return <RoomLoader roomId={id} />;
}
