/**
 * src/lib/authCookie.ts
 *
 * Helpers for issuing and clearing the session JWT as an HttpOnly cookie.
 *
 * Serving the JWT through an `HttpOnly`, `Secure`, `SameSite` cookie keeps it
 * out of JavaScript's reach, so a single frontend XSS can no longer read the
 * token and take over the session (threat FE-02). See docs/security/session-cookies.md.
 */

import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/** Name of the cookie that carries the session JWT. */
export const SESSION_COOKIE_NAME = 'sk_session';

/** Fallback cookie lifetime (7 days) when the token has no `exp` claim. */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Attributes shared between setting and clearing the cookie. The clear call
 * must use the same attributes (minus maxAge) or the browser keeps the cookie.
 */
function cookieBaseOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  } as const;
}

/**
 * Derive the cookie maxAge (ms) from the token's own `exp` claim so the cookie
 * and JWT expire together. Falls back to a fixed lifetime if `exp` is absent.
 */
function maxAgeFromToken(token: string): number {
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded === 'object' && typeof decoded.exp === 'number') {
    const remainingMs = decoded.exp * 1000 - Date.now();
    if (remainingMs > 0) return remainingMs;
  }
  return DEFAULT_MAX_AGE_MS;
}

/** Issue the session JWT as an HttpOnly cookie on the response. */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...cookieBaseOptions(),
    maxAge: maxAgeFromToken(token),
  });
}

/** Remove the session cookie (used on logout). */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, cookieBaseOptions());
}
