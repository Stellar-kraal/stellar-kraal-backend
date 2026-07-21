/**
 * tests/unit/auth.service.test.ts
 *
 * Unit tests for JWT helpers and challenge building/verification
 * in src/services/auth.service.ts.
 *
 * Soroban network calls are NOT made — challenge verification is tested
 * using real keypair signing in-process.
 */

import {
  Keypair,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';
import {
  issueJwt,
  verifyJwt,
  buildChallenge,
  verifyChallenge,
  TokenPayload,
} from '../../src/services/auth.service';
import { env } from '../../src/config/env';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Deterministic test keypair (never used on mainnet)
const CLIENT_KEYPAIR = Keypair.random();
const CLIENT_PUBLIC_KEY = CLIENT_KEYPAIR.publicKey();

// ─── JWT helpers ─────────────────────────────────────────────────────────────

describe('issueJwt / verifyJwt', () => {
  const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
    sub: 'user-cuid-001',
    publicKey: CLIENT_PUBLIC_KEY,
    role: 'FARMER',
  };

  it('issues a non-empty JWT string', () => {
    const token = issueJwt(payload);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    // JWTs have three dot-separated segments
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies a freshly issued token and returns the original payload', () => {
    const token = issueJwt(payload);
    const decoded = verifyJwt(token);

    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.publicKey).toBe(payload.publicKey);
    expect(decoded.role).toBe(payload.role);
  });

  it('includes iat and exp claims', () => {
    const token = issueJwt(payload);
    const decoded = verifyJwt(token);
    expect(decoded.iat).toBeGreaterThan(0);
    expect(decoded.exp).toBeGreaterThan(decoded.iat!);
  });

  it('throws on a tampered token', () => {
    const token = issueJwt(payload);
    const [header, body, sig] = token.split('.');
    const tampered = `${header}.${body}.${sig}TAMPERED`;
    expect(() => verifyJwt(tampered)).toThrow();
  });

  it('throws on an expired token', () => {
    // Force expiry by signing with a past expiry via the underlying library
    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const expired = jwt.sign(
      { ...payload },
      process.env['JWT_SECRET']!,
      { expiresIn: -1 }, // already expired
    );
    expect(() => verifyJwt(expired)).toThrow();
  });

  it('throws on a completely invalid string', () => {
    expect(() => verifyJwt('not.a.token')).toThrow();
  });

  it('verifies tokens for INVESTOR role', () => {
    const investorToken = issueJwt({ ...payload, role: 'INVESTOR' });
    const decoded = verifyJwt(investorToken);
    expect(decoded.role).toBe('INVESTOR');
  });

  it('verifies tokens for ADMIN role', () => {
    const adminToken = issueJwt({ ...payload, role: 'ADMIN' });
    const decoded = verifyJwt(adminToken);
    expect(decoded.role).toBe('ADMIN');
  });
});

// ─── SEP-10 Challenge ─────────────────────────────────────────────────────────

describe('buildChallenge', () => {
  it('returns a non-empty base64 XDR string', async () => {
    const xdrStr = await buildChallenge(CLIENT_PUBLIC_KEY);
    expect(typeof xdrStr).toBe('string');
    expect(xdrStr.length).toBeGreaterThan(50);
  });

  it('produces a valid Stellar transaction XDR', async () => {
    const xdrStr = await buildChallenge(CLIENT_PUBLIC_KEY);
    expect(() => {
      const envelope = xdr.TransactionEnvelope.fromXDR(xdrStr, 'base64');
      new Transaction(envelope, 'Test SDF Network ; September 2015');
    }).not.toThrow();
  });

  it('throws for an invalid public key', async () => {
    await expect(buildChallenge('NOTAVALIDKEY')).rejects.toThrow(
      'Invalid Stellar public key',
    );
  });

  it('returns different XDR for each call (nonces differ)', async () => {
    const xdr1 = await buildChallenge(CLIENT_PUBLIC_KEY);
    const xdr2 = await buildChallenge(CLIENT_PUBLIC_KEY);
    expect(xdr1).not.toBe(xdr2);
  });
});

// ─── SEP-10 Verification ─────────────────────────────────────────────────────

describe('verifyChallenge', () => {
  it('verifies a challenge signed by the correct client keypair', async () => {
    const xdrStr = await buildChallenge(CLIENT_PUBLIC_KEY);

    // Decode, client signs, re-encode
    const envelope = xdr.TransactionEnvelope.fromXDR(xdrStr, 'base64');
    const tx = new Transaction(envelope, 'Test SDF Network ; September 2015');
    tx.sign(CLIENT_KEYPAIR);
    const signedXdr = tx.toEnvelope().toXDR('base64');

    const result = await verifyChallenge(CLIENT_PUBLIC_KEY, signedXdr);
    expect(result).toBe(CLIENT_PUBLIC_KEY);
  });

  it('throws when no challenge has been issued for the public key', async () => {
    const freshKey = Keypair.random().publicKey();
    await expect(
      verifyChallenge(freshKey, 'any-xdr'),
    ).rejects.toThrow('No pending challenge');
  });

  it('throws when the client signature is missing (not signed by client)', async () => {
    const xdrStr = await buildChallenge(CLIENT_PUBLIC_KEY);
    // Do NOT add client signature — pass back the server-only-signed tx

    await expect(
      verifyChallenge(CLIENT_PUBLIC_KEY, xdrStr),
    ).rejects.toThrow();
  });

  it('throws for an invalid XDR string', async () => {
    // Seed a challenge first so the nonce store has an entry
    await buildChallenge(CLIENT_PUBLIC_KEY);

    await expect(
      verifyChallenge(CLIENT_PUBLIC_KEY, 'this-is-not-valid-xdr'),
    ).rejects.toThrow('Invalid transaction XDR');
  });

  it('throws for an invalid client public key', async () => {
    await expect(
      verifyChallenge('BADKEY', 'any-xdr'),
    ).rejects.toThrow('Invalid Stellar public key');
  });

  it('nonce is consumed after successful verification (one-time use)', async () => {
    const xdrStr = await buildChallenge(CLIENT_PUBLIC_KEY);
    const envelope = xdr.TransactionEnvelope.fromXDR(xdrStr, 'base64');
    const tx = new Transaction(envelope, 'Test SDF Network ; September 2015');
    tx.sign(CLIENT_KEYPAIR);
    const signedXdr = tx.toEnvelope().toXDR('base64');

    // First verification succeeds
    await verifyChallenge(CLIENT_PUBLIC_KEY, signedXdr);

    // Second attempt with the same signed XDR fails (nonce consumed)
    await expect(
      verifyChallenge(CLIENT_PUBLIC_KEY, signedXdr),
    ).rejects.toThrow('No pending challenge');
  });
});

// ─── Key Separation (BE-01) ───────────────────────────────────────────────────

describe('Key Separation (BE-01)', () => {
  it('uses distinct keypairs for AUTH_SERVER_SECRET_KEY and ORACLE_SERVER_SECRET_KEY', () => {
    const authKeypair = Keypair.fromSecret(env.AUTH_SERVER_SECRET_KEY);
    const oracleKeypair = Keypair.fromSecret(env.ORACLE_SERVER_SECRET_KEY);

    expect(authKeypair.publicKey()).not.toBe(oracleKeypair.publicKey());
    expect(env.AUTH_SERVER_SECRET_KEY).not.toBe(env.ORACLE_SERVER_SECRET_KEY);
  });

  it('pre-signs SEP-10 auth challenge using AUTH_SERVER_SECRET_KEY', async () => {
    const xdrStr = await buildChallenge(CLIENT_PUBLIC_KEY);
    const envelope = xdr.TransactionEnvelope.fromXDR(xdrStr, 'base64');
    const tx = new Transaction(envelope, 'Test SDF Network ; September 2015');

    const authKeypair = Keypair.fromSecret(env.AUTH_SERVER_SECRET_KEY);
    const oracleKeypair = Keypair.fromSecret(env.ORACLE_SERVER_SECRET_KEY);
    const txHash = tx.hash();

    const isSignedByAuthKey = tx.signatures.some((sig) => {
      try {
        return authKeypair.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });

    const isSignedByOracleKey = tx.signatures.some((sig) => {
      try {
        return oracleKeypair.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });

    expect(isSignedByAuthKey).toBe(true);
    expect(isSignedByOracleKey).toBe(false);
  });
});
