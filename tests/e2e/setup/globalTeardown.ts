/**
 * tests/e2e/setup/globalTeardown.ts
 *
 * Runs once after the entire E2E suite completes.
 * Cleans up temporary files (e2e.db) created during the run.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../');

export default async function globalTeardown(): Promise<void> {
  // Remove E2E SQLite database
  const dbPath = path.join(ROOT, 'e2e.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('[e2e:teardown] Removed e2e.db');
  }

  // Remove WAL / SHM artefacts
  for (const suffix of ['-wal', '-shm']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
