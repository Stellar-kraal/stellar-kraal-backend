/**
 * src/services/auth.service.ts
 *
 * Authentication service implementing:
 *  1. SEP-10 style challenge/response: server builds a time-bounded transaction,
 *     the client signs it with their Stellar keypair, server verifies the
 *     signature and issues a JWT.
 *  2. JWT issue / verify helpers.
 *
 * SEP-10 simplified flow (no Stellar anchor toml required for backend-only):
 *   POST /api/auth/challenge  { publicKey } → { transaction: XDR }
 *   POST /api/auth/login      { publicKey, signedTransaction: XDR } → { token }
 */

import {
  Keypair,
  Transaction,
  Networks,
  TransactionBuilder,
  Account,
  Operation,
  BASE_FEE,
  xdr,
  StrKey,
  Memo,
} from '@stellar/stellar-sdk';
import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { createLogger } from '../lib/logger';
import { env } from '../config/env';
import prisma from '../lib/prisma';
import { Role } from '../types/domain';

const log = createLogger('auth-service');

// ─── JWT helpers ─────────────────────────────────────────────────────────────

export interface TokenPayload extends JwtPayload {
  sub: string;   // user.id (cuid)
  publicKey: string;
  role: Role;
}

/** Issue a signed JWT for a verified user */
export function issueJwt(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as string,
    algorithm: 'HS256',
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/** Verify a JWT and return its decoded payload. Throws on invalid/expired token. */
export function verifyJwt(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as TokenPayload;
}

// ─── SEP-10 Challenge ─────────────────────────────────────────────────────────

const NETWORK_PASSPHRASE: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
  standalone: Networks.STANDALONE,
};

/** TTL for the challenge transaction (5 minutes) */
const CHALLENGE_TTL_SECONDS = 300;

/** In-memory nonce store. In production use Redis with TTL. */
const pendingChallenges = new Map<string, { nonce: string; expiresAt: number }>();

function networkPassphrase(): string {
  return NETWORK_PASSPHRASE[env.STELLAR_NETWORK] ?? Networks.TESTNET;
}

/**
 * Build a SEP-10 style challenge transaction.
 *
 * The transaction contains a manage_data operation with a random nonce
 * signed by the server keypair. The client must re-sign it with their keypair.
 *
 * @returns base64-encoded unsigned XDR transaction envelope
 */
export async function buildChallenge(clientPublicKey: string): Promise<string> {
  // Validate the public key
  if (!StrKey.isValidEd25519PublicKey(clientPublicKey)) {
    throw new Error('Invalid Stellar public key');
  }

  const serverKeypair = Keypair.fromSecret(env.AUTH_SERVER_SECRET_KEY);

  // Use sequence 0 — challenge transactions are never submitted
  const serverAccount = new Account(serverKeypair.publicKey(), '0');

  const nonce = crypto.randomUUID().replace(/-/g, ''); // 32 hex chars
  const minTime = Math.floor(Date.now() / 1000);
  const maxTime = minTime + CHALLENGE_TTL_SECONDS;

  // manageData value is limited to 64 bytes.
  // Format: "${clientPublicKey}:${nonce.slice(0, 7)}" (56 + 1 + 7 = 64 bytes)
  const valueBytes = Buffer.from(`${clientPublicKey}:${nonce.slice(0, 7)}`);

  const tx = new TransactionBuilder(serverAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      Operation.manageData({
        name: 'stellarkraal_auth',
        value: valueBytes,
        source: clientPublicKey,
      }),
    )
    .addMemo(Memo.none())
    .setTimebounds(minTime, maxTime)
    .build();

  // Server pre-signs to prove authenticity
  tx.sign(serverKeypair);

  const xdrEnvelope = tx.toEnvelope().toXDR('base64');

  // Store nonce for verification
  pendingChallenges.set(clientPublicKey, {
    nonce,
    expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  });

  log.info('Challenge built', { publicKey: clientPublicKey });
  return xdrEnvelope;
}

/**
 * Verify a signed challenge transaction.
 *
 * Steps:
 *  1. Decode the XDR envelope.
 *  2. Check time bounds are still valid.
 *  3. Extract nonce from the manage_data operation.
 *  4. Validate the nonce matches what we issued.
 *  5. Verify the client's signature over the transaction hash.
 *
 * @returns the verified Stellar public key
 */
export async function verifyChallenge(
  clientPublicKey: string,
  signedXdr: string,
): Promise<string> {
  if (!StrKey.isValidEd25519PublicKey(clientPublicKey)) {
    throw new Error('Invalid Stellar public key');
  }

  const pending = pendingChallenges.get(clientPublicKey);
  if (!pending) {
    throw new Error('No pending challenge for this public key');
  }

  if (Date.now() > pending.expiresAt) {
    pendingChallenges.delete(clientPublicKey);
    throw new Error('Challenge has expired');
  }

  let tx: Transaction;
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64');
    tx = new Transaction(envelope, networkPassphrase());
  } catch {
    throw new Error('Invalid transaction XDR');
  }

  // Verify time bounds
  const now = Math.floor(Date.now() / 1000);
  const { minTime, maxTime } = tx.timeBounds ?? {};
  if (!maxTime || now > parseInt(maxTime, 10)) {
    throw new Error('Transaction time bounds expired');
  }
  if (minTime && now < parseInt(minTime, 10)) {
    throw new Error('Transaction time bounds not yet valid');
  }

  // Find and validate the manage_data operation
  const op = tx.operations.find(
    (o): o is Operation.ManageData =>
      o.type === 'manageData' && o.name === 'stellarkraal_auth',
  );

  if (!op?.value) {
    throw new Error('Missing stellarkraal_auth manage_data operation');
  }

  const [embeddedPublicKey, embeddedNonce] = op.value.toString().split(':');
  if (embeddedPublicKey !== clientPublicKey) {
    throw new Error('Public key mismatch in challenge payload');
  }
  if (embeddedNonce !== pending.nonce.slice(0, 7)) {
    throw new Error('Nonce mismatch');
  }

  // Verify the client has signed the transaction
  const clientKeypair = Keypair.fromPublicKey(clientPublicKey);
  const txHash = tx.hash();
  const clientSig = tx.signatures.find((sig) => {
    try {
      return clientKeypair.verify(txHash, sig.signature());
    } catch {
      return false;
    }
  });

  if (!clientSig) {
    throw new Error('Missing valid client signature on challenge transaction');
  }

  // Consume the nonce — one-time use
  pendingChallenges.delete(clientPublicKey);

  log.info('Challenge verified', { publicKey: clientPublicKey });
  return clientPublicKey;
}

// ─── User upsert ─────────────────────────────────────────────────────────────

/**
 * Find or create a User record for the given Stellar public key.
 * Returns the user and a freshly issued JWT.
 */
export async function authenticateUser(
  publicKey: string,
): Promise<{ token: string; user: { id: string; publicKey: string; role: Role } }> {
  let user = await prisma.user.findUnique({ where: { publicKey } });

  if (!user) {
    user = await prisma.user.create({
      data: { publicKey, role: Role.FARMER },
    });
    log.info('New user registered', { userId: user.id, publicKey });
  }

  const role = user.role as Role;

  const token = issueJwt({
    sub: user.id,
    publicKey: user.publicKey,
    role,
  });

  return { token, user: { id: user.id, publicKey: user.publicKey, role } };
}
