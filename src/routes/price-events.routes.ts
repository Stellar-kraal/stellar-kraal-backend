/**
 * src/routes/price-events.routes.ts
 *
 * Real-Time Price Events Routes — Issue #25
 *
 * Provides:
 *   GET /api/events/price/:creditId/stream   — SSE live price stream
 *   GET /api/events/price/:creditId/history  — Historical price data
 *   GET /api/events/price/:creditId/oracle   — Latest oracle reference price
 */

import { Router } from 'express';
import {
  streamPriceEvents,
  getPriceChartData,
  getOraclePrice,
} from '../controllers/price-events.controller';

const router = Router();

/**
 * @route  GET /api/events/price/:creditId/stream
 * @desc   Server-Sent Events stream for real-time price updates
 * @access Public
 *
 * Streams trade, oracle_update, and retire events for the given creditId.
 * Clients should reconnect on error and show "data may be delayed" when
 * the feed is unavailable.
 *
 * SSE event format:
 *   event: price_update
 *   data: { id, creditId, type, priceUSDC, volume?, txHash?, ledger?, timestamp }
 *
 * On connect:
 *   event: connected
 *   data: { creditId, clientId, oraclePrice, serverTime, message }
 *
 * Keep-alive:
 *   : keep-alive <ISO timestamp>
 */
router.get('/price/:creditId/stream', streamPriceEvents);

/**
 * @route  GET /api/events/price/:creditId/history
 * @desc   Retrieve historical price data for a credit (REST)
 * @access Public
 * @query  limit  — max data points (1-1000, default 200)
 *
 * Returns price history from first trade to now, oracle reference price,
 * and an accessible tabular representation of the data.
 */
router.get('/price/:creditId/history', getPriceChartData);

/**
 * @route  GET /api/events/price/:creditId/oracle
 * @desc   Get the latest oracle reference price for a credit
 * @access Public
 *
 * Returns the most recent oracle_update event price. Includes a `stale`
 * flag if the oracle price is older than 1 hour.
 */
router.get('/price/:creditId/oracle', getOraclePrice);

export default router;
