import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'PeerBoard', template: '%s · PeerBoard' },
  description:
    'Serverless, end-to-end encrypted collaborative whiteboard and notes over WebRTC and Yjs CRDTs.',
};

export const viewport: Viewport = {
  themeColor: '#f8fafc',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
