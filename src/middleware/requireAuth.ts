/**
 * src/middleware/requireAuth.ts
 *
 * JWT authentication middleware.
 * Extracts the Bearer token from the Authorization header, verifies it,
 * and attaches the decoded payload to req.user.
 *
 * Optional role-based guard factory: requireRole('ADMIN')
 */

import { Request, Response, NextFunction } from 'express';
import { verifyJwt, TokenPayload } from '../services/auth.service';
import { SESSION_COOKIE_NAME } from '../lib/authCookie';
import { createLogger } from '../lib/logger';
import { Role } from '../types/domain';

const log = createLogger('auth-middleware');

/**
 * Extract the session JWT from the request.
 *
 * Prefers the HttpOnly session cookie (browser sessions — not reachable from
 * JS, so XSS can't steal it). Falls back to the `Authorization: Bearer` header
 * for non-browser API clients (CLI, server-to-server, tests).
 */
function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7); // remove "Bearer "
  }

  return null;
}

// Extend Express Request to carry the verified user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * requireAuth — validates the JWT on every protected request.
 *
 * Responds 401 if the token is absent, malformed, or expired.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing session cookie or Authorization header' });
    return;
  }

  try {
    const payload = verifyJwt(token);
    req.user = payload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    log.warn('Auth failure', { reason: message, path: req.path });
    res.status(401).json({ error: 'Unauthorized', detail: message });
  }
}

/**
 * requireRole — role-based guard. Must be used after requireAuth.
 *
 * @example router.get('/admin', requireAuth, requireRole('ADMIN'), handler)
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role as Role)) {
      log.warn('Forbidden: insufficient role', {
        userId: req.user.sub,
        requiredRoles: roles,
        actualRole: req.user.role,
      });
      res.status(403).json({
        error: 'Forbidden',
        detail: `Required role: ${roles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}
