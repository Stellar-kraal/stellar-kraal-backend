/**
 * src/controllers/price-events.controller.ts
 *
 * Real-Time Price Chart — Backend Endpoint — Issue #25
 *
 * Routes:
 *   GET /api/events/price/:creditId/stream  — SSE stream of live price events
 *   GET /api/events/price/:creditId/history — Historical price data (REST)
 *   GET /api/events/price/:creditId/oracle  — Latest oracle reference price
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';
import {
  registerSseClient,
  getPriceHistory,
  getLatestOraclePrice,
} from '../services/price-events.service';
import { randomUUID } from 'crypto';

const log = createLogger('price-events-controller');

// ── SSE Constants ─────────────────────────────────────────────────────────────

/** How often (ms) to send a keep-alive comment to prevent proxy timeouts */
const SSE_KEEPALIVE_MS = 15_000;

/** Maximum connection duration before the client must reconnect (30 min) */
const SSE_MAX_DURATION_MS = 30 * 60 * 1000;

// ── SSE Stream ────────────────────────────────────────────────────────────────

/**
 * GET /api/events/price/:creditId/stream
 *
 * Opens a Server-Sent Events stream for real-time price updates.
 * The client subscribes to all trade, oracle_update, and retire events for
 * the given creditId.
 *
 * SSE format:
 *   event: price_update
 *   data: {"id":"...","creditId":"...","type":"trade","priceUSDC":12.5,...}
 *
 * On connection:
 *   1. Sends a `connected` event with the current oracle price (if any)
 *   2. Streams live events as they are published
 *   3. Sends keep-alive comments every 15 seconds
 *
 * On feed unavailability:
 *   The client should detect connection close/error and show
 *   "data may be delayed" indicator. It can reconnect using the
 *   `Last-Event-ID` header (standard SSE reconnect protocol).
 *
 * @param req.params.creditId  - The credit ID to subscribe to
 * @param req.query.lastEventId - Resume from this event ID (optional)
 */
export async function streamPriceEvents(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const { creditId } = req.params;
  const clientId = randomUUID();

  if (!creditId || creditId.trim() === '') {
    res.status(400).json({ error: 'creditId is required' });
    return;
  }

  log.info('SSE client connecting', { clientId, creditId });

  // ── Set SSE headers ────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // ── Send initial connection confirmation ───────────────────────────────────
  const oracle = await getLatestOraclePrice(creditId).catch(() => null);
  const connectPayload = {
    creditId,
    clientId,
    oraclePrice: oracle,
    serverTime: new Date().toISOString(),
    message: oracle
      ? 'Connected. Streaming live price events.'
      : 'Connected. No oracle price recorded yet for this credit.',
  };
  res.write(`event: connected\ndata: ${JSON.stringify(connectPayload)}\n\n`);

  // ── Register SSE client ────────────────────────────────────────────────────
  const writeCallback = (data: string): boolean => {
    if (res.writableEnded) return false;
    try {
      res.write(data);
      return true;
    } catch {
      return false;
    }
  };

  const cleanupSse = registerSseClient(clientId, creditId, writeCallback, () => {
    if (!res.writableEnded) res.end();
  });

  // ── Keep-alive ping ────────────────────────────────────────────────────────
  const keepAliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAliveInterval);
      return;
    }
    try {
      res.write(`: keep-alive ${new Date().toISOString()}\n\n`);
    } catch {
      clearInterval(keepAliveInterval);
    }
  }, SSE_KEEPALIVE_MS);

  // ── Maximum connection duration ────────────────────────────────────────────
  const maxDurationTimer = setTimeout(() => {
    if (!res.writableEnded) {
      res.write(`event: reconnect\ndata: ${JSON.stringify({ reason: 'max_duration_reached' })}\n\n`);
      res.end();
    }
  }, SSE_MAX_DURATION_MS);

  // ── Cleanup on client disconnect ───────────────────────────────────────────
  const cleanup = () => {
    clearInterval(keepAliveInterval);
    clearTimeout(maxDurationTimer);
    cleanupSse();
    log.info('SSE client disconnected', { clientId, creditId });
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
}

// ── Price History ─────────────────────────────────────────────────────────────

/**
 * GET /api/events/price/:creditId/history
 *
 * Returns historical price events for the given credit, from its first trade
 * to the current time.
 *
 * @query limit  - Maximum number of data points to return (default 200, max 1000)
 * @query type   - Filter by event type: 'trade' | 'oracle_update' | 'retire'
 *
 * Response:
 * {
 *   creditId: string,
 *   oraclePrice: { priceUSDC: number, timestamp: string } | null,
 *   history: Array<{ timestamp, priceUSDC, volume?, type, txHash? }>,
 *   dataAvailable: boolean,  // false if no trades recorded yet
 *   lastUpdated: string | null
 * }
 *
 * Accessible (chart data table):
 *   The response also includes a tabular `table` field for accessible
 *   screen-reader presentation. Frontend can render as an <table> fallback.
 */
export async function getPriceChartData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { creditId } = req.params;

    if (!creditId || creditId.trim() === '') {
      res.status(400).json({ error: 'creditId is required' });
      return;
    }

    const limit = Math.min(
      1000,
      Math.max(1, parseInt(String(req.query['limit'] ?? '200'), 10)),
    );

    const [history, oraclePrice] = await Promise.all([
      getPriceHistory(creditId, limit),
      getLatestOraclePrice(creditId),
    ]);

    const dataAvailable = history.length > 0;
    const lastUpdated = dataAvailable
      ? history[history.length - 1]!.timestamp
      : null;

    // Accessible tabular data — frontend can render as <table> fallback
    const table = {
      columns: ['Date / Time', 'Price (USDC)', 'Volume', 'Type', 'Transaction'],
      rows: history.map((h) => [
        h.timestamp,
        h.priceUSDC.toFixed(2),
        h.volume != null ? String(h.volume) : '—',
        h.type,
        h.txHash ?? '—',
      ]),
    };

    res.json({
      creditId,
      oraclePrice,
      history,
      table,
      dataAvailable,
      lastUpdated,
      meta: {
        limit,
        count: history.length,
        message: dataAvailable
          ? undefined
          : 'No price history recorded for this credit yet.',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Latest Oracle Price ────────────────────────────────────────────────────────

/**
 * GET /api/events/price/:creditId/oracle
 *
 * Returns only the latest oracle reference price for the given credit.
 * Used by the chart to display the oracle reference line.
 *
 * Response:
 * {
 *   creditId: string,
 *   oraclePrice: { priceUSDC: number, timestamp: string } | null,
 *   stale: boolean  // true if oracle price is >1 hour old
 * }
 */
export async function getOraclePrice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { creditId } = req.params;

    if (!creditId || creditId.trim() === '') {
      res.status(400).json({ error: 'creditId is required' });
      return;
    }

    const oraclePrice = await getLatestOraclePrice(creditId);

    // A price is considered stale if it's more than 1 hour old
    const STALE_THRESHOLD_MS = 60 * 60 * 1000;
    const stale = oraclePrice
      ? Date.now() - new Date(oraclePrice.timestamp).getTime() > STALE_THRESHOLD_MS
      : false;

    res.json({
      creditId,
      oraclePrice,
      stale,
      unavailable: oraclePrice === null,
    });
  } catch (err) {
    next(err);
  }
}
