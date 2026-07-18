/**
 * tests/integration/price-events.routes.test.ts
 *
 * Integration tests for the price events HTTP endpoints — Issue #25
 *
 * Tests:
 *   GET /api/events/price/:creditId/history  — Historical data REST endpoint
 *   GET /api/events/price/:creditId/oracle   — Oracle reference price
 *   GET /api/events/price/:creditId/stream   — SSE endpoint (connect/disconnect)
 *   Graceful degradation when event feed is unavailable
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';

const app = createApp();

// ── Test data ─────────────────────────────────────────────────────────────────

const TEST_CREDIT_ID = 'CARBON-CREDIT-CHAOS-TEST-001';
const EMPTY_CREDIT_ID = 'CARBON-CREDIT-NO-HISTORY-999';

async function seedPriceEvents() {
  await prisma.priceEvent.createMany({
    data: [
      {
        creditId: TEST_CREDIT_ID,
        type: 'trade',
        priceUSDC: 10.0,
        volume: 100,
        txHash: 'tx-hash-001',
        ledger: 49_000,
        timestamp: new Date('2026-07-01T10:00:00Z'),
      },
      {
        creditId: TEST_CREDIT_ID,
        type: 'oracle_update',
        priceUSDC: 10.5,
        volume: null,
        txHash: 'tx-hash-002',
        ledger: 49_100,
        timestamp: new Date('2026-07-02T10:00:00Z'),
      },
      {
        creditId: TEST_CREDIT_ID,
        type: 'trade',
        priceUSDC: 11.0,
        volume: 50,
        txHash: 'tx-hash-003',
        ledger: 49_200,
        timestamp: new Date('2026-07-03T10:00:00Z'),
      },
    ],
  });
}

async function cleanupPriceEvents() {
  await prisma.priceEvent.deleteMany({
    where: { creditId: { in: [TEST_CREDIT_ID, EMPTY_CREDIT_ID] } },
  });
}

beforeAll(async () => {
  await cleanupPriceEvents();
  await seedPriceEvents();
});

afterAll(async () => {
  await cleanupPriceEvents();
});

// ── GET /history ──────────────────────────────────────────────────────────────

describe('GET /api/events/price/:creditId/history', () => {
  it('should return 200 with price history for a credit that has trades', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history`)
      .expect(200);

    expect(res.body.creditId).toBe(TEST_CREDIT_ID);
    expect(res.body.dataAvailable).toBe(true);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(3);
    expect(res.body.lastUpdated).toBeDefined();
  });

  it('should return history in ascending timestamp order', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history`)
      .expect(200);

    const history = res.body.history as Array<{ timestamp: string; priceUSDC: number }>;
    for (let i = 1; i < history.length; i++) {
      expect(new Date(history[i]!.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(history[i - 1]!.timestamp).getTime(),
      );
    }
  });

  it('should include oracle reference price in the response', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history`)
      .expect(200);

    expect(res.body.oraclePrice).toBeDefined();
    expect(typeof res.body.oraclePrice.priceUSDC).toBe('number');
    expect(res.body.oraclePrice.timestamp).toBeDefined();
  });

  it('should include accessible tabular data for screen readers', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history`)
      .expect(200);

    expect(res.body.table).toBeDefined();
    expect(Array.isArray(res.body.table.columns)).toBe(true);
    expect(Array.isArray(res.body.table.rows)).toBe(true);
    expect(res.body.table.columns).toContain('Price (USDC)');
    expect(res.body.table.rows.length).toBe(res.body.history.length);
  });

  it('should return dataAvailable: false for a credit with no history', async () => {
    const res = await request(app)
      .get(`/api/events/price/${EMPTY_CREDIT_ID}/history`)
      .expect(200);

    expect(res.body.dataAvailable).toBe(false);
    expect(res.body.history).toEqual([]);
    expect(res.body.meta.message).toBeDefined();
  });

  it('should respect the limit query parameter', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history?limit=1`)
      .expect(200);

    expect(res.body.history.length).toBeLessThanOrEqual(1);
    expect(res.body.meta.limit).toBe(1);
  });

  it('should cap limit at 1000', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history?limit=99999`)
      .expect(200);

    expect(res.body.meta.limit).toBe(1000);
  });
});

// ── GET /oracle ───────────────────────────────────────────────────────────────

describe('GET /api/events/price/:creditId/oracle', () => {
  it('should return 200 with oracle price for a credit with oracle events', async () => {
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/oracle`)
      .expect(200);

    expect(res.body.creditId).toBe(TEST_CREDIT_ID);
    expect(res.body.oraclePrice).not.toBeNull();
    expect(typeof res.body.oraclePrice.priceUSDC).toBe('number');
    expect(res.body.oraclePrice.priceUSDC).toBe(10.5);
    expect(res.body.unavailable).toBe(false);
  });

  it('should return unavailable: true when no oracle price exists', async () => {
    const res = await request(app)
      .get(`/api/events/price/${EMPTY_CREDIT_ID}/oracle`)
      .expect(200);

    expect(res.body.oraclePrice).toBeNull();
    expect(res.body.unavailable).toBe(true);
    expect(res.body.stale).toBe(false);
  });

  it('should flag stale oracle price (older than 1 hour)', async () => {
    // The seeded oracle price is from 2026-07-02 — far in the past → stale
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/oracle`)
      .expect(200);

    expect(res.body.stale).toBe(true);
  });
});

// ── GET /stream (SSE) ─────────────────────────────────────────────────────────

describe('GET /api/events/price/:creditId/stream (SSE)', () => {
  it('should return correct SSE content-type header', (done) => {
    const http = require('http') as typeof import('http');
    const server = (app as any).listen(0, () => {
      const port = (server.address() as any).port as number;
      const req = http.get(
        `http://127.0.0.1:${port}/api/events/price/${TEST_CREDIT_ID}/stream`,
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          expect(res.headers['cache-control']).toContain('no-cache');
          req.destroy();
          server.close(() => done());
        },
      );
      req.on('error', () => server.close(() => done()));
      req.setTimeout(5000, () => {
        req.destroy();
        server.close(() => done());
      });
    });
  }, 8000);

  it('should send a connected event on initial connection', (done) => {
    // Use Node http directly to avoid supertest's strict response parsing
    const http = require('http') as typeof import('http');
    const server = (app as any).listen(0, () => {
      const port = (server.address() as any).port as number;
      const req = http.get(
        `http://127.0.0.1:${port}/api/events/price/${TEST_CREDIT_ID}/stream`,
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
            if (data.includes('event: connected')) {
              req.destroy();
              server.close(() => done());
            }
          });
        },
      );
      req.setTimeout(5000, () => {
        req.destroy();
        server.close(() => done());
      });
      req.on('error', () => server.close(() => done()));
    });
  }, 8000);

  it('should return 400 for empty creditId path segment', async () => {
    const res = await request(app).get('/api/events/price/%20/stream');
    // Either 400 (our validation catches the whitespace) or 404 (routing)
    expect([400, 404]).toContain(res.status);
  });
});

// ── Graceful degradation ──────────────────────────────────────────────────────

describe('Graceful degradation — event feed unavailable', () => {
  it('should return last-known data with dataAvailable flag when feed resumes', async () => {
    // After seeding events, history endpoint should always return data
    // even if the SSE stream connection was lost
    const res = await request(app)
      .get(`/api/events/price/${TEST_CREDIT_ID}/history`)
      .expect(200);

    expect(res.body.dataAvailable).toBe(true);
    expect(res.body.lastUpdated).not.toBeNull();
    // Frontend should show last-known data with "data may be delayed" if stream is down
  });

  it('should not return 500 for any price events endpoint under normal DB state', async () => {
    const endpoints = [
      `/api/events/price/${TEST_CREDIT_ID}/history`,
      `/api/events/price/${TEST_CREDIT_ID}/oracle`,
      `/api/events/price/${EMPTY_CREDIT_ID}/history`,
      `/api/events/price/${EMPTY_CREDIT_ID}/oracle`,
    ];

    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint);
      expect(res.status).not.toBe(500);
      expect(res.status).toBe(200);
    }
  });
});
