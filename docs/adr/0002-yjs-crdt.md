# ADR 0002: Yjs CRDT for shared state

- Status: Accepted
- Date: 2026-10-12

## Context

Without a central server there is no authority to order operations. Any peer can edit at any
time, including while offline, and updates may arrive in different orders at different
peers. We need every peer to end up with the same document regardless of delivery order.

## Decision

Use **Yjs**, a CRDT (conflict-free replicated data type) library. Documents are `Y.Doc`
instances. Notes use `Y.XmlFragment` through Tiptap's collaboration extension. The whiteboard
uses a `Y.Map<shapeId, Shape>`.

The whiteboard is keyed by id rather than stored as a `Y.Array`. Concurrent edits to
different shapes never touch the same entry, and z-order is a field on each shape, not a
position in an array. Moving one shape does not reorder the whole list.

## Consequences

Good:

- Convergence is guaranteed by construction. It is also verified by randomized tests: four
  simulated peers make 600 interleaved concurrent edits under random delivery order, across
  five seeds, and must end in identical state.
- Updates are small and proportional to the change, not the document. Editing one shape in a
  5,000-shape board produces a 75-byte update, while the full document is 311 KB
  (`pnpm bench`).
- The state vector exchange (sync step 1/2) means a reconnecting peer receives only what it
  is missing.
- Mature ecosystem: y-protocols for sync and awareness, editor bindings for Tiptap.

Bad:

- Deleted content leaves small tombstones. Yjs garbage collection (`gc: true`, the default)
  drops deleted content, but not the item metadata. Compaction in local persistence keeps the
  stored size bounded.
- Shapes are replaced as whole objects. Two users moving the same shape at the same moment
  resolve to last-writer-wins for that shape, which is acceptable for a whiteboard.

## Alternatives considered

- **Automerge:** comparable guarantees. Yjs has better editor bindings and smaller updates
  for text.
- **Operational transformation:** needs a central server to order operations. Not
  compatible with ADR 0001.
