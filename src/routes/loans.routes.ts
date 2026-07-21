/**
 * src/routes/loans.routes.ts
 */

import { Router } from 'express';
import {
  getMarketLoans,
  getLoanById,
  getMyLoans,
  requestLoan,
} from '../controllers/loans.controller';
import { requireAuth } from '../middleware/requireAuth';
import { expensiveOpLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * @route  GET /api/loans
 * @desc   Get active market loans (investor view)
 * @access Public
 * @query  page, limit
 */
router.get('/', expensiveOpLimiter, getMarketLoans);

/**
 * @route  GET /api/loans/my
 * @desc   Get authenticated borrower's own loans
 * @access Private
 * @query  status=ACTIVE|REPAID|LIQUIDATED
 */
router.get('/my', requireAuth, getMyLoans);

/**
 * @route  POST /api/loans/request
 * @desc   Request a new loan against verified collateral
 * @access Private
 * @body   { livestockId, principalUSDC, durationDays }
 */
router.post('/request', requireAuth, requestLoan);

/**
 * @route  GET /api/loans/:id
 * @desc   Get a loan by internal ID or contractLoanId
 * @access Public
 * @query  realtime=true — include live on-chain state via Soroban simulation
 */
router.get('/:id', getLoanById);

export default router;
