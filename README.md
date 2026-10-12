# PeerBoard

**A real-time whiteboard and notes app with no server in the data path.** Browsers sync
directly over a WebRTC mesh using Yjs CRDTs, work offline, and encrypt everything end to end.

> **The server stores no documents.** The signaling server only introduces peers by relaying
> connection metadata (SDP and ICE). Document content never passes through it, in plaintext
> or otherwise. See [docs/security.md](docs/security.md).

<!-- Live demo: https://peerboard.vercel.app · Demo GIF: docs/demo.gif -->

## Features

- **Collaborative notes:** rich text (headings, lists, code, quotes) with live, named carets.
- **Whiteboard:** pen (pressure-style strokes), rectangle, ellipse, arrow, text; select,
  multi-select, move, resize, rotate, delete; pan and zoom; PNG export.
- **Presence:** who is online, live cursors, per-peer latency, TURN relay indicator.
- **Per-user undo/redo:** undo reverts only your own changes, never a collaborator's.
- **Offline-first:** edits persist to encrypted IndexedDB and merge when peers reconnect.
- **End-to-end encryption:** AES-GCM 256 key in the link fragment, never sent to a server.
- **Backups:** export a room to a `.peerboard` file; importing merges it into a live room.

## How it works

1. **Signal.** Peers join a room on a small Socket.IO server, which relays WebRTC offers,
   answers, and ICE candidates. It enforces a 6-peer limit and rate limits, and stores nothing.
2. **Connect.** Each pair of peers opens one pre-negotiated data channel using the W3C
   perfect negotiation pattern, so simultaneous offers (glare) resolve on their own. Dropped
   connections recover with ICE restarts.
3. **Sync.** A custom Yjs provider exchanges state vectors (`SyncStep1`), sends only the
   missing updates (`SyncStep2`), then streams incremental updates. Every frame is
   AES-GCM encrypted before it leaves the browser.

Diagrams and protocol details: [docs/architecture.md](docs/architecture.md).

## Key decisions

| ADR                                            | Decision                                             |
| ---------------------------------------------- | ---------------------------------------------------- |
| [0001](docs/adr/0001-p2p-mesh.md)              | Peer-to-peer full mesh, capped at 6 peers            |
| [0002](docs/adr/0002-yjs-crdt.md)              | Yjs CRDT, whiteboard as an id-keyed `Y.Map`          |
| [0003](docs/adr/0003-custom-provider.md)       | Custom provider: perfect negotiation, no simple-peer |
| [0004](docs/adr/0004-encrypted-persistence.md) | Encrypted IndexedDB persistence over y-indexeddb     |

## Benchmarks

Measured on a Windows 11 laptop, Chrome, both peers on the same machine. Run them yourself:
`pnpm bench` (sync layer) and `pnpm --filter @peerboard/web test:e2e` (real browsers).

**End-to-end sync latency** (keystroke in browser A until it is in browser B's DOM, through
WebRTC, AES-GCM, and Yjs, 25 samples):

| Peers | Median | p95   |
| ----- | ------ | ----- |
| 2     | 5 ms   | 10 ms |

**Whiteboard rendering** while continuously panning (Next.js dev build,
`BENCH=1 pnpm --filter @peerboard/web test:e2e board-perf`):

| Shapes | Frame rate | p95 frame time |
| ------ | ---------- | -------------- |
| 1,000  | 60 fps     | 16.8 ms        |
| 5,000  | 53 fps     | 33.3 ms        |

**Update size vs document size**: incremental updates stay constant as the board grows.

| Shapes | Full document | One shape edit |
| ------ | ------------- | -------------- |
| 100    | 5.9 KB        | 74 B           |
| 1,000  | 61.3 KB       | 75 B           |
| 5,000  | 311.3 KB      | 75 B           |

**Sync layer, in process** (encode, deliver, and apply on every peer; no network):

| Peers | Median   | p95      |
| ----- | -------- | -------- |
| 2     | 0.049 ms | 0.196 ms |
| 3     | 0.043 ms | 0.103 ms |
| 5     | 0.061 ms | 0.146 ms |

AES-GCM adds 28 bytes per frame and about 0.05 ms per 1 KB frame.

## Performance techniques

- Pointer samples are batched to at most one Yjs update per animation frame.
- Shape components are memoized on object identity; Yjs returns stored values unchanged, so
  editing one shape re-renders one node.
- Viewport culling skips off-screen shapes; bounds and freehand outlines are cached per shape
  object in `WeakMap`s.
- Hit testing is disabled on the content layer while drawing.
- Remote cursors are an HTML overlay moved with CSS transforms, so they never redraw the canvas.
- Awareness consumers subscribe to selected slices, so cursor movement does not re-render the
  presence list.
- The room page is client-only and code split: the landing page ships no WebRTC or Yjs code,
  and the whiteboard (Konva) and notes (Tiptap) chunks load only when shown.

## Project structure

```
apps/
  web/          Next.js 16 + React 19 + Tailwind CSS 4 (UI, Tiptap, Konva)
  signaling/    Node + Socket.IO relay, TURN credential endpoint
packages/
  provider/     @peerboard/provider: the custom Yjs WebRTC provider (publishable)
  shared/       Signaling wire types shared by server and client
docs/           Architecture, ADRs, threat model
```

## Run locally

Requirements: Node 20.11+ and pnpm 9.

```bash
pnpm install
pnpm dev          # web on http://localhost:3000, signaling on http://localhost:4000
```

Open the app, click **Create a room**, and open the copied link in a second browser window.

| Command                                 | What it does                                |
| --------------------------------------- | ------------------------------------------- |
| `pnpm test`                             | Unit tests (Vitest): provider and signaling |
| `pnpm lint`                             | ESLint across the monorepo                  |
| `pnpm typecheck`                        | `tsc --noEmit` in every package             |
| `pnpm build`                            | Production builds                           |
| `pnpm bench`                            | Sync layer benchmarks (markdown output)     |
| `pnpm --filter @peerboard/web test:e2e` | Playwright: two browser contexts            |

Set `PW_CHANNEL=chrome` to run Playwright against an installed Chrome instead of downloading
Chromium.

## Configuration

`apps/web/.env.local`

| Variable                    | Default                 |
| --------------------------- | ----------------------- |
| `NEXT_PUBLIC_SIGNALING_URL` | `http://localhost:4000` |

`apps/signaling/.env` (see `.env.example`)

| Variable                            | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `PORT`                              | HTTP port (default 4000)                                     |
| `CORS_ORIGINS`                      | Comma-separated allowed web origins                          |
| `TRUST_PROXY`                       | `true` behind Render/Railway so client IPs are rate limited  |
| `TURN_URLS`                         | e.g. `turn:turn.example.com:3478?transport=udp`              |
| `TURN_SECRET`                       | coturn `static-auth-secret`; enables short-lived credentials |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Static credentials (e.g. Metered) as a fallback              |

### TURN

Peers behind symmetric NAT or some mobile networks cannot connect directly. With TURN
configured, the signaling server's `GET /ice-servers` returns time-limited credentials
(coturn REST API scheme: `username = expiry:peerId`, `credential = HMAC-SHA1(secret, username)`).
The client fetches them at runtime and refreshes them before expiry, so no TURN secret is ever
bundled. The presence panel shows "TURN relay" when a connection is relayed.

## Deploy

- **Web:** Vercel, project root `apps/web`. Set `NEXT_PUBLIC_SIGNALING_URL`.
- **Signaling:** Render using [`render.yaml`](render.yaml), or any Node host. Run
  `pnpm --filter @peerboard/signaling build`, then `node apps/signaling/dist/index.js`.
  Set `CORS_ORIGINS` to the web origin and `TRUST_PROXY=true`.

## Limitations and future work

- **Empty rooms forget.** If every peer leaves, a new joiner starts from an empty document;
  the room lives on only in participants' local storage. Use **Export .peerboard backup**
  to keep a copy. Future: an optional encrypted blob store that holds only ciphertext.
- **Mesh size.** Capped at 6 peers. Future: an SFU-style relay for larger rooms.
- **No relaying between peers.** If two peers cannot connect to each other (and TURN is not
  configured), they will not see each other's edits, even if both connect to a third peer.
- **Access control** is "whoever has the link". No accounts or revocation.
- See [docs/security.md](docs/security.md) for what encryption does and does not protect.

## License

MIT

# Peerboard
