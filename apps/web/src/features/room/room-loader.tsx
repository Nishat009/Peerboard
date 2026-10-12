'use client';

import dynamic from 'next/dynamic';

/**
 * The workspace depends on browser-only APIs (WebRTC, IndexedDB, WebCrypto, canvas), so it is
 * loaded on the client only and kept out of the landing page bundle.
 */
const RoomWorkspace = dynamic(() => import('./room-workspace'), {
  ssr: false,
  loading: () => <div className="h-full bg-canvas" />,
});

export function RoomLoader({ roomId }: { roomId: string }) {
  return <RoomWorkspace roomId={roomId} />;
}
