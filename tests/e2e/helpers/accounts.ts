/**
 * tests/e2e/helpers/accounts.ts
 *
 * Manages funded Stellar testnet keypairs for E2E tests.
 * Each test run generates fresh keypairs and funds them via Friendbot so
 * tests are fully isolated and never share wallet state.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { E2E_CONFIG } from '../config';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const FUND_TIMEOUT_MS = 30_000;

export interface TestAccount {
  keypair: Keypair;
  publicKey: string;
  /** Secret key — available in-process only, never logged */
  secretKey: string;
}

/**
 * Generate a fresh Stellar keypair and fund it via Friendbot.
 * Throws if funding does not confirm within FUND_TIMEOUT_MS.
 */
export async function createFundedAccount(): Promise<TestAccount> {
  const keypair = Keypair.random();

  await fundVieFriendbot(keypair.publicKey());

  return {
    keypair,
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Create and fund multiple accounts in parallel.
 */
export async function createFundedAccounts(count: number): Promise<TestAccount[]> {
  return Promise.all(Array.from({ length: count }, () => createFundedAccount()));
}

/**
 * Fund a Stellar testnet address via Friendbot.
 * Retries once on network error.
 */
async function fundVieFriendbot(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FUND_TIMEOUT_MS);

  try {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { signal: controller.signal });

        if (res.ok) {
          if (E2E_CONFIG.verbose) {
            console.log(`[accounts] Funded ${publicKey.slice(0, 8)}… via Friendbot`);
          }
          return;
        }

        const body = await res.text().catch(() => '');
        // 400 with "createAccountAlreadyExist" means the account was already funded
        if (res.status === 400 && body.includes('createAccountAlreadyExist')) {
          return;
        }

        lastError = new Error(`Friendbot returned ${res.status}: ${body.slice(0, 200)}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 3) {
          await sleep(2_000 * attempt);
        }
      }
    }

    throw lastError ?? new Error('Friendbot funding failed after 3 attempts');
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
