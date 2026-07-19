/**
 * src/backup.ts
 *
 * Creates a point-in-time snapshot of the bridge's state into BACKUP_DIR.
 *
 * A snapshot is exactly a BridgeState (config + operational cursor) plus a
 * little metadata — it never contains a raw private key, only the
 * SIGNING_KEY_SECRET_REF reference string, so a leaked/mishandled backup
 * file on its own grants no signing capability.
 *
 * In this repo, BACKUP_DIR is a plain local directory (a shared Docker
 * volume between primary and standby in docker-compose.yml). In a real
 * deployment, BACKUP_DIR is parameterized to point at durable, replicated
 * storage (e.g. an S3 bucket mounted or synced locally) — nothing in this
 * module assumes a local filesystem beyond "a directory both instances can
 * read."
 */

import * as fs from 'fs';
import * as path from 'path';
import { BridgeState, loadState } from './state';
import { logger } from './logger';

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupManifest {
  formatVersion: number;
  createdAt: string;
  state: BridgeState;
}

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Write a new timestamped snapshot plus refresh the `latest.json` pointer.
 * Returns the manifest and the path of the timestamped snapshot file.
 */
export function createBackup(stateDir: string, backupDir: string): { manifest: BackupManifest; file: string } {
  const state = loadState(stateDir);
  if (!state) {
    throw new Error(`No state found in ${stateDir} — nothing to back up yet`);
  }

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    state,
  };

  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `backup-${timestampSlug(new Date())}.json`);
  const json = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(file, json, 'utf-8');
  fs.writeFileSync(path.join(backupDir, 'latest.json'), json, 'utf-8');

  logger.info('Backup created', { file, lastProcessedLedger: state.lastProcessedLedger });
  return { manifest, file };
}

/** Read the most recent backup (via the latest.json pointer). */
export function readLatestBackup(backupDir: string): BackupManifest | null {
  const latest = path.join(backupDir, 'latest.json');
  if (!fs.existsSync(latest)) return null;
  return JSON.parse(fs.readFileSync(latest, 'utf-8')) as BackupManifest;
}

/** Read a specific backup file by path. */
export function readBackupFile(file: string): BackupManifest {
  if (!fs.existsSync(file)) {
    throw new Error(`Backup file not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as BackupManifest;
}
