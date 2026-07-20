/**
 * src/app.ts
 *
 * Express application factory.
 * Kept separate from server.ts so it can be imported in tests without binding a port.
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { logger } from './lib/logger';

import authRoutes from './routes/auth.routes';
import livestockRoutes from './routes/livestock.routes';
import loanRoutes from './routes/loans.routes';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = env.FRONTEND_URL.split(',').map((o) => o.trim());

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86_400, // 24 h preflight cache
};

import { globalLimiter, authLimiter } from './middleware/rateLimiter';

// ─── Morgan HTTP logger stream ────────────────────────────────────────────────

const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};

// ─── App factory ─────────────────────────────────────────────────────────────

export function createApp(): Application {
  const app = express();

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions)); // preflight

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── HTTP logging ──────────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    app.use(
      morgan('combined', { stream: morganStream }),
    );
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  app.use(globalLimiter);

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/livestock', livestockRoutes);
  app.use('/api/loans', loanRoutes);

  // ── 404 + Global error handler ────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
