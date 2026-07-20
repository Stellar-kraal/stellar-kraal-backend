/**
 * src/config/env.ts
 *
 * Centralised environment configuration with fail-fast validation.
 * Any missing required variable throws at startup so the server never
 * silently starts with a broken configuration.
 */

import { config as dotenvConfig } from 'dotenv';

// Load .env before anything else reads process.env
dotenvConfig();

type Network = 'testnet' | 'mainnet' | 'futurenet' | 'standalone';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value?.trim() || defaultValue;
}

function requirePositiveInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${key} must be a non-negative integer, got: "${raw}"`);
  }
  return parsed;
}

// ─── Validated Configuration ─────────────────────────────────────────────────

export const env = {
  // ── Server ──────────────────────────────────────────────────────────────
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  PORT: requirePositiveInt('PORT', 3001),

  // ── CORS ────────────────────────────────────────────────────────────────
  /** Comma-separated list of allowed origins, e.g. "http://localhost:3000,https://app.example.com" */
  FRONTEND_URL: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),

  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: optionalEnv('DATABASE_URL', 'file:./dev.db'),

  // ── JWT ──────────────────────────────────────────────────────────────────
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: optionalEnv('JWT_EXPIRES_IN', '24h'),

  // ── Stellar / Soroban ────────────────────────────────────────────────────
  STELLAR_NETWORK: optionalEnv('STELLAR_NETWORK', 'testnet') as Network,
  RPC_URL: optionalEnv('RPC_URL', 'https://soroban-testnet.stellar.org'),
  CONTRACT_ID: requireEnv('CONTRACT_ID'),

  /**
   * Server-side Stellar secret key used to sign oracle transactions.
   * Must start with 'S' (Stellar secret format).
   */
  SERVER_SECRET_KEY: requireEnv('SERVER_SECRET_KEY'),

  // ── Oracle / Appraisal ───────────────────────────────────────────────────
  /** How often (ms) the event poller syncs on-chain Soroban events */
  POLL_INTERVAL_MS: requirePositiveInt('POLL_INTERVAL_MS', 15_000),

  /** Start ledger for event polling (0 = latest) */
  START_LEDGER: requirePositiveInt('START_LEDGER', 0),

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  REDIS_URL: optionalEnv('REDIS_URL', ''),
  RATE_LIMIT_GLOBAL_MAX: requirePositiveInt('RATE_LIMIT_GLOBAL_MAX', 100),
  RATE_LIMIT_USER_MAX: requirePositiveInt('RATE_LIMIT_USER_MAX', 500),
  RATE_LIMIT_ORACLE_MAX: requirePositiveInt('RATE_LIMIT_ORACLE_MAX', 10),
  RATE_LIMIT_WINDOW_MS: requirePositiveInt('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 mins
  RATE_LIMIT_AUTH_MAX_FAILED_ATTEMPTS: requirePositiveInt('RATE_LIMIT_AUTH_MAX_FAILED_ATTEMPTS', 5),
  RATE_LIMIT_AUTH_BLOCK_DURATION_MS: requirePositiveInt('RATE_LIMIT_AUTH_BLOCK_DURATION_MS', 10 * 60 * 1000), // 10 mins

  // ── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
} as const;

// Validate SERVER_SECRET_KEY starts with 'S' (Stellar secret key prefix)
if (!env.SERVER_SECRET_KEY.startsWith('S')) {
  throw new Error('SERVER_SECRET_KEY must be a valid Stellar secret key starting with "S"');
}

export type Env = typeof env;
