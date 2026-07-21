/**
 * src/controllers/retirements.controller.ts
 *
 * Handles:
 *   POST /api/retirements/bulk — retire (repay/close) a batch of the
 *   authenticated borrower's own active loans in one request.
 *
 * "Retiring a credit" in this platform's domain means repaying/closing an
 * active loan. Pre-submission validation is all-or-nothing: if any loan in
 * the batch fails validation, the entire request is rejected before any
 * Stellar transaction is submitted. Once validation passes, the batch is
 * submitted on-chain as one or more sequential Soroban transactions
 * (src/services/soroban.service.ts#retireLoansOnChain); each loan's
 * eventual outcome — retired, failed, or skipped — is reported individually
 * since chain execution can partially succeed across sub-transactions even
 * though validation could not.
 */

import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { retireLoansOnChain } from '../services/soroban.service';
import { env } from '../config/env';
import { LoanStatus } from '../types/domain';

const log = createLogger('retirements-controller');

type RetirementOutcome = 'retired' | 'failed' | 'skipped';

interface RetirementResult {
  loanId: string;
  status: RetirementOutcome;
  reason?: string;
  txHash?: string;
}

/**
 * POST /api/retirements/bulk
 *
 * Body: { loanIds: string[] }
 */
export async function bulkRetireLoans(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const { loanIds } = req.body as { loanIds?: unknown };

    if (!Array.isArray(loanIds) || loanIds.length === 0) {
      res.status(400).json({ error: 'loanIds must be a non-empty array' });
      return;
    }

    if (!loanIds.every((id) => typeof id === 'string' && id.trim().length > 0)) {
      res.status(400).json({ error: 'loanIds must contain only non-empty strings' });
      return;
    }

    if (loanIds.length > env.BULK_RETIREMENT_MAX_BATCH_SIZE) {
      res.status(422).json({
        error: `Batch exceeds maximum of ${env.BULK_RETIREMENT_MAX_BATCH_SIZE} credits per request`,
        maxBatchSize: env.BULK_RETIREMENT_MAX_BATCH_SIZE,
        submitted: loanIds.length,
      });
      return;
    }

    if (new Set(loanIds).size !== loanIds.length) {
      res.status(422).json({ error: 'loanIds must not contain duplicates' });
      return;
    }

    // ── Pre-submission validation (all-or-nothing) ───────────────────────────
    const loans = await prisma.loan.findMany({
      where: { id: { in: loanIds as string[] } },
    });
    const loanById = new Map(loans.map((l) => [l.id, l]));

    const validationErrors: Array<{ loanId: string; reason: string }> = [];
    for (const loanId of loanIds as string[]) {
      const loan = loanById.get(loanId);
      if (!loan) {
        validationErrors.push({ loanId, reason: 'Loan not found' });
      } else if (loan.borrowerId !== userId) {
        validationErrors.push({ loanId, reason: 'Not the borrower of this loan' });
      } else if (loan.status !== LoanStatus.ACTIVE) {
        validationErrors.push({
          loanId,
          reason: `Loan is not ACTIVE (current status: ${loan.status})`,
        });
      }
    }

    if (validationErrors.length > 0) {
      res.status(422).json({
        error: 'Batch rejected: one or more credits failed pre-submission validation',
        invalid: validationErrors,
      });
      return;
    }

    // ── On-chain batched retirement ───────────────────────────────────────────
    const targets = (loanIds as string[]).map((id) => {
      const loan = loanById.get(id)!;
      return { id: loan.id, contractLoanId: loan.contractLoanId };
    });

    const chunkResults = await retireLoansOnChain(targets);

    const results: RetirementResult[] = [];
    for (const chunk of chunkResults) {
      if (chunk.status === 'SUCCESS') {
        await prisma.loan.updateMany({
          where: { id: { in: chunk.loanIds } },
          data: {
            status: LoanStatus.REPAID,
            repaidAt: new Date(),
            lastSyncedAt: new Date(),
          },
        });
        for (const loanId of chunk.loanIds) {
          results.push({ loanId, status: 'retired', txHash: chunk.txHash });
        }
      } else if (chunk.status === 'FAILED') {
        for (const loanId of chunk.loanIds) {
          results.push({ loanId, status: 'failed', reason: chunk.error });
        }
      } else {
        for (const loanId of chunk.loanIds) {
          results.push({ loanId, status: 'skipped', reason: chunk.error });
        }
      }
    }

    const summary = {
      retired: results.filter((r) => r.status === 'retired').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };

    log.info('Bulk retirement processed', {
      userId,
      total: (loanIds as string[]).length,
      ...summary,
    });

    const allRetired = summary.failed === 0 && summary.skipped === 0;
    res.status(allRetired ? 200 : 207).json({ summary, results });
  } catch (err) {
    next(err);
  }
}
