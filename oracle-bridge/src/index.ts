/**
 * src/index.ts
 *
 * Entrypoint. BRIDGE_ROLE only decides the *initial* behavior for a brand
 * new instance (no state.json yet). From then on, the process's actual
 * runtime behavior follows whatever role is persisted on disk — because
 * promotion (src/promote.ts, invoked via `npm run promote`) is a *separate
 * process* that mutates the same state file, and this already-running
 * process must notice that and switch itself over, live, without a
 * restart. That's exactly what the standby loop below checks for on every
 * tick, before it does anything else.
 *
 *  - primary mode: submission loop (compute a price, submit it — or log it
 *    under DRY_RUN) + backup loop (periodically snapshot state to
 *    BACKUP_DIR).
 *  - standby mode: no submission at all. Each tick first checks whether an
 *    external `npm run promote` has already flipped this instance's own
 *    on-disk role to "primary" — if so, it switches itself to primary mode
 *    on the spot. Otherwise it does its routine warm-sync: pull the latest
 *    shared backup's operational fields, while explicitly keeping its own
 *    role as "standby" (a backup's embedded role is always "primary",
 *    since only primaries take backups — it describes who wrote the
 *    backup, not who this instance is).
 */

import { loadConfig } from './config';
import { createSecretsProvider } from './secretsProvider';
import { loadState, loadOrInitState, saveState, BridgeState } from './state';
import { createBackup } from './backup';
import { restoreFromBackup } from './restore';
import { submitPrice } from './soroban';
import { getNextPrice } from './priceSource';
import { startHealthServer, HealthSnapshot } from './health';
import { logger } from './logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const secrets = createSecretsProvider(config.secretsProvider);
  let state: BridgeState = loadOrInitState(config.stateDir, config);
  saveState(config.stateDir, state);

  let lastBackupAt: string | null = null;
  const startedAt = Date.now();

  const health = startHealthServer(config.port, (): HealthSnapshot => ({
    status: 'ok',
    role: state.role,
    contractId: config.contractId,
    lastSubmittedAt: state.lastSubmittedAt,
    lastBackupAt,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  logger.info('Oracle bridge starting', {
    initialRole: state.role,
    contractId: config.contractId,
    network: config.network,
    dryRun: config.dryRun,
  });

  let submitTimer: ReturnType<typeof setInterval> | undefined;
  let backupTimer: ReturnType<typeof setInterval> | undefined;
  let syncTimer: ReturnType<typeof setInterval> | undefined;

  function startPrimaryLoops(): void {
    submitTimer = setInterval(() => {
      void (async () => {
        try {
          const secret = await secrets.resolveSecret(state.signingKeySecretRef);
          const price = getNextPrice();
          const result = await submitPrice({
            rpcUrl: config.rpcUrl,
            network: config.network,
            contractId: config.contractId,
            signingSecret: secret,
            price,
            dryRun: config.dryRun,
          });
          state = {
            ...state,
            lastSubmittedPrice: result.price,
            lastSubmittedAt: new Date().toISOString(),
            lastProcessedLedger: state.lastProcessedLedger + 1,
          };
          saveState(config.stateDir, state);
        } catch (err) {
          logger.error('Submission loop failed', { message: (err as Error).message });
        }
      })();
    }, config.submitIntervalMs);

    backupTimer = setInterval(() => {
      try {
        createBackup(config.stateDir, config.backupDir);
        lastBackupAt = new Date().toISOString();
      } catch (err) {
        logger.error('Backup loop failed', { message: (err as Error).message });
      }
    }, config.backupIntervalMs);

    // Take one backup immediately so a fresh/just-promoted primary is
    // protected right away rather than waiting a full interval.
    try {
      createBackup(config.stateDir, config.backupDir);
      lastBackupAt = new Date().toISOString();
    } catch (err) {
      logger.warn('Initial backup skipped', { message: (err as Error).message });
    }
  }

  function switchToPrimary(reason: string): void {
    logger.info('Switching to primary mode', { reason });
    if (syncTimer) clearInterval(syncTimer);
    state = loadOrInitState(config.stateDir, config);
    startPrimaryLoops();
  }

  if (state.role === 'primary') {
    startPrimaryLoops();
  } else {
    syncTimer = setInterval(() => {
      try {
        // Has an external `npm run promote` already flipped OUR OWN
        // on-disk role to primary since our last tick? If so, that's a
        // real promotion — stop resyncing as standby and switch live.
        const onDisk = loadState(config.stateDir);
        if (onDisk?.role === 'primary') {
          switchToPrimary('detected external promotion');
          return;
        }

        restoreFromBackup({
          backupDir: config.backupDir,
          targetStateDir: config.stateDir,
          asRole: 'standby',
        });
        state = loadOrInitState(config.stateDir, config);
        logger.debug('Standby synced from latest backup', {
          lastProcessedLedger: state.lastProcessedLedger,
        });
      } catch (err) {
        logger.debug('Standby sync: no backup available yet', { message: (err as Error).message });
      }
    }, config.backupIntervalMs);
  }

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down`);
    if (submitTimer) clearInterval(submitTimer);
    if (backupTimer) clearInterval(backupTimer);
    if (syncTimer) clearInterval(syncTimer);
    health.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { message: (err as Error).message });
  process.exit(1);
});
