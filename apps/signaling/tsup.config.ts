import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // Workspace package ships TS source, so bundle it into the server output.
  noExternal: ['@peerboard/shared'],
  clean: true,
  sourcemap: true,
});
