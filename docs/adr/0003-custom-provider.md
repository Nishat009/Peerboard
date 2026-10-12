# ADR 0003: A custom Yjs WebRTC provider instead of y-webrtc

- Status: Accepted
- Date: 2026-10-12

## Context

`y-webrtc` exists and works, but it does not fit our requirements:

- It is built on `simple-peer`, which hides `RTCPeerConnection`, so we cannot control
  renegotiation, ICE restarts, or read `getStats()` for the connection quality UI.
- Its signaling protocol is pub/sub over a public server; we want a room-aware server that
  enforces peer limits and rate limits.
- Its encryption derives a key from a room password with PBKDF2. We want a random 256-bit key
  that lives only in the URL fragment.
- It also syncs over BroadcastChannel between tabs, which we do not need.

## Decision

Write `@peerboard/provider`, layered so each part can be reasoned about and tested on its own:

1. `SyncEngine`: standard y-protocols sync and awareness over an abstract `FrameTransport`.
   It contains no WebRTC code and is unit tested with an in-memory network.
2. `PeerConnection`: native `RTCPeerConnection` implementing the W3C **perfect negotiation**
   pattern. The polite/impolite role is derived from comparing peer ids, so both sides agree
   without coordination. Offer collisions (glare) resolve deterministically: the polite peer
   rolls back, the impolite peer ignores the colliding offer.
3. The data channel is **pre-negotiated** (`negotiated: true, id: 0`). Both sides create it
   symmetrically, which removes the `ondatachannel` race entirely.
4. `PeerConnectionManager`: full mesh. Only the newcomer dials, using the peer list in its
   join response, which avoids most glare up front. Existing peers create their side lazily on
   the first incoming signal.
5. `PeerBoardProvider`: wires everything together and adds the AES-GCM frame pipeline.

Resilience details:

- `disconnected` gets a 4 s grace period (Wi-Fi handovers often recover), then
  `restartIce()`. `failed` restarts ICE immediately, up to 3 attempts.
- Back-pressure: frames queue locally when the SCTP buffer passes 4 MB and drain on
  `bufferedamountlow`. They are never dropped, because a dropped Yjs update would leave a peer
  silently behind until the next full sync.
- Remote updates are not re-broadcast. In a full mesh every peer already receives each update
  directly from its author.

## Consequences

- More code to own (about 1,000 lines including comments) than dropping in y-webrtc.
- Full control over the connection lifecycle and stats, which enables the RTT and TURN relay
  indicators in the UI.
- The wire format stays standard y-protocols inside a 1-byte type envelope, so the provider
  stays compatible with the Yjs ecosystem.
