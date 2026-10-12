'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createRoomPath } from '@/lib/room-link';

export function CreateRoomButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="primary"
      size="lg"
      disabled={pending}
      onClick={() => {
        setPending(true);
        router.push(createRoomPath());
      }}
    >
      {pending ? 'Creating room…' : 'Create a room'}
      <ArrowRight className="size-4" aria-hidden />
    </Button>
  );
}
