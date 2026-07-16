/**
 * tests/e2e/helpers/auth.ts
 *
 * Performs the full SEP-10 challenge/response authentication flow against
 * the live backend, returning a JWT token ready for use in subsequent
 * API requests.
 */

import { Keypair, Transaction, xdr, Networks } from '@stellar/stellar-sdk';
import { E2E_CONFIG } from '../config';

export interface AuthTokens {
  token: string;
  userId: string;
  publicKey: string;
  role: string;
}

/**
 * Authenticate a keypair against the running backend using SEP-10.
 *
 * Steps:
 *   1. GET /api/auth/challenge?publicKey=G…  → unsigned XDR transaction
 *   2. Sign the transaction with the keypair
 *   3. POST /api/auth/login { publicKey, signedTransaction } → JWT
 */
export async function authenticateKeypair(keypair: Keypair): Promise<AuthTokens> {
  const publicKey = keypair.publicKey();

  // ── Step 1: Get the challenge ────────────────────────────────────────────
  const challengeUrl = `${E2E_CONFIG.apiUrl}/api/auth/challenge?publicKey=${encodeURIComponent(publicKey)}`;
  const challengeRes = await fetchWithTimeout(challengeUrl, { method: 'GET' });

  if (!challengeRes.ok) {
    const body = await challengeRes.text();
    throw new E2EAuthError(
      `Challenge request failed: ${challengeRes.status} ${body}`,
      'GET /api/auth/challenge',
      challengeRes.status,
      body,
    );
  }

  const { transaction: xdrStr } = (await challengeRes.json()) as { transaction: string };

  // ── Step 2: Sign the challenge ────────────────────────────────────────────
  const networkPassphrase =
    E2E_CONFIG.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

  const envelope = xdr.TransactionEnvelope.fromXDR(xdrStr, 'base64');
  const tx = new Transaction(envelope, networkPassphrase);
  tx.sign(keypair);
  const signedXdr = tx.toEnvelope().toXDR('base64');

  // ── Step 3: Login ─────────────────────────────────────────────────────────
  const loginRes = await fetchWithTimeout(`${E2E_CONFIG.apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, signedTransaction: signedXdr }),
  });

  if (!loginRes.ok) {
    const body = await loginRes.text();
    throw new E2EAuthError(
      `Login failed: ${loginRes.status} ${body}`,
      'POST /api/auth/login',
      loginRes.status,
      body,
    );
  }

  const data = (await loginRes.json()) as {
    token: string;
    user: { id: string; publicKey: string; role: string };
  };

  if (E2E_CONFIG.verbose) {
    console.log(`[auth] Authenticated ${publicKey.slice(0, 8)}… as ${data.user.role}`);
  }

  return {
    token: data.token,
    userId: data.user.id,
    publicKey: data.user.publicKey,
    role: data.user.role,
  };
}

/**
 * Build an Authorization header value from a token.
 */
export function bearerHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class E2EAuthError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'E2EAuthError';
  }
}
