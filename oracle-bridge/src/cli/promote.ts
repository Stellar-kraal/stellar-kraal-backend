#!/usr/bin/env node
/**
 * CLI: promote this instance from standby to primary.
 * Usage: npm run promote
 *
 * Prints "PROMOTED elapsedMs=<n>" on success so calling scripts (the DR
 * drill) can parse the timing without depending on log formatting.
 */
import { loadConfig } from '../config';
import { createSecretsProvider } from '../secretsProvider';
import { promote } from '../promote';
import { logger } from '../logger';

const config = loadConfig();
const secrets = createSecretsProvider(config.secretsProvider);

promote({ backupDir: config.backupDir, stateDir: config.stateDir, secrets })
  .then(({ elapsedMs }) => {
    // eslint-disable-next-line no-console
    console.log(`PROMOTED elapsedMs=${elapsedMs}`);
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Promotion failed', { message: (err as Error).message });
    process.exit(1);
  });
