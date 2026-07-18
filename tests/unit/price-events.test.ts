/**
 * tests/unit/price-events.test.ts
 *
 * Unit tests for the price events service — Issue #25
 *
 * Tests:
 *   - publishPriceEvent: persistence + event bus broadcast
 *   - getPriceHistory: correct ordering and filtering
 *   - getLatestOraclePrice: returns latest oracle_update event
 *   - SSE client registration and cleanup
 *   - Graceful degradation when DB is unavailable
 */

import { EventEmitter } from 'events';
import {
  publishPriceEvent,
  getPriceHistory,
  getLatestOraclePrice,
  registerSseClient,
  priceEventBus,
  PriceEvent,
} from '../../src/services/price-events.service';
import prisma from '../../src/lib/prisma';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    priceEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Remove all event listeners to avoid cross-test interference
  priceEventBus.removeAllListeners();
});

// ── publishPriceEvent ─────────────────────────────────────────────────────────

describe('publishPriceEvent', () => {
  it('should persist the event to the database', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' });

    await publishPriceEvent({
      creditId: 'CREDIT-001',
      type: 'trade',
      priceUSDC: 12.5,
      volume: 100,
      txHash: 'abc123',
      ledger: 50_000,
    });

    expect(mockPrisma.priceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creditId: 'CREDIT-001',
          type: 'trade',
          priceUSDC: 12.5,
          volume: 100,
          txHash: 'abc123',
          ledger: 50_000,
        }),
      }),
    );
  });

  it('should emit a price event on the event bus', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-002' });

    let receivedEvent: PriceEvent | undefined;
    priceEventBus.once('price:CREDIT-002', (evt: PriceEvent) => {
      receivedEvent = evt;
    });

    await publishPriceEvent({
      creditId: 'CREDIT-002',
      type: 'oracle_update',
      priceUSDC: 15.0,
    });

    expect(receivedEvent).toBeDefined();
    expect(receivedEvent!.creditId).toBe('CREDIT-002');
    expect(receivedEvent!.type).toBe('oracle_update');
    expect(receivedEvent!.priceUSDC).toBe(15.0);
    expect(receivedEvent!.id).toBe('evt-002');
    expect(receivedEvent!.timestamp).toBeDefined();
  });

  it('should still broadcast even when DB write fails', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockRejectedValue(new Error('DB write failed'));

    let receivedEvent: PriceEvent | undefined;
    priceEventBus.once('price:CREDIT-003', (evt: PriceEvent) => {
      receivedEvent = evt;
    });

    await publishPriceEvent({
      creditId: 'CREDIT-003',
      type: 'retire',
      priceUSDC: 11.0,
    });

    // Event should still be broadcast even if DB write fails
    expect(receivedEvent).toBeDefined();
    expect(receivedEvent!.creditId).toBe('CREDIT-003');
    // ID is a temp ID in this case
    expect(receivedEvent!.id).toMatch(/^temp-/);
  });

  it('should include a valid ISO timestamp on every event', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-004' });

    const event = await publishPriceEvent({
      creditId: 'CREDIT-004',
      type: 'trade',
      priceUSDC: 9.99,
    });

    expect(event.timestamp).toBeDefined();
    const date = new Date(event.timestamp);
    expect(date.getTime()).not.toBeNaN();
    expect(date.getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});

// ── getPriceHistory ───────────────────────────────────────────────────────────

describe('getPriceHistory', () => {
  it('should return price history ordered by timestamp ascending', async () => {
    const mockEvents = [
      { timestamp: new Date('2026-01-01'), priceUSDC: 10.0, volume: 50, type: 'trade', txHash: 'tx1' },
      { timestamp: new Date('2026-01-02'), priceUSDC: 10.5, volume: 75, type: 'trade', txHash: 'tx2' },
      { timestamp: new Date('2026-01-03'), priceUSDC: 11.0, volume: null, type: 'oracle_update', txHash: null },
    ];

    (mockPrisma.priceEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);

    const history = await getPriceHistory('CREDIT-005');

    expect(history).toHaveLength(3);
    expect(history[0]!.priceUSDC).toBe(10.0);
    expect(history[1]!.priceUSDC).toBe(10.5);
    expect(history[2]!.type).toBe('oracle_update');
    expect(history[2]!.volume).toBeUndefined(); // null → undefined
  });

  it('should return empty array for a credit with no history', async () => {
    (mockPrisma.priceEvent.findMany as jest.Mock).mockResolvedValue([]);
    const history = await getPriceHistory('CREDIT-NONE');
    expect(history).toEqual([]);
  });

  it('should respect the limit parameter', async () => {
    (mockPrisma.priceEvent.findMany as jest.Mock).mockResolvedValue([]);
    await getPriceHistory('CREDIT-006', 50);

    expect(mockPrisma.priceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('should return empty array when DB throws', async () => {
    (mockPrisma.priceEvent.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    const history = await getPriceHistory('CREDIT-007');
    expect(history).toEqual([]);
  });
});

// ── getLatestOraclePrice ──────────────────────────────────────────────────────

describe('getLatestOraclePrice', () => {
  it('should return the latest oracle_update price', async () => {
    (mockPrisma.priceEvent.findFirst as jest.Mock).mockResolvedValue({
      priceUSDC: 14.25,
      timestamp: new Date('2026-07-18T10:00:00Z'),
    });

    const result = await getLatestOraclePrice('CREDIT-008');

    expect(result).not.toBeNull();
    expect(result!.priceUSDC).toBe(14.25);
    expect(result!.timestamp).toBe('2026-07-18T10:00:00.000Z');
  });

  it('should return null when no oracle price exists', async () => {
    (mockPrisma.priceEvent.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await getLatestOraclePrice('CREDIT-NEW');
    expect(result).toBeNull();
  });

  it('should return null when DB throws', async () => {
    (mockPrisma.priceEvent.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));
    const result = await getLatestOraclePrice('CREDIT-009');
    expect(result).toBeNull();
  });
});

// ── registerSseClient ─────────────────────────────────────────────────────────

describe('registerSseClient', () => {
  it('should deliver published events to registered clients', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-010' });

    const received: string[] = [];
    const cleanup = registerSseClient(
      'client-001',
      'CREDIT-010',
      (data) => { received.push(data); return true; },
      () => {},
    );

    await publishPriceEvent({
      creditId: 'CREDIT-010',
      type: 'trade',
      priceUSDC: 13.0,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toContain('event: price_update');
    expect(received[0]).toContain('CREDIT-010');
    expect(received[0]).toContain('"type":"trade"');

    cleanup();
  });

  it('should not deliver events after cleanup is called', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-011' });

    const received: string[] = [];
    const cleanup = registerSseClient(
      'client-002',
      'CREDIT-011',
      (data) => { received.push(data); return true; },
      () => {},
    );

    cleanup();

    await publishPriceEvent({
      creditId: 'CREDIT-011',
      type: 'oracle_update',
      priceUSDC: 16.0,
    });

    expect(received).toHaveLength(0);
  });

  it('should unregister client when write callback returns false', async () => {
    (mockPrisma.priceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-012' });

    let callCount = 0;
    registerSseClient(
      'client-003',
      'CREDIT-012',
      () => { callCount++; return false; }, // stream closed — always returns false
      () => {},
    );

    // First event: write called, returns false → listener removed synchronously
    await publishPriceEvent({ creditId: 'CREDIT-012', type: 'trade', priceUSDC: 5.0 });
    expect(callCount).toBe(1);

    // Second event: listener already removed — write should NOT be called again
    await publishPriceEvent({ creditId: 'CREDIT-012', type: 'trade', priceUSDC: 5.5 });
    expect(callCount).toBe(1);
  });
});
