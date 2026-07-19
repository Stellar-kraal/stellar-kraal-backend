/**
 * src/logger.ts
 *
 * Minimal structured JSON-line logger. Deliberately dependency-free
 * (no winston) to keep the bridge's install footprint and image size small.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    service: 'oracle-bridge',
    message,
    ...(meta && { meta }),
  };
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
