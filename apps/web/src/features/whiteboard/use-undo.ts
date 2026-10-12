'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { LOCAL_ORIGIN } from './model';

/**
 * Per-user undo: only transactions tagged with LOCAL_ORIGIN are tracked, so undo reverts your
 * own strokes and never a collaborator's concurrent work.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs event types are invariant
export function useUndo(type: Y.AbstractType<any>) {
  const [manager, setManager] = useState<Y.UndoManager | null>(null);
  const [state, setState] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    // Created in an effect (not useMemo) so StrictMode's mount/unmount/mount cannot leave a
    // destroyed instance behind.
    const um = new Y.UndoManager(type, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 400,
    });
    const update = () => setState({ canUndo: um.canUndo(), canRedo: um.canRedo() });
    um.on('stack-item-added', update);
    um.on('stack-item-popped', update);
    um.on('stack-cleared', update);
    setManager(um);
    return () => um.destroy();
  }, [type]);

  return {
    ...state,
    undo: useCallback(() => manager?.undo(), [manager]),
    redo: useCallback(() => manager?.redo(), [manager]),
    /** Starts a new undo step, so separate strokes drawn quickly are undone one at a time. */
    checkpoint: useCallback(() => manager?.stopCapturing(), [manager]),
  };
}
