import { loadConfig } from './config';
import { log } from './logger';
import { createSignalingServer } from './server';

const config = loadConfig();
const server = createSignalingServer(config);

const port = await server.listen(config.port);
log.info('listening', {
  port,
  origins: config.corsOrigins.join(','),
  turn: config.turn.urls.length > 0,
});

const shutdown = (signal: string) => {
  log.info('shutdown', { signal });
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
