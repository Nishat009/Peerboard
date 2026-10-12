# Benchmarks

Measured on a Windows 11 laptop in Chrome, with both peers on the same machine.

## End-to-end sync latency

Time from a keystroke in browser A until the text appears in browser B's DOM. The path is
WebRTC, AES-GCM, and Yjs; 25 samples.

| Peers | Median | p95   |
| ----- | ------ | ----- |
| 2     | 5 ms   | 10 ms |

Reproduce: `pnpm --filter @peerboard/web test:e2e`

## Whiteboard rendering

Frame rate while continuously panning, on the Next.js dev build.

| Shapes | Frame rate | p95 frame time |
| ------ | ---------- | -------------- |
| 1,000  | 60 fps     | 16.8 ms        |
| 5,000  | 53 fps     | 33.3 ms        |

Reproduce: `BENCH=1 pnpm --filter @peerboard/web test:e2e board-perf`

## Update size vs document size

Incremental updates stay the same size as the board grows.

| Shapes | Full document | One shape edit |
| ------ | ------------- | -------------- |
| 100    | 5.9 KB        | 74 B           |
| 1,000  | 61.3 KB       | 75 B           |
| 5,000  | 311.3 KB      | 75 B           |

## Sync layer, in process

Encode, deliver, and apply on every peer, with no network involved.

| Peers | Median   | p95      |
| ----- | -------- | -------- |
| 2     | 0.049 ms | 0.196 ms |
| 3     | 0.043 ms | 0.103 ms |
| 5     | 0.061 ms | 0.146 ms |

AES-GCM adds 28 bytes per frame and takes about 0.05 ms for a 1 KB frame.

Reproduce: `pnpm bench`

## What keeps it fast

- Pointer samples are batched into at most one Yjs update per animation frame.
- Shape components are memoized on object identity. Yjs returns unchanged values as the same
  objects, so editing one shape re-renders one node.
- Shapes outside the viewport are not rendered. Bounds and freehand outlines are cached per
  shape in `WeakMap`s.
- Hit testing is turned off on the content layer while drawing.
- Remote cursors are an HTML overlay moved with CSS transforms, so they never redraw the canvas.
- Components subscribe only to the part of awareness they need, so cursor movement does not
  re-render the presence list.
- The room page is client-only and code split. The landing page ships no WebRTC or Yjs code,
  and the whiteboard (Konva) and notes (Tiptap) load only when shown.
