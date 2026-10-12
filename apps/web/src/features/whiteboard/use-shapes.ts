'use client';

import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { byZ, type Shape } from './model';

/**
 * Mirrors a Y.Map of shapes into React state as a z-ordered array.
 * Unchanged shapes keep their object identity (Yjs returns the stored value), so memoized
 * shape components skip re-rendering when other shapes change.
 */
export function useShapes(map: Y.Map<Shape>): Shape[] {
  const [shapes, setShapes] = useState<Shape[]>(() => [...map.values()].sort(byZ));

  useEffect(() => {
    let frame = 0;
    // Coalesce bursts (remote batches, freehand drawing) into at most one render per frame.
    const sync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setShapes([...map.values()].sort(byZ));
      });
    };
    setShapes([...map.values()].sort(byZ));
    map.observe(sync);
    return () => {
      map.unobserve(sync);
      cancelAnimationFrame(frame);
    };
  }, [map]);

  return shapes;
}
