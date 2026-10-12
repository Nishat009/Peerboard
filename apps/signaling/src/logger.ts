type Fields = Record<string, string | number | boolean | undefined>;

/**
 * Structured one-line JSON logs. Callers pass identifiers and counts only;
 * signal payloads are never logged, which keeps the "server sees no content" guarantee auditable.
 */
function write(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}): void {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === 'info') console.log(line);
  else console.error(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};
