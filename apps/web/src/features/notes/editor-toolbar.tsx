'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Divider } from '@/components/ui/divider';
import { IconButton } from '@/components/ui/icon-button';

type Action = {
  label: string;
  icon: ReactNode;
  run: (e: Editor) => void;
  isActive?: (e: Editor) => boolean;
};

const GROUPS: Action[][] = [
  [
    {
      label: 'Bold (Ctrl+B)',
      icon: <Bold />,
      run: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive('bold'),
    },
    {
      label: 'Italic (Ctrl+I)',
      icon: <Italic />,
      run: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive('italic'),
    },
    {
      label: 'Strikethrough',
      icon: <Strikethrough />,
      run: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive('strike'),
    },
    {
      label: 'Inline code',
      icon: <Code />,
      run: (e) => e.chain().focus().toggleCode().run(),
      isActive: (e) => e.isActive('code'),
    },
  ],
  [
    {
      label: 'Heading 1',
      icon: <Heading1 />,
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: (e) => e.isActive('heading', { level: 1 }),
    },
    {
      label: 'Heading 2',
      icon: <Heading2 />,
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: (e) => e.isActive('heading', { level: 2 }),
    },
  ],
  [
    {
      label: 'Bullet list',
      icon: <List />,
      run: (e) => e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive('bulletList'),
    },
    {
      label: 'Numbered list',
      icon: <ListOrdered />,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive('orderedList'),
    },
    {
      label: 'Quote',
      icon: <Quote />,
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      isActive: (e) => e.isActive('blockquote'),
    },
    {
      label: 'Code block',
      icon: <SquareCode />,
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
      isActive: (e) => e.isActive('codeBlock'),
    },
  ],
];

const ALL = GROUPS.flat();

export function EditorToolbar({ editor }: { editor: Editor }) {
  // Active states packed into a bitmask: the toolbar re-renders only when one flips,
  // not on every transaction.
  const activeMask = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      ALL.reduce((mask, action, i) => (action.isActive?.(e) ? mask | (1 << i) : mask), 0),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-1.5 [&_svg]:size-4"
    >
      {GROUPS.map((group, g) => (
        <div key={g} className="flex items-center gap-0.5">
          {g > 0 && <Divider vertical />}
          {group.map((action) => (
            <IconButton
              key={action.label}
              size="sm"
              label={action.label}
              active={(activeMask & (1 << ALL.indexOf(action))) !== 0}
              onClick={() => action.run(editor)}
            >
              {action.icon}
            </IconButton>
          ))}
        </div>
      ))}
      <Divider vertical />
      <IconButton
        size="sm"
        label="Undo (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        size="sm"
        label="Redo (Ctrl+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 />
      </IconButton>
    </div>
  );
}
