/**
 * src/services/price-events.service.ts
 *
 * Real-Time Price Events Service — Issue #25
 *
 * Responsibilities:
 *   1. Maintain an in-memory event bus for price trades and oracle updates
 *   2. Store a bounded history of price events per credit ID in SQLite via
 *      the PriceEvent model
 *   3. Provide SSE subscription management for the events controller
 *
 * Event types:
 *   - trade        : A credit was purchased (carbon_marketplace purchase)
 *   - oracle_update: An oracle price was written for a credit
 *   - retire       : A credit was retired
 *
 * The Soroban event poller (soroban.service.ts) calls publishPriceEvent()
 * when it processes relevant on-chain events. The SSE controller streams
 * these to connected browser clients.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../lib/logger';
import prisma from '../lib/prisma';

const log = createLogger('price-events');

// ── Types ─────────────────────────────────────────────────────────────────────

export type PriceEventType = 'trade' | 'oracle_update' | 'retire';

export interface PriceEvent {
  id: string;
  creditId: string;
  type: PriceEventType;
  priceUSDC: number;
  volume?: number;      // units traded (for 'trade' events)
  txHash?: string;      // Soroban transaction hash
  ledger?: number;      // on-chain ledger sequence
  timestamp: string;    // ISO-8601
}

export interface PriceHistoryPoint {
  timestamp: string;
  priceUSDC: number;
  volume?: number;
  type: PriceEventType;
  txHash?: string;
}

// ── In-Memory Event Bus ───────────────────────────────────────────────────────

/**
 * EventEmitter used to broadcast new price events to all active SSE clients.
 * Each credit ID has a dedicated event channel: `price:<creditId>`
 */
export const priceEventBus = new EventEmitter();
priceEventBus.setMaxListeners(500); // Support up to 500 concurrent SSE connections

// ── SSE Client Registry ───────────────────────────────────────────────────────

interface SseClient {
  id: string;
  creditId: string;
  write: (data: string) => boolean;
  close: () => void;
}

const sseClients = new Map<string, SseClient>();

/**
 * Register an SSE client and return a cleanup function.
 * The client receives all future price events for the given creditId.
 */
export function registerSseClient(
  clientId: string,
  creditId: string,
  writeCallback: (data: string) => boolean,
  closeCallback: () => void,
): () => void {
  const client: SseClient = {
    id: clientId,
    creditId,
    write: writeCallback,
    close: closeCallback,
  };

  sseClients.set(clientId, client);
  log.info('SSE client registered', { clientId, creditId, totalClients: sseClients.size });

  const handler = (event: PriceEvent) => {
    const sseData = formatSseEvent(event);
    const ok = writeCallback(sseData);
    if (!ok) {
      // Stream is no longer writable — remove listener immediately (synchronous)
      // so subsequent events on this bus channel do not fire this handler.
      priceEventBus.off(`price:${creditId}`, handler);
      unregisterSseClient(clientId);
    }
  };

  priceEventBus.on(`price:${creditId}`, handler);

  // Cleanup function
  return () => {
    priceEventBus.off(`price:${creditId}`, handler);
    unregisterSseClient(clientId);
  };
}

function unregisterSseClient(clientId: string): void {
  if (sseClients.has(clientId)) {
    sseClients.delete(clientId);
    log.debug('SSE client unregistered', { clientId, remaining: sseClients.size });
  }
}

/** Format a price event as an SSE data frame */
function formatSseEvent(event: PriceEvent): string {
  return `event: price_update\ndata: ${JSON.stringify(event)}\n\n`;
}

// ── Event Publishing ──────────────────────────────────────────────────────────

/**
 * Publish a new price event.
 * - Persists to the DB (PriceEvent table)
 * - Broadcasts to all SSE clients subscribed to this creditId
 */
export async function publishPriceEvent(
  event: Omit<PriceEvent, 'id' | 'timestamp'>,
): Promise<PriceEvent> {
  const timestamp = new Date().toISOString();

  // Persist to DB
  let dbRecord: { id: string };
  try {
    dbRecord = await prisma.priceEvent.create({
      data: {
        creditId: event.creditId,
        type: event.type,
        priceUSDC: event.priceUSDC,
        volume: event.volume ?? null,
        txHash: event.txHash ?? null,
        ledger: event.ledger ?? null,
        timestamp: new Date(timestamp),
      },
      select: { id: true },
    });
  } catch (err) {
    log.error('Failed to persist price event', { err, creditId: event.creditId });
    // Assign a temporary ID so broadcasting still works
    dbRecord = { id: `temp-${Date.now()}` };
  }

  const fullEvent: PriceEvent = { ...event, id: dbRecord.id, timestamp };

  // Broadcast to SSE clients
  priceEventBus.emit(`price:${event.creditId}`, fullEvent);
  log.debug('Price event published', {
    creditId: event.creditId,
    type: event.type,
    priceUSDC: event.priceUSDC,
  });

  return fullEvent;
}

// ── Price History ─────────────────────────────────────────────────────────────

/**
 * Fetch price history for a credit, from its first trade to now.
 * Returns up to `limit` events ordered by timestamp ascending.
 */
export async function getPriceHistory(
  creditId: string,
  limit = 200,
): Promise<PriceHistoryPoint[]> {
  try {
    const events = await prisma.priceEvent.findMany({
      where: { creditId },
      orderBy: { timestamp: 'asc' },
      take: limit,
      select: {
        timestamp: true,
        priceUSDC: true,
        volume: true,
        type: true,
        txHash: true,
      },
    });

    return events.map((e) => ({
      timestamp: e.timestamp.toISOString(),
      priceUSDC: e.priceUSDC,
      volume: e.volume ?? undefined,
      type: e.type as PriceEventType,
      txHash: e.txHash ?? undefined,
    }));
  } catch (err) {
    log.error('Failed to fetch price history', { err, creditId });
    return [];
  }
}

/**
 * Get the latest oracle price for a credit.
 * Returns null if no oracle_update has been recorded yet.
 */
export async function getLatestOraclePrice(
  creditId: string,
): Promise<{ priceUSDC: number; timestamp: string } | null> {
  try {
    const latest = await prisma.priceEvent.findFirst({
      where: { creditId, type: 'oracle_update' },
      orderBy: { timestamp: 'desc' },
      select: { priceUSDC: true, timestamp: true },
    });

    if (!latest) return null;
    return { priceUSDC: latest.priceUSDC, timestamp: latest.timestamp.toISOString() };
  } catch (err) {
    log.error('Failed to fetch oracle price', { err, creditId });
    return null;
  }
}
