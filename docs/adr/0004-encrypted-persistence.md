# ADR 0004: Encrypted local persistence instead of y-indexeddb

- Status: Accepted
- Date: 2026-10-12

## Context

Offline-first requires persisting the document locally. `y-indexeddb` is the standard
choice, but it stores Yjs updates in plaintext. With end-to-end encryption (see
`docs/security.md`), leaving a plaintext copy on disk would undercut the guarantee on shared
or lost devices.

## Decision

Implement `EncryptedIndexedDbPersistence` in the provider package:

- One IndexedDB database per room (`peerboard:<roomId>`) holding an append-only log of
  updates.
- Every record is sealed with the room key using AES-GCM, with additional data
  `peerboard:idb:<db name>`, so records cannot be swapped between rooms.
- On load, all records are decrypted, merged with `Y.mergeUpdates`, and applied in one
  transaction.
- After 300 records the log is compacted into a single `Y.encodeStateAsUpdate` snapshot.
- The provider connects to peers only after local state has loaded. The UI shows local
  content immediately, and the first sync exchange carries only true deltas.

## Consequences

- Data at rest is unreadable without the URL fragment key.
- Records that fail to decrypt are skipped rather than crashing the load.
- About 120 lines of code we own instead of a dependency.
- Clearing the room's data is one `deleteDatabase` call, exposed as "Delete local copy" in
  the room menu.
