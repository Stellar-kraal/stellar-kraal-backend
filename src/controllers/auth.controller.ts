/**
 * src/controllers/auth.controller.ts
 *
 * Handles:
 *   GET  /api/auth/challenge  — returns a SEP-10 challenge transaction XDR
 *   POST /api/auth/login      — verifies signed challenge, issues JWT
 *   GET  /api/auth/me         — returns current authenticated user profile
 */

import { Request, Response, NextFunction } from 'express';
import {
  buildChallenge,
  verifyChallenge,
  authenticateUser,
} from '../services/auth.service';
import prisma from '../lib/prisma';
import { createLogger } from '../lib/logger';

const log = createLogger('auth-controller');

/**
 * GET /api/auth/challenge?publicKey=G...
 *
 * Returns a base64-encoded Soroban transaction XDR that the client must
 * sign with their Stellar keypair and POST back to /api/auth/login.
 */
export async function getChallenge(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { publicKey } = req.query;

    if (typeof publicKey !== 'string' || !publicKey.trim()) {
      res.status(400).json({ error: 'publicKey query parameter is required' });
      return;
    }

    const transaction = await buildChallenge(publicKey.trim());

    res.json({ transaction });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid Stellar public key') {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * Body: { publicKey: string; signedTransaction: string }
 *
 * Verifies the client's signature on the challenge transaction and
 * issues a JWT on success.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { publicKey, signedTransaction } = req.body as {
      publicKey?: string;
      signedTransaction?: string;
    };

    if (!publicKey || typeof publicKey !== 'string') {
      res.status(400).json({ error: 'publicKey is required' });
      return;
    }
    if (!signedTransaction || typeof signedTransaction !== 'string') {
      res.status(400).json({ error: 'signedTransaction (XDR) is required' });
      return;
    }

    // Verify the signature
    const verifiedKey = await verifyChallenge(publicKey.trim(), signedTransaction.trim());

    // Find or create the user and issue JWT
    const { token, user } = await authenticateUser(verifiedKey);

    log.info('User authenticated', { userId: user.id, publicKey: user.publicKey });

    res.json({
      token,
      user: {
        id: user.id,
        publicKey: user.publicKey,
        role: user.role,
      },
    });
  } catch (err) {
    // Distinguish auth failures (400) from server errors (500)
    if (err instanceof Error && isAuthError(err.message)) {
      res.status(401).json({ error: 'Authentication failed', detail: err.message });
      return;
    }
    next(err);
  }
}

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's full profile from the database.
 * Requires requireAuth middleware on the route.
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        publicKey: true,
        role: true,
        displayName: true,
        email: true,
        phone: true,
        country: true,
        createdAt: true,
        _count: {
          select: { livestock: true, loans: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/me
 *
 * Update the authenticated user's profile.
 */
export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.sub;

    const { displayName, email, phone, country } = req.body as {
      displayName?: string;
      email?: string;
      phone?: string;
      country?: string;
    };

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(country !== undefined && { country }),
      },
      select: {
        id: true,
        publicKey: true,
        role: true,
        displayName: true,
        email: true,
        phone: true,
        country: true,
        updatedAt: true,
      },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUTH_ERROR_PATTERNS = [
  'challenge',
  'nonce',
  'signature',
  'expired',
  'public key',
  'unauthorized',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}
