'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type AwarenessStates = Map<number, Record<string, unknown>>;

/**
 * Subscribes to a derived slice of awareness. Cursor moves fire many awareness changes per
 * second, so consumers that only need e.g. the user list re-render only when it changes.
 */
export function useAwarenessSelector<T>(
  awareness: Awareness,
  select: (states: AwarenessStates, selfId: number) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectRef = useRef(select);
  const equalRef = useRef(isEqual);
  const [value, setValue] = useState(() => select(awareness.getStates(), awareness.clientID));

  // Keep the latest callbacks without resubscribing; runs before the subscription effect.
  useEffect(() => {
    selectRef.current = select;
    equalRef.current = isEqual;
  });

  useEffect(() => {
    const update = () => {
      const next = selectRef.current(awareness.getStates(), awareness.clientID);
      setValue((prev) => (equalRef.current(prev, next) ? prev : next));
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness]);

  return value;
}

/** Re-renders every `ms` milliseconds, for relative timestamps like "synced 12s ago". */
export function useTicker(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function formatRelative(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/** True when keyboard focus is in a text field, where global shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
