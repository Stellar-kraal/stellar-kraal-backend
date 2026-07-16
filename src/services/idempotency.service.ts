import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const DEFAULT_TTL_HOURS = 24;

export class IdempotencyService {
  static async getStoredResponse(key: string): Promise<{ statusCode: number; body: any } | null> {
    try {
      const record = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (!record) return null;
      if (new Date() > record.expiresAt) {
        await this.removeKey(key);
        return null;
      }
      return { statusCode: record.statusCode, body: JSON.parse(record.response) };
    } catch (error) {
      logger.error('Error getting stored response', error);
      return null;
    }
  }

  static async storeResponse(key: string, statusCode: number, body: any, ttlHours: number = DEFAULT_TTL_HOURS): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);
    try {
      await prisma.idempotencyKey.create({
        data: { key, response: JSON.stringify(body), statusCode, expiresAt }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        await prisma.idempotencyKey.update({
          where: { key },
          data: { response: JSON.stringify(body), statusCode }
        });
      } else {
        logger.error('Error storing response', error);
        throw error;
      }
    }
  }

  static async removeKey(key: string): Promise<void> {
    try {
      await prisma.idempotencyKey.delete({ where: { key } });
    } catch (error) {
      logger.debug('Failed to remove key ' + key);
    }
  }

  static async cleanupExpiredKeys(): Promise<void> {
    try {
      const result = await prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      if (result.count > 0) {
        logger.info('Cleaned up ' + result.count + ' expired idempotency keys');
      }
    } catch (error) {
      logger.error('Failed to cleanup expired keys', error);
    }
  }
}
