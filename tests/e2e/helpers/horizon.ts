/**
 * tests/e2e/helpers/horizon.ts
 *
 * Thin wrapper around Horizon REST API for E2E assertions.
 * Used to verify on-chain state independently of the backend database,
 * providing the dual-layer assertion (API response + Horizon query) required
 * by the acceptance criteria.
 */

import { E2E_CONFIG } from '../config';

/** Base URL for Stellar Horizon on the configured network */
const HORIZON_BASE: Record<string, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

function horizonBase(): string {
  return HORIZON_BASE[E2E_CONFIG.network] ?? HORIZON_BASE['testnet']!;
}

/** Returns the Horizon URL for a transaction, useful for structured test reports */
export function horizonTxUrl(txHash: string): string {
  return `${horizonBase()}/transactions/${txHash}`;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface HorizonAccount {
  id: string;
  sequence: string;
  balances: HorizonBalance[];
}

export interface HorizonBalance {
  balance: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

/**
 * Fetch account data from Horizon.
 * Returns null if the account does not exist (404).
 */
export async function getAccount(publicKey: string): Promise<HorizonAccount | null> {
  const url = `${horizonBase()}/accounts/${publicKey}`;
  const res = await horizonGet(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new HorizonError(`Failed to fetch account: ${res.status}`, url, res.status);
  }
  return (await res.json()) as HorizonAccount;
}

/**
 * Assert that a Stellar account exists on the network and is funded.
 * Throws HorizonError if the account cannot be found.
 */
export async function assertAccountFunded(publicKey: string): Promise<HorizonAccount> {
  const account = await getAccount(publicKey);
  if (!account) {
    throw new HorizonError(
      `Account ${publicKey} not found on Horizon (not funded?)`,
      `${horizonBase()}/accounts/${publicKey}`,
      404,
    );
  }
  return account;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface HorizonTransaction {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  successful: boolean;
  operation_count: number;
}

/**
 * Fetch a transaction by hash from Horizon.
 * Returns null if not found.
 */
export async function getTransaction(txHash: string): Promise<HorizonTransaction | null> {
  const url = horizonTxUrl(txHash);
  const res = await horizonGet(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new HorizonError(`Failed to fetch transaction: ${res.status}`, url, res.status);
  }
  return (await res.json()) as HorizonTransaction;
}

/**
 * Poll Horizon until a transaction hash appears as successful,
 * or until the timeout is reached.
 *
 * @param txHash  Transaction hash to wait for
 * @param timeoutMs  Maximum wait time (default 60 s)
 * @param intervalMs  Polling interval (default 3 s)
 */
export async function waitForTransaction(
  txHash: string,
  timeoutMs = 60_000,
  intervalMs = 3_000,
): Promise<HorizonTransaction> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tx = await getTransaction(txHash);
    if (tx?.successful) {
      if (E2E_CONFIG.verbose) {
        console.log(`[horizon] Confirmed tx ${txHash.slice(0, 8)}… at ledger ${tx.ledger}`);
      }
      return tx;
    }
    await sleep(intervalMs);
  }

  throw new HorizonError(
    `Transaction ${txHash} not confirmed within ${timeoutMs}ms`,
    horizonTxUrl(txHash),
    408,
  );
}

// ─── Operations ───────────────────────────────────────────────────────────────

export interface HorizonOperation {
  id: string;
  type: string;
  transaction_hash: string;
  created_at: string;
  source_account: string;
}

/**
 * Get the most recent operations for an account, newest first.
 */
export async function getAccountOperations(
  publicKey: string,
  limit = 10,
): Promise<HorizonOperation[]> {
  const url = `${horizonBase()}/accounts/${publicKey}/operations?limit=${limit}&order=desc`;
  const res = await horizonGet(url);
  if (!res.ok) {
    throw new HorizonError(`Failed to fetch operations: ${res.status}`, url, res.status);
  }
  const data = (await res.json()) as { _embedded: { records: HorizonOperation[] } };
  return data._embedded.records;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HORIZON_TIMEOUT_MS = 10_000;

async function horizonGet(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HORIZON_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HorizonError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'HorizonError';
  }
}
