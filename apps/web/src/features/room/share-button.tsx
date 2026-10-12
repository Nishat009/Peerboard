'use client';

import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    // The full URL includes #key=..., which is what grants access to the room.
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copy this link to invite others:', url);
    }
  };

  return (
    <Button variant="primary" size="sm" onClick={() => void copy()}>
      {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
      <span className="hidden sm:inline">{copied ? 'Link copied' : 'Share'}</span>
    </Button>
  );
}
