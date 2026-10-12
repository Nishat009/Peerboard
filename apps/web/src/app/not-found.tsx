import { Compass } from 'lucide-react';
import Link from 'next/link';
import { buttonStyles } from '@/components/ui/button';
import { FullPageMessage } from '@/components/ui/full-page-message';

export default function NotFound() {
  return (
    <FullPageMessage
      icon={<Compass className="size-5" />}
      title="Page not found"
      actions={
        <Link href="/" className={buttonStyles('primary')}>
          Back to home
        </Link>
      }
    >
      The room link may be incomplete or mistyped.
    </FullPageMessage>
  );
}
