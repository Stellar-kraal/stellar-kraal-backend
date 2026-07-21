/**
 * src/monitoring/logger.ts
 *
 * Structured JSON logger for the monitoring service, mirroring
 * `src/lib/logger.ts` but kept independent so the monitoring process
 * doesn't pull in the main API's environment requirements.
 */

import winston from 'winston';
import { monitorConfig } from './config';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}] ${message}${metaStr}${stack ? `\n${stack}` : ''}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: monitorConfig.LOG_LEVEL,
  format: monitorConfig.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'stellarkraal-monitoring' },
  transports: [
    new winston.transports.Console({
      silent: monitorConfig.NODE_ENV === 'test',
    }),
  ],
  exitOnError: false,
});

export function createLogger(module: string): winston.Logger {
  return logger.child({ module });
}
