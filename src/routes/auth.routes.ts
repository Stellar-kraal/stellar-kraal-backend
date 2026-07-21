/**
 * src/routes/auth.routes.ts
 */

import { Router } from 'express';
import {
  getChallenge,
  login,
  logout,
  getMe,
  updateMe,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

/**
 * @route  GET /api/auth/challenge
 * @desc   Get a SEP-10 challenge transaction for signing
 * @access Public
 * @query  publicKey — Stellar G... address
 */
router.get('/challenge', getChallenge);

/**
 * @route  POST /api/auth/login
 * @desc   Verify signed challenge and issue JWT
 * @access Public
 * @body   { publicKey: string; signedTransaction: string }
 */
router.post('/login', login);

/**
 * @route  POST /api/auth/logout
 * @desc   Clear the HttpOnly session cookie
 * @access Public (idempotent)
 */
router.post('/logout', logout);

/**
 * @route  GET /api/auth/me
 * @desc   Get authenticated user profile
 * @access Private
 */
router.get('/me', requireAuth, getMe);

/**
 * @route  PATCH /api/auth/me
 * @desc   Update authenticated user profile
 * @access Private
 * @body   { displayName?, email?, phone?, country? }
 */
router.patch('/me', requireAuth, updateMe);

export default router;
