import rateLimit, { Options, Store, IncrementResponse } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma'; // Assumes Prisma client is exported here

// ─── Prisma SQLite Store Fallback ─────────────────────────────────────────────
export class PrismaRateLimitStore implements Store {
  windowMs!: number;

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    
    // Attempt to upsert
    // But since SQLite doesn't have robust expiration, we clean up expired keys first
    await prisma.rateLimit.deleteMany({
      where: { resetTime: { lt: now } }
    });

    const resetTime = new Date(now.getTime() + this.windowMs);

    const record = await prisma.rateLimit.upsert({
      where: { key },
      update: { hits: { increment: 1 } },
      create: { key, hits: 1, resetTime },
    });

    return {
      totalHits: record.hits,
      resetTime: record.resetTime,
    };
  }

  async decrement(key: string): Promise<void> {
    await prisma.rateLimit.updateMany({
      where: { key },
      data: { hits: { decrement: 1 } }
    });
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimit.deleteMany({ where: { key } });
  }
}

// ─── Store Factory ─────────────────────────────────────────────────────────────
export const createStore = (prefix: string): Store => {
  if (env.REDIS_URL) {
    const client = new Redis(env.REDIS_URL);
    return new RedisStore({
      prefix,
      // @ts-expect-error - Known issue with ioredis types
      sendCommand: (...args: string[]) => client.call(...args),
    });
  } else {
    // In a real implementation we'd use the prefix, but Prisma is fine with unique keys
    return new PrismaRateLimitStore();
  }
};


// ─── Key Generators ───────────────────────────────────────────────────────────
// For the global limiter: use User ID if authenticated, else use IP
export const userOrIpKeyGenerator = (req: Request) => {
  if ((req as any).user && (req as any).user.id) {
    return `user:${(req as any).user.id}`;
  }
  return `ip:${req.ip}`;
};

// ─── Limiters ──────────────────────────────────────────────────────────────────

// Global Limiter
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: (req: Request) => {
    // Return different max limits depending on authentication status
    return ((req as any).user) ? env.RATE_LIMIT_USER_MAX : env.RATE_LIMIT_GLOBAL_MAX;
  },
  standardHeaders: true,
  legacyHeaders: true,
  store: createStore('rl:'),
  keyGenerator: userOrIpKeyGenerator,
  handler: (req: Request, res: Response, next, options) => {
    const actor = userOrIpKeyGenerator(req);
    logger.warn(`Rate limit exceeded for actor: ${actor} at endpoint: ${req.originalUrl}`);
    res.status(429).json({ error: options.message || 'Too many requests. Please try again later.' });
  },
});

// Credential Stuffing / Auth Limiter
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_BLOCK_DURATION_MS,
  max: env.RATE_LIMIT_AUTH_MAX_FAILED_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: true,
  store: createStore('rl:'),
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  skipSuccessfulRequests: true, // Only failed requests count towards the limit
  handler: (req: Request, res: Response, next, options) => {
    logger.warn(`Credential stuffing detected and blocked for IP: ${req.ip}`);
    res.status(429).json({ error: 'Too many failed authentication attempts. You are temporarily blocked.' });
  },
});

// Expensive Operations Limiter
export const expensiveOpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute fixed window for expensive ops
  max: env.RATE_LIMIT_ORACLE_MAX,
  standardHeaders: true,
  legacyHeaders: true,
  store: createStore('expensive:'),
  keyGenerator: (req: Request) => `expensive:${userOrIpKeyGenerator(req)}`,
  handler: (req: Request, res: Response, next, options) => {
    const actor = userOrIpKeyGenerator(req);
    logger.warn(`Expensive operation rate limit exceeded for actor: ${actor} at endpoint: ${req.originalUrl}`);
    res.status(429).json({ error: 'Too many expensive operations requested. Please slow down.' });
  },
});
