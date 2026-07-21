#!/usr/bin/env node
/**
 * CLI: create a backup snapshot on demand.
 * Usage: npm run backup
 */
import { loadConfig } from '../config';
import { createBackup } from '../backup';
import { logger } from '../logger';

const config = loadConfig();
try {
  const { file } = createBackup(config.stateDir, config.backupDir);
  logger.info('Manual backup complete', { file });
  process.exit(0);
} catch (err) {
  logger.error('Manual backup failed', { message: (err as Error).message });
  process.exit(1);
}
