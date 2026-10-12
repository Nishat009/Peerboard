import type { LocalUser } from '@/lib/identity';

export type ViewMode = 'board' | 'notes' | 'split';

/** Shape of each client's awareness state. Tiptap's caret extension also reads `user`. */
export type PresenceState = {
  user?: LocalUser;
  peerId?: string;
  /** Whiteboard pointer in world coordinates, null when off-canvas. Not named `cursor`:
   * y-prosemirror (Tiptap carets) owns that awareness field for text selections. */
  pointer?: { x: number; y: number } | null;
};

export type Participant = { clientId: number; isSelf: boolean; user: LocalUser; peerId?: string };
