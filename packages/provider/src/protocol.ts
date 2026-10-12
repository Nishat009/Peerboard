import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

/**
 * Data channel framing: [type: varUint][payload].
 * Sync and awareness payloads are the standard y-protocols encodings, so the wire format
 * stays compatible with the rest of the Yjs ecosystem.
 */
export const MessageType = {
  Sync: 0,
  Awareness: 1,
  Ping: 2,
  Pong: 3,
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

const frame = (type: MessageType, write: (encoder: encoding.Encoder) => void): Uint8Array => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

export const encodeSyncStep1 = (doc: Y.Doc) =>
  frame(MessageType.Sync, (e) => syncProtocol.writeSyncStep1(e, doc));

export const encodeUpdate = (update: Uint8Array) =>
  frame(MessageType.Sync, (e) => syncProtocol.writeUpdate(e, update));

export const encodeAwareness = (awareness: awarenessProtocol.Awareness, clients: number[]) =>
  frame(MessageType.Awareness, (e) =>
    encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(awareness, clients)),
  );

export const encodePing = (sentAt: number) =>
  frame(MessageType.Ping, (e) => encoding.writeFloat64(e, sentAt));

export const encodePong = (sentAt: number) =>
  frame(MessageType.Pong, (e) => encoding.writeFloat64(e, sentAt));

export const readMessageType = (decoder: decoding.Decoder): number => decoding.readVarUint(decoder);
