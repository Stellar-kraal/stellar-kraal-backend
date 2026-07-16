import { IdempotencyService } from '../../src/services/idempotency.service';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

describe('IdempotencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStoredResponse', () => {
    it('should return null for non-existent key', async () => {
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await IdempotencyService.getStoredResponse('non-existent');
      expect(result).toBeNull();
    });

    it('should return stored response for valid key', async () => {
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
        key: 'test-key',
        response: JSON.stringify({ success: true }),
        statusCode: 200,
        expiresAt: new Date(Date.now() + 3600000),
      });
      const result = await IdempotencyService.getStoredResponse('test-key');
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    it('should return null for expired keys', async () => {
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
        key: 'expired-key',
        response: JSON.stringify({ success: true }),
        statusCode: 200,
        expiresAt: new Date(Date.now() - 3600000),
      });
      (prisma.idempotencyKey.delete as jest.Mock).mockResolvedValue({});
      const result = await IdempotencyService.getStoredResponse('expired-key');
      expect(result).toBeNull();
      expect(prisma.idempotencyKey.delete).toHaveBeenCalledWith({
        where: { key: 'expired-key' },
      });
    });
  });

  describe('storeResponse', () => {
    it('should create new record', async () => {
      (prisma.idempotencyKey.create as jest.Mock).mockResolvedValue({});
      await IdempotencyService.storeResponse('new-key', 200, { data: 'test' });
      expect(prisma.idempotencyKey.create).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('should delete expired keys', async () => {
      (prisma.idempotencyKey.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });
      await IdempotencyService.cleanupExpiredKeys();
      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalled();
    });
  });
});
