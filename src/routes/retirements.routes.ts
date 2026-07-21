/**
 * src/routes/retirements.routes.ts
 */

import { Router } from 'express';
import { bulkRetireLoans } from '../controllers/retirements.controller';
import { requireAuth } from '../middleware/requireAuth';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();

/**
 * @route  POST /api/retirements/bulk
 * @desc   Retire (repay/close) a batch of the caller's own active loans.
 *         Pre-submission validation is all-or-nothing; on-chain execution
 *         reports a per-loan outcome (retired / failed / skipped).
 * @access Private
 * @header Idempotency-Key — optional, recommended for safe retries
 * @body   { loanIds: string[] }  — up to BULK_RETIREMENT_MAX_BATCH_SIZE (default 100)
 */
router.post('/bulk', requireAuth, idempotencyMiddleware, bulkRetireLoans);

export default router;
