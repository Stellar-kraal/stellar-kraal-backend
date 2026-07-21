/**
 * tests/e2e/setup/jestEnvSetup.ts
 *
 * Runs via jest.e2e.config.ts `setupFiles` — executes in the worker process
 * before each test module is loaded.
 *
 * Sets the minimum process.env values required by src/config/env.ts so that
 * any transitive import of the Express app during E2E tests does not throw
 * "Missing required environment variable" at import time.
 *
 * Real E2E values are loaded from .env.e2e by globalSetup.ts which runs in
 * the main Jest process. These defaults are only a safety net for worker
 * processes that do not re-run globalSetup.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envFile = path.resolve(__dirname, '../../../.env.e2e');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

// Ensure required variables always have a value so env.ts passes validation
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./e2e.db',
  JWT_SECRET: 'e2e-jwt-secret-that-is-long-enough-for-testing-purposes',
  JWT_EXPIRES_IN: '2h',
  CONTRACT_ID:
    process.env['E2E_CONTRACT_ID'] ??
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  AUTH_SERVER_SECRET_KEY:
    process.env['E2E_AUTH_SERVER_SECRET_KEY'] ??
    process.env['E2E_SERVER_SECRET_KEY'] ??
    'SDFECHYSBJGAAABWHN2ILB4NYDCQBNWJUALWS3EW6CHP2MY4ODMR3DCN',
  ORACLE_SERVER_SECRET_KEY:
    process.env['E2E_ORACLE_SERVER_SECRET_KEY'] ??
    process.env['E2E_SERVER_SECRET_KEY'] ??
    'SDANUWG4TWFQT52IBLDBSZGDVO6HIG72I7JO7VJTL5G44EMHPMJCHOOU',
  SERVER_SECRET_KEY:
    process.env['E2E_SERVER_SECRET_KEY'] ??
    'SDANUWG4TWFQT52IBLDBSZGDVO6HIG72I7JO7VJTL5G44EMHPMJCHOOU',
  STELLAR_NETWORK: process.env['E2E_NETWORK'] ?? 'testnet',
  RPC_URL:
    process.env['E2E_RPC_URL'] ?? 'https://soroban-testnet.stellar.org',
  FRONTEND_URL: 'http://localhost:3000',
  POLL_INTERVAL_MS: '60000',
  START_LEDGER: '0',
  LOG_LEVEL: 'warn',
  PORT: '3001',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
