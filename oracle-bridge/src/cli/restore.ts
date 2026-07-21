#!/usr/bin/env node
/**
 * CLI: restore state from a backup.
 * Usage: npm run restore -- --from ./data/backups/backup-....json
 *        npm run restore                (uses latest.json in BACKUP_DIR)
 */
import { loadConfig } from '../config';
import { restoreFromBackup } from '../restore';
import { logger } from '../logger';

const config = loadConfig();
const fromIdx = process.argv.indexOf('--from');
const fromFile = fromIdx !== -1 ? process.argv[fromIdx + 1] : undefined;

try {
  const state = restoreFromBackup({
    fromFile,
    backupDir: config.backupDir,
    targetStateDir: config.stateDir,
  });
  logger.info('Manual restore complete', { lastProcessedLedger: state.lastProcessedLedger });
  process.exit(0);
} catch (err) {
  logger.error('Manual restore failed', { message: (err as Error).message });
  process.exit(1);
}
