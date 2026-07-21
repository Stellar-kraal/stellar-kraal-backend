/**
 * tests/integration/auth.routes.test.ts
 *
 * Integration tests for authentication endpoints.
 * Uses supertest against the real Express app with a test SQLite database.
 * Soroban RPC calls are mocked.
 */

import request from 'supertest';
import { Keypair, Transaction, xdr } from '@stellar/stellar-sdk';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import { issueJwt } from '../../src/services/auth.service';
import type { Application } from 'express';

// ─── Mock Soroban ─────────────────────────────────────────────────────────────
// Prevent any live RPC calls during tests
jest.mock('../../src/services/soroban.service', () => ({
  startEventPoller: jest.fn(),
  stopEventPoller: jest.fn(),
  mintCollateral: jest.fn().mockResolvedValue('mocktxhash123'),
  getLoanState: jest.fn().mockResolvedValue(null),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: Application;

beforeAll(async () => {
  app = createApp();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean relevant tables before each test
  await prisma.loan.deleteMany();
  await prisma.livestock.deleteMany();
  await prisma.user.deleteMany();
});

// ─── GET /api/auth/challenge ──────────────────────────────────────────────────

describe('GET /api/auth/challenge', () => {
  const keypair = Keypair.random();

  it('returns 200 with a transaction field for a valid public key', async () => {
    const res = await request(app)
      .get('/api/auth/challenge')
      .query({ publicKey: keypair.publicKey() });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('transaction');
    expect(typeof res.body.transaction).toBe('string');
  });

  it('returns 400 when publicKey is missing', async () => {
    const res = await request(app).get('/api/auth/challenge');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for an invalid Stellar public key', async () => {
    const res = await request(app)
      .get('/api/auth/challenge')
      .query({ publicKey: 'NOTAVALIDKEY' });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const keypair = Keypair.random();

  async function getSignedChallenge() {
    const challengeRes = await request(app)
      .get('/api/auth/challenge')
      .query({ publicKey: keypair.publicKey() });

    const { transaction: xdrStr } = challengeRes.body as { transaction: string };
    const envelope = xdr.TransactionEnvelope.fromXDR(xdrStr, 'base64');
    const tx = new Transaction(envelope, 'Test SDF Network ; September 2015');
    tx.sign(keypair);
    return tx.toEnvelope().toXDR('base64');
  }

  it('returns 200 with a JWT token and user object on valid login', async () => {
    const signedTx = await getSignedChallenge();

    const res = await request(app).post('/api/auth/login').send({
      publicKey: keypair.publicKey(),
      signedTransaction: signedTx,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.publicKey).toBe(keypair.publicKey());
    expect(res.body.user.role).toBe('FARMER');
  });

  it('creates a new user record on first login', async () => {
    const signedTx = await getSignedChallenge();
    await request(app).post('/api/auth/login').send({
      publicKey: keypair.publicKey(),
      signedTransaction: signedTx,
    });

    const user = await prisma.user.findUnique({
      where: { publicKey: keypair.publicKey() },
    });
    expect(user).not.toBeNull();
    expect(user?.role).toBe('FARMER');
  });

  it('returns 400 when publicKey is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({
      signedTransaction: 'some-xdr',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when signedTransaction is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({
      publicKey: keypair.publicKey(),
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 when the challenge has not been requested first', async () => {
    const freshKeypair = Keypair.random();
    const res = await request(app).post('/api/auth/login').send({
      publicKey: freshKeypair.publicKey(),
      signedTransaction: 'invalid-xdr-no-challenge',
    });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns the user profile for an authenticated request', async () => {
    const user = await prisma.user.create({
      data: {
        publicKey: Keypair.random().publicKey(),
        role: 'FARMER',
        displayName: 'Test Farmer',
      },
    });

    const token = issueJwt({
      sub: user.id,
      publicKey: user.publicKey,
      role: user.role,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.publicKey).toBe(user.publicKey);
    expect(res.body.user.displayName).toBe('Test Farmer');
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');

    expect(res.status).toBe(401);
  });

  it('returns 404 when the user no longer exists in the DB', async () => {
    const token = issueJwt({
      sub: 'nonexistent-user-id',
      publicKey: Keypair.random().publicKey(),
      role: 'FARMER',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/auth/me ───────────────────────────────────────────────────────

describe('PATCH /api/auth/me', () => {
  it('updates profile fields', async () => {
    const user = await prisma.user.create({
      data: { publicKey: Keypair.random().publicKey(), role: 'FARMER' },
    });

    const token = issueJwt({
      sub: user.id,
      publicKey: user.publicKey,
      role: user.role,
    });

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Updated Name', country: 'ZA' });

    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Updated Name');
    expect(res.body.user.country).toBe('ZA');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .send({ displayName: 'No Auth' });

    expect(res.status).toBe(401);
  });
});

// ─── Cookie-based session ─────────────────────────────────────────────────────

describe('HttpOnly cookie session', () => {
  it('authenticates a request using the session cookie (no Authorization header)', async () => {
    const user = await prisma.user.create({
      data: { publicKey: Keypair.random().publicKey(), role: 'FARMER' },
    });
    const token = issueJwt({
      sub: user.id,
      publicKey: user.publicKey,
      role: user.role,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `sk_session=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('prefers a valid cookie over a malformed Authorization header', async () => {
    const user = await prisma.user.create({
      data: { publicKey: Keypair.random().publicKey(), role: 'FARMER' },
    });
    const token = issueJwt({
      sub: user.id,
      publicKey: user.publicKey,
      role: user.role,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `sk_session=${token}`)
      .set('Authorization', 'Bearer not.a.valid.token');

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cleared = cookies.find((c) => c.startsWith('sk_session='));
    expect(cleared).toBeDefined();
    // Cleared cookies carry an expiry in the past / empty value
    expect(cleared!.toLowerCase()).toMatch(/expires=thu, 01 jan 1970|max-age=0/);
  });

  it('is idempotent when no session exists', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});
