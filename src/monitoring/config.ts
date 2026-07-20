/**
 * src/monitoring/config.ts
 *
 * Environment configuration for the anomaly detection / monitoring service.
 *
 * Deliberately independent from `src/config/env.ts`: the monitoring service
 * is deployed and operated as its own process/container (see
 * `monitoring/Dockerfile`) and must not fail to start because unrelated
 * backend secrets (JWT_SECRET, SERVER_SECRET_KEY, DATABASE_URL, ...) are
 * absent from its environment.
 */

import { config as dotenvConfig } from 'dotenv';

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

function optionalPositiveInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${key} must be a non-negative integer, got: "${raw}"`);
  }
  return parsed;
}

function optionalPositiveNumber(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${key} must be a non-negative number, got: "${raw}"`);
  }
  return parsed;
}

function optionalList(key: string, defaultValue: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const HORIZON_URL_BY_NETWORK: Record<Network, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
  futurenet: 'https://horizon-futurenet.stellar.org',
  standalone: 'http://localhost:8000',
};

const network = optionalEnv('STELLAR_NETWORK', 'testnet') as Network;

export const monitorConfig = {
  // ── Target ──────────────────────────────────────────────────────────────
  STELLAR_NETWORK: network,
  CONTRACT_ID: requireEnv('CONTRACT_ID'),
  HORIZON_URL: optionalEnv('HORIZON_URL', HORIZON_URL_BY_NETWORK[network] ?? HORIZON_URL_BY_NETWORK.testnet),

  // ── Service ─────────────────────────────────────────────────────────────
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
  MONITOR_PORT: optionalPositiveInt('MONITOR_PORT', 3002),
  /** Max age (ms) since the last processed event before /health reports unhealthy */
  MAX_EVENT_LAG_MS: optionalPositiveInt('MAX_EVENT_LAG_MS', 10_000),

  // ── Alerting / webhook ──────────────────────────────────────────────────
  WEBHOOK_URL: requireEnv('WEBHOOK_URL'),
  /** 'slack' formats a Slack-compatible incoming-webhook payload; 'generic' posts raw JSON (PagerDuty Events API v2 etc.) */
  WEBHOOK_FORMAT: optionalEnv('WEBHOOK_FORMAT', 'slack') as 'slack' | 'generic',
  /** Cooldown window (seconds) during which a repeat of the same anomaly is suppressed */
  ALERT_COOLDOWN_SECONDS: optionalPositiveInt('ALERT_COOLDOWN_SECONDS', 900),

  // ── Rule: large value transfer (e.g. large collateral mint / retirement) ─
  LARGE_VALUE_FUNCTIONS: optionalList('LARGE_VALUE_FUNCTIONS', ['mint_collateral']),
  LARGE_VALUE_THRESHOLD: optionalPositiveNumber('LARGE_VALUE_THRESHOLD', 50_000),

  // ── Rule: oracle price deviation ─────────────────────────────────────────
  ORACLE_PRICE_FUNCTIONS: optionalList('ORACLE_PRICE_FUNCTIONS', ['mint_collateral', 'set_price']),
  ORACLE_DEVIATION_THRESHOLD_PCT: optionalPositiveNumber('ORACLE_DEVIATION_THRESHOLD_PCT', 20),
  ORACLE_DEVIATION_MIN_SAMPLES: optionalPositiveInt('ORACLE_DEVIATION_MIN_SAMPLES', 3),

  // ── Rule: unauthorized entry-point calls ─────────────────────────────────
  PRIVILEGED_FUNCTIONS: optionalList('PRIVILEGED_FUNCTIONS', ['mint_collateral', 'set_price']),
  /** Stellar G-addresses allowed to invoke PRIVILEGED_FUNCTIONS; empty = only failures are flagged */
  ALLOWED_INVOKER_ACCOUNTS: optionalList('ALLOWED_INVOKER_ACCOUNTS', []),

  // ── Rule: transaction volume spike ───────────────────────────────────────
  VOLUME_WINDOW_SECONDS: optionalPositiveInt('VOLUME_WINDOW_SECONDS', 60),
  VOLUME_BASELINE_WINDOWS: optionalPositiveInt('VOLUME_BASELINE_WINDOWS', 10),
  VOLUME_SPIKE_MULTIPLIER: optionalPositiveNumber('VOLUME_SPIKE_MULTIPLIER', 3),
  /** Minimum operation count in a window before the multiplier check applies, to avoid noise at a low baseline */
  VOLUME_SPIKE_MIN_COUNT: optionalPositiveInt('VOLUME_SPIKE_MIN_COUNT', 10),
} as const;

export type MonitorConfig = typeof monitorConfig;
