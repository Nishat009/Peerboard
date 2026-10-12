import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/crypto.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // Shared wire types are internal; inline them so the published package has no private deps.
  noExternal: ['@peerboard/shared'],
  // Yjs must be a single instance per app, so it stays a peer dependency.
  external: ['yjs', 'y-protocols', 'lib0', 'socket.io-client'],
});
