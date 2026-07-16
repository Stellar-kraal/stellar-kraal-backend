import { Request, Response, NextFunction } from 'express';
import { IdempotencyService } from '../services/idempotency.service';
import { logger } from '../lib/logger';

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    return next();
  }

  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
    res.status(400).json({
      statusCode: 400,
      message: 'Invalid Idempotency-Key header',
      error: 'Bad Request'
    });
    return;
  }

  const storedResponse = await IdempotencyService.getStoredResponse(idempotencyKey);
  if (storedResponse) {
    res.status(storedResponse.statusCode).json(storedResponse.body);
    return;
  }

  const processingKey = idempotencyKey + '_processing';
  const processingState = await IdempotencyService.getStoredResponse(processingKey);
  if (processingState) {
    logger.warn('Detected incomplete request for key: ' + idempotencyKey + '. Reconciling...');
    await IdempotencyService.removeKey(processingKey);
  }

  await IdempotencyService.storeResponse(processingKey, 202, { status: 'processing' }, 1);

  const originalJson = res.json.bind(res);
  res.json = function(body: any) {
    IdempotencyService.storeResponse(idempotencyKey, res.statusCode, body);
    IdempotencyService.removeKey(processingKey);
    return originalJson(body);
  };

  next();
}
