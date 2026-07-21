/**
 * src/restore.ts
 *
 * Reconstructs a working instance's state from a backup snapshot. This is
 * the operation exercised by the "backup restoration is tested in CI"
 * acceptance criterion: restoring into a fresh state directory must produce
 * a state that a bridge instance can start from and be healthy with.
 */

import { BackupManifest, readBackupFile, readLatestBackup } from './backup';
import { saveState, BridgeState } from './state';
import { BridgeRole } from './config';
import { logger } from './logger';

export interface RestoreOptions {
  /** Explicit backup file to restore from. If omitted, uses the latest. */
  fromFile?: string;
  backupDir: string;
  targetStateDir: string;
  /**
   * Role to record on the restored state. Backups are always taken by a
   * primary, so a manifest's embedded `role` is always "primary" — that
   * value describes who *wrote* the backup, not who should own the result
   * of *this* restore. A standby doing its routine warm-sync restore must
   * keep recording itself as "standby"; only an explicit promotion should
   * flip it. Defaults to the manifest's role for plain manual/CLI restores
   * where no ambient role is known.
   */
  asRole?: BridgeRole;
}

export function restoreFromBackup(opts: RestoreOptions): BridgeState {
  const manifest: BackupManifest | null = opts.fromFile
    ? readBackupFile(opts.fromFile)
    : readLatestBackup(opts.backupDir);

  if (!manifest) {
    throw new Error(`No backup available to restore from (checked ${opts.fromFile ?? opts.backupDir})`);
  }

  if (manifest.formatVersion !== 1) {
    throw new Error(`Unsupported backup format version: ${manifest.formatVersion}`);
  }

  const requiredFields: (keyof BridgeState)[] = [
    'contractId',
    'network',
    'rpcUrl',
    'signingKeySecretRef',
  ];
  for (const field of requiredFields) {
    if (!manifest.state[field]) {
      throw new Error(`Backup manifest is missing required field: ${String(field)}`);
    }
  }

  const restoredState: BridgeState = {
    ...manifest.state,
    role: opts.asRole ?? manifest.state.role,
  };

  const saved = saveState(opts.targetStateDir, restoredState);
  logger.info('Restored state from backup', {
    source: opts.fromFile ?? 'latest',
    role: saved.role,
    lastProcessedLedger: saved.lastProcessedLedger,
    targetStateDir: opts.targetStateDir,
  });
  return saved;
}
