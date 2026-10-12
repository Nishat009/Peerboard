# ADR 0001: Peer-to-peer full mesh over WebRTC

- Status: Accepted
- Date: 2026-10-12

## Context

PeerBoard is a real-time whiteboard and notes tool for small groups. The usual design is a
central sync server (e.g. y-websocket, Liveblocks) that every client connects to. That server
sees and stores all content, costs money to run at scale, and is a single point of failure.

We want the server to hold no user data, so that a breach of the server leaks nothing and the
hosting cost stays near zero.

## Decision

Browsers connect directly to each other with WebRTC data channels in a **full mesh**: every
peer holds one connection to every other peer. A small Socket.IO server is used only for
signaling (room membership and relaying SDP offers/answers and ICE candidates).

Rooms are capped at **6 peers** (`MAX_PEERS_PER_ROOM`), enforced by the server.

## Consequences

Good:

- The server stores nothing and relays only connection metadata, which keeps it trivially
  cheap to host and safe to compromise.
- Edits travel one hop, browser to browser. Measured median sync latency is about 5 ms
  between two peers on the same machine (`apps/web/e2e`).
- Existing peer connections survive a signaling outage; only new joins need the server.

Bad:

- A mesh of n peers needs n(n-1)/2 connections, and each edit is uploaded n-1 times by its
  author. Beyond about 6 peers, upstream bandwidth and CPU become the bottleneck. This is the
  reason for the cap.
- Strict NATs (symmetric NAT, some mobile carriers) block direct connections. A TURN relay
  fallback is required for those users (see the TURN section of the README).
- When the last peer leaves, the room only lives on in each participant's local IndexedDB.
  A newcomer joining an empty room gets an empty document. Export/import of `.peerboard`
  files is the recovery path.

## Alternatives considered

- **Central Yjs server (y-websocket / Hocuspocus):** simplest and scales to many users, but
  the server sees all content. Rejected for this project's goals.
- **SFU-style relay:** scales the mesh past 6 peers, but reintroduces a server in the data
  path. Listed as future work.
