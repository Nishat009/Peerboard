export type ServerConfig = {
  port: number;
  corsOrigins: string[];
  trustProxy: boolean;
  turn: {
    urls: string[];
    secret?: string;
    ttlSeconds: number;
    username?: string;
    credential?: string;
  };
};

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const optional = (value: string | undefined): string | undefined => value?.trim() || undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);

  return {
    port,
    corsOrigins: list(env.CORS_ORIGINS).length ? list(env.CORS_ORIGINS) : ['http://localhost:3000'],
    trustProxy: env.TRUST_PROXY === 'true',
    turn: {
      urls: list(env.TURN_URLS),
      secret: optional(env.TURN_SECRET),
      ttlSeconds: Number(env.TURN_TTL_SECONDS ?? 3600),
      username: optional(env.TURN_USERNAME),
      credential: optional(env.TURN_CREDENTIAL),
    },
  };
}
