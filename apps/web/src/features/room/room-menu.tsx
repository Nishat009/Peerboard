'use client';

import { Download, EllipsisVertical, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { IconButton } from '@/components/ui/icon-button';
import { Menu, MenuItem } from '@/components/ui/menu';
import { downloadBlob, exportDoc, importDoc } from '@/lib/peerboard-file';
import { useRoom } from './room-context';

export function RoomMenu() {
  const { doc, roomId, persistence } = useRoom();
  const fileInput = useRef<HTMLInputElement>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importDoc(doc, file);
    } catch {
      window.alert('That file is not a valid .peerboard export.');
    }
  };

  const onClear = async () => {
    const ok = window.confirm(
      'Delete this room from this device? Peers keep their copy; you will resync when you rejoin.',
    );
    if (!ok) return;
    await persistence.clearData();
    window.location.assign('/');
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".peerboard"
        className="hidden"
        onChange={(e) => {
          void onImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Menu
        trigger={({ open, toggle, id }) => (
          <IconButton
            label="Room options"
            aria-expanded={open}
            aria-controls={id}
            aria-haspopup="menu"
            onClick={toggle}
          >
            <EllipsisVertical className="size-4" />
          </IconButton>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<Download />}
              onSelect={() => {
                downloadBlob(exportDoc(doc), `peerboard-${roomId.slice(0, 8)}.peerboard`);
                close();
              }}
            >
              Export .peerboard backup
            </MenuItem>
            <MenuItem
              icon={<Upload />}
              onSelect={() => {
                fileInput.current?.click();
                close();
              }}
            >
              Import and merge backup
            </MenuItem>
            <div className="my-1 h-px bg-slate-100" />
            <MenuItem
              icon={<Trash2 />}
              tone="danger"
              onSelect={() => {
                close();
                void onClear();
              }}
            >
              Delete local copy
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
}
