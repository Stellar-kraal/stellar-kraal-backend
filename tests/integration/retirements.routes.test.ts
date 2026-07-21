/**
 * tests/integration/retirements.routes.test.ts
 *
 * Integration tests for the bulk credit retirement endpoint.
 * "Retiring a credit" in this platform maps to repaying/closing a loan
 * (see src/controllers/retirements.controller.ts).
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import { issueJwt } from '../../src/services/auth.service';
import type { Application } from 'express';
import type { RetirementChunkResult } from '../../src/services/soroban.service';

// ─── Mock Soroban ─────────────────────────────────────────────────────────────
jest.mock('../../src/services/soroban.service', () => ({
  startEventPoller: jest.fn(),
  stopEventPoller: jest.fn(),
  retireLoansOnChain: jest.fn(),
}));

import { retireLoansOnChain } from '../../src/services/soroban.service';

const mockRetireLoansOnChain = retireLoansOnChain as jest.MockedFunction<
  typeof retireLoansOnChain
>;

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: Application;
let farmerToken: string;
let farmerId: string;

beforeAll(async () => {
  app = createApp();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.idempotencyKey.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.livestock.deleteMany();
  await prisma.user.deleteMany();

  const keypair = Keypair.random();
  const user = await prisma.user.create({
    data: { publicKey: keypair.publicKey(), role: 'FARMER' },
  });
  farmerId = user.id;
  farmerToken = issueJwt({ sub: user.id, publicKey: user.publicKey, role: user.role });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createVerifiedLivestock(ownerId: string): Promise<string> {
  const livestock = await prisma.livestock.create({
    data: {
      animalId: `TAG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ownerId,
      metadata: JSON.stringify({ type: 'CATTLE', breed: 'angus' }),
      appraisedValueUSDC: 1000.0,
      verificationStatus: 'VERIFIED',
    },
  });
  return livestock.id;
}

async function createActiveLoan(
  borrowerId: string,
  livestockId: string,
  contractLoanId: string,
): Promise<string> {
  const loan = await prisma.loan.create({
    data: {
      contractLoanId,
      borrowerId,
      livestockId,
      principalUSDC: 500.0,
      interestRateBps: 500,
      durationDays: 90,
      status: 'ACTIVE',
    },
  });
  return loan.id;
}

// ─── POST /api/retirements/bulk ────────────────────────────────────────────────

describe('POST /api/retirements/bulk', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/retirements/bulk')
      .send({ loanIds: ['abc'] });

    expect(res.status).toBe(401);
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();
  });

  it('returns 400 when loanIds is missing or empty', async () => {
    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: [] });

    expect(res.status).toBe(400);
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();
  });

  it('returns 422 and never hits the chain when the batch exceeds the configured maximum', async () => {
    const oversized = Array.from({ length: 101 }, (_, i) => `fake-${i}`);

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: oversized });

    expect(res.status).toBe(422);
    expect(res.body.maxBatchSize).toBe(100);
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();
  });

  it('returns 422 when loanIds contains duplicates', async () => {
    const livestockId = await createVerifiedLivestock(farmerId);
    const loanId = await createActiveLoan(farmerId, livestockId, 'DUP-1');

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: [loanId, loanId] });

    expect(res.status).toBe(422);
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();
  });

  it('rejects a 50-credit batch with one invalid credit before submitting anything on-chain', async () => {
    const livestockId = await createVerifiedLivestock(farmerId);
    const validIds: string[] = [];
    for (let i = 0; i < 49; i++) {
      validIds.push(await createActiveLoan(farmerId, livestockId, `VALID-${i}`));
    }
    const batch = [...validIds, 'does-not-exist'];

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: batch });

    expect(res.status).toBe(422);
    expect(res.body.invalid).toContainEqual({
      loanId: 'does-not-exist',
      reason: 'Loan not found',
    });
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();

    // None of the valid loans should have been touched either.
    const stillActive = await prisma.loan.count({ where: { status: 'ACTIVE' } });
    expect(stillActive).toBe(49);
  });

  it('rejects the batch when a loan belongs to a different borrower', async () => {
    const otherKeypair = Keypair.random();
    const otherUser = await prisma.user.create({
      data: { publicKey: otherKeypair.publicKey(), role: 'FARMER' },
    });
    const livestockId = await createVerifiedLivestock(otherUser.id);
    const otherLoanId = await createActiveLoan(otherUser.id, livestockId, 'OTHER-1');

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: [otherLoanId] });

    expect(res.status).toBe(422);
    expect(res.body.invalid[0]).toMatchObject({
      loanId: otherLoanId,
      reason: 'Not the borrower of this loan',
    });
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();
  });

  it('rejects the batch when a loan is not ACTIVE', async () => {
    const livestockId = await createVerifiedLivestock(farmerId);
    const repaidLoan = await prisma.loan.create({
      data: {
        contractLoanId: 'ALREADY-REPAID',
        borrowerId: farmerId,
        livestockId,
        principalUSDC: 100,
        interestRateBps: 300,
        durationDays: 30,
        status: 'REPAID',
      },
    });

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: [repaidLoan.id] });

    expect(res.status).toBe(422);
    expect(res.body.invalid[0].reason).toMatch(/not ACTIVE/i);
    expect(mockRetireLoansOnChain).not.toHaveBeenCalled();
  });

  it('retires a valid batch, marks loans REPAID, and returns 200 when all succeed', async () => {
    const livestockId = await createVerifiedLivestock(farmerId);
    const loanId1 = await createActiveLoan(farmerId, livestockId, 'C-1');
    const loanId2 = await createActiveLoan(farmerId, livestockId, 'C-2');

    mockRetireLoansOnChain.mockResolvedValueOnce([
      {
        loanIds: [loanId1, loanId2],
        contractLoanIds: ['C-1', 'C-2'],
        status: 'SUCCESS',
        txHash: 'tx-hash-1',
      },
    ] satisfies RetirementChunkResult[]);

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: [loanId1, loanId2] });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ retired: 2, failed: 0, skipped: 0 });
    expect(res.body.results).toEqual(
      expect.arrayContaining([
        { loanId: loanId1, status: 'retired', txHash: 'tx-hash-1' },
        { loanId: loanId2, status: 'retired', txHash: 'tx-hash-1' },
      ]),
    );

    const updated1 = await prisma.loan.findUnique({ where: { id: loanId1 } });
    const updated2 = await prisma.loan.findUnique({ where: { id: loanId2 } });
    expect(updated1?.status).toBe('REPAID');
    expect(updated2?.status).toBe('REPAID');
    expect(updated1?.repaidAt).not.toBeNull();
  });

  it('returns 207 and marks later chunks skipped when an earlier on-chain chunk fails', async () => {
    const livestockId = await createVerifiedLivestock(farmerId);
    const loanId1 = await createActiveLoan(farmerId, livestockId, 'CHUNK-1');
    const loanId2 = await createActiveLoan(farmerId, livestockId, 'CHUNK-2');

    mockRetireLoansOnChain.mockResolvedValueOnce([
      {
        loanIds: [loanId1],
        contractLoanIds: ['CHUNK-1'],
        status: 'FAILED',
        error: 'Simulation failed: insufficient resource fee',
      },
      {
        loanIds: [loanId2],
        contractLoanIds: ['CHUNK-2'],
        status: 'SKIPPED',
        error: 'Skipped: an earlier batch in this request failed on-chain',
      },
    ] satisfies RetirementChunkResult[]);

    const res = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ loanIds: [loanId1, loanId2] });

    expect(res.status).toBe(207);
    expect(res.body.summary).toEqual({ retired: 0, failed: 1, skipped: 1 });

    const stillActive1 = await prisma.loan.findUnique({ where: { id: loanId1 } });
    const stillActive2 = await prisma.loan.findUnique({ where: { id: loanId2 } });
    expect(stillActive1?.status).toBe('ACTIVE');
    expect(stillActive2?.status).toBe('ACTIVE');
  });

  it('replays the cached response for a repeated Idempotency-Key without retiring again', async () => {
    const livestockId = await createVerifiedLivestock(farmerId);
    const loanId = await createActiveLoan(farmerId, livestockId, 'IDEMP-1');

    mockRetireLoansOnChain.mockResolvedValueOnce([
      {
        loanIds: [loanId],
        contractLoanIds: ['IDEMP-1'],
        status: 'SUCCESS',
        txHash: 'tx-hash-idemp',
      },
    ] satisfies RetirementChunkResult[]);

    const idempotencyKey = 'retire-batch-key-001';

    const first = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ loanIds: [loanId] });

    expect(first.status).toBe(200);
    expect(mockRetireLoansOnChain).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post('/api/retirements/bulk')
      .set('Authorization', `Bearer ${farmerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ loanIds: [loanId] });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    // Not called again — the idempotency middleware served the cached response.
    expect(mockRetireLoansOnChain).toHaveBeenCalledTimes(1);
  });
});
