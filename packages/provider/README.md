# @peerboard/provider

A Yjs provider that syncs a `Y.Doc` over a WebRTC full mesh, without a server in the data path.

- Native `RTCPeerConnection` with the W3C **perfect negotiation** pattern (glare-safe)
- Pre-negotiated, ordered data channel; back-pressure that never drops updates
- Standard **y-protocols** sync and awareness inside a 1-byte message envelope
- Optional **end-to-end encryption**: AES-GCM 256 on every frame
- **Encrypted IndexedDB persistence** for offline-first apps
- ICE restart on failure, runtime TURN credentials, per-peer RTT and relay stats

It needs a small signaling server that relays SDP and ICE between peers in a room. The
reference implementation is `apps/signaling` in the
[PeerBoard repository](https://github.com/Nishat009/Peerboard).

## Install

```bash
npm install @peerboard/provider yjs
```

`yjs` is a peer dependency, so your app and the provider share a single Yjs instance.

## Usage

```ts
import * as Y from 'yjs';
import {
  EncryptedIndexedDbPersistence,
  PeerBoardProvider,
  generateRoomKey,
  importRoomKey,
} from '@peerboard/provider';

const encodedKey = location.hash.slice('#key='.length) || generateRoomKey();
const roomKey = await importRoomKey(encodedKey);

const doc = new Y.Doc();
const persistence = new EncryptedIndexedDbPersistence('my-room-id', doc, roomKey);
const provider = new PeerBoardProvider(doc, {
  roomId: 'my-room-id',
  signalingUrl: 'https://signaling.example.com',
  roomKey,
  connect: false,
});

await persistence.whenSynced; // show local state first
await provider.connect();

provider.awareness.setLocalStateField('user', { name: 'Ada', color: '#2c4cd9' });
provider.on('peers', (peers) => console.log(peers)); // [{ peerId, state, rttMs, relayed }]
provider.on('status', (status) => console.log(status)); // connecting | connected | disconnected | room-full
```

`provider.awareness` is a standard y-protocols `Awareness`, so editor bindings such as Tiptap's
collaboration caret work as they do with other providers.

## API

### `new PeerBoardProvider(doc, options)`

| Option            | Type              | Description                                               |
| ----------------- | ----------------- | --------------------------------------------------------- |
| `roomId`          | `string`          | Room to join on the signaling server                      |
| `signalingUrl`    | `string`          | Base URL of the signaling server                          |
| `roomKey`         | `CryptoKey?`      | Enables E2EE. Peers without the same key are disconnected |
| `peerId`          | `string?`         | Defaults to a random 96-bit hex id                        |
| `awareness`       | `Awareness?`      | Bring your own awareness instance                         |
| `iceServers`      | `RTCIceServer[]?` | Static ICE config; otherwise fetched from `/ice-servers`  |
| `statsIntervalMs` | `number?`         | RTT and relay polling interval (default 3000)             |
| `connect`         | `boolean?`        | Connect immediately (default `true`)                      |

Events: `status`, `peers`, `synced` (timestamp of the last state received from a peer),
`unauthorized-peer`.

### `SyncEngine`

The transport-agnostic protocol core. Implement `FrameTransport` (`send`, `broadcast`) to run
Yjs sync over any message channel, for example in tests.

## License

MIT
