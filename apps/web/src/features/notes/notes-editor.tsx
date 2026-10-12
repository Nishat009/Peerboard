'use client';

import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useLocalUser, useRoom } from '@/features/room/room-context';
import type { LocalUser } from '@/lib/identity';
import { EditorToolbar } from './editor-toolbar';

/** Remote caret, built as plain DOM because ProseMirror renders decorations outside React. */
function renderCaret(user: Record<string, unknown>): HTMLElement {
  const { name, color } = user as LocalUser;
  const caret = document.createElement('span');
  caret.className = 'pointer-events-none relative -mx-px border-x break-normal';
  caret.style.borderColor = color;

  // The name is drawn via CSS `content`, so it never becomes document text: it cannot be
  // selected, copied, or picked up by screen readers as part of the note.
  const label = document.createElement('span');
  label.className =
    'absolute -top-5 -left-px rounded-sm rounded-bl-none px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap text-white select-none before:content-[attr(data-name)]';
  label.style.backgroundColor = color;
  label.dataset.name = name;
  caret.append(label);
  return caret;
}

/** Typography for editor content, expressed as Tailwind variants on the ProseMirror root. */
const CONTENT_CLASS = [
  'min-h-full max-w-none px-8 py-8 text-[15px] leading-7 text-slate-800 focus:outline-none',
  '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-slate-900',
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900',
  '[&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-slate-900',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600',
  '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  '[&_hr]:my-6 [&_hr]:border-slate-200',
  '[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-slate-400 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
].join(' ');

export default function NotesEditor() {
  const { doc, provider } = useRoom();
  const [user] = useLocalUser();

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        // Yjs owns history so undo only reverts *your* changes, never a collaborator's.
        StarterKit.configure({ undoRedo: false }),
        Placeholder.configure({ placeholder: 'Start writing shared notes…' }),
        Collaboration.configure({ document: doc, field: 'notes' }),
        CollaborationCaret.configure({ provider, user, render: renderCaret }),
      ],
      editorProps: {
        attributes: { class: CONTENT_CLASS, 'aria-label': 'Shared notes', spellcheck: 'true' },
      },
    },
    // The user is read once at mount; later name/color changes go through awareness directly.
    [doc, provider],
  );

  if (!editor) return <div className="flex-1 bg-white" />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <EditorToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full max-w-3xl">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </div>
  );
}
