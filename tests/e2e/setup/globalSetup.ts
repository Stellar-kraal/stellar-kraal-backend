/**
 * tests/e2e/setup/globalSetup.ts
 *
 * Runs once before the entire E2E suite:
 *   1. Loads .env.e2e
 *   2. Verifies the backend API is reachable (health check)
 *   3. Pushes a fresh Prisma schema to the E2E SQLite database
 *   4. Optionally deploys fresh Soroban contract instances (E2E_DEPLOY_CONTRACT=true)
 *
 * This ensures each CI run starts with a clean slate.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '../../../');

export default async function globalSetup(): Promise<void> {
  // ── 1. Load .env.e2e ──────────────────────────────────────────────────────
  const envFile = path.join(ROOT, '.env.e2e');
  if (fs.existsSync(envFile)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envFile });
    console.log('[e2e:setup] Loaded .env.e2e');
  } else {
    console.warn('[e2e:setup] .env.e2e not found — using environment variables as-is');
  }

  const apiUrl = process.env['E2E_API_URL'] ?? 'http://localhost:3001';

  // ── 2. Push fresh Prisma schema ───────────────────────────────────────────
  const dbUrl = process.env['DATABASE_URL'] ?? 'file:./e2e.db';
  console.log(`[e2e:setup] Pushing Prisma schema to ${dbUrl}`);
  execSync('npx prisma db push --accept-data-loss --skip-generate', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl, NODE_ENV: 'test' },
    stdio: 'pipe',
  });

  // ── 3. Wait for backend API to be ready ───────────────────────────────────
  console.log(`[e2e:setup] Waiting for backend at ${apiUrl}/health …`);
  await waitForBackend(apiUrl);
  console.log('[e2e:setup] Backend is ready');

  // ── 4. Optional contract deployment ──────────────────────────────────────
  if (process.env['E2E_DEPLOY_CONTRACT'] === 'true') {
    console.log('[e2e:setup] E2E_DEPLOY_CONTRACT=true — deploying fresh contract …');
    const contractId = deployContract();
    process.env['E2E_CONTRACT_ID'] = contractId;
    console.log(`[e2e:setup] Contract deployed: ${contractId}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Poll the /health endpoint until it returns 200 or the timeout is reached.
 */
async function waitForBackend(
  apiUrl: string,
  timeoutMs = 60_000,
  intervalMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (res.ok) return;
    } catch {
      // Backend not up yet — keep polling
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `[e2e:setup] Backend at ${apiUrl} did not become ready within ${timeoutMs}ms.\n` +
    'Make sure the backend is running (npm run dev) or the CI step starts it first.',
  );
}

/**
 * Deploy a fresh Soroban contract using stellar-cli.
 * Requires stellar-cli to be installed and STELLAR_SECRET_KEY to be set.
 *
 * Returns the new contract ID.
 */
function deployContract(): string {
  const network = process.env['E2E_NETWORK'] ?? 'testnet';
  const secretKey = process.env['E2E_SERVER_SECRET_KEY'];

  if (!secretKey) {
    throw new Error('[e2e:setup] E2E_SERVER_SECRET_KEY is required for contract deployment');
  }

  const wasmPath = path.join(
    ROOT,
    '../contracts/stellarkraal/target/wasm32-unknown-unknown/release/stellarkraal.wasm',
  );

  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `[e2e:setup] Contract WASM not found at ${wasmPath}.\n` +
      'Build the contract first: cd contracts/stellarkraal && cargo build --release --target wasm32-unknown-unknown',
    );
  }

  // Upload the WASM
  const uploadResult = execSync(
    `stellar contract upload --wasm ${wasmPath} --source ${secretKey} --network ${network}`,
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();

  // uploadResult is the WASM hash
  const wasmHash = uploadResult.split('\n').pop()?.trim() ?? '';

  // Deploy an instance
  const deployResult = execSync(
    `stellar contract deploy --wasm-hash ${wasmHash} --source ${secretKey} --network ${network}`,
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();

  // deployResult is the contract ID (C…)
  const contractId = deployResult.split('\n').pop()?.trim() ?? '';

  if (!contractId.startsWith('C')) {
    throw new Error(`[e2e:setup] Unexpected contract deploy output: ${deployResult}`);
  }

  return contractId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
