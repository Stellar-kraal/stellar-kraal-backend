/**
 * src/promote.ts
 *
 * Promotes a standby instance to primary: restore the latest backup (in
 * case this instance's warm-sync loop is behind), resolve the signing key
 * to prove it's actually reachable, flip role to "primary", and persist.
 *
 * This is the operation the DR drill measures end-to-end — from "primary
 * declared failed" to "standby is live as primary" — against the
 * under-15-minutes acceptance criterion.
 */

import { restoreFromBackup } from './restore';
import { saveState, BridgeState } from './state';
import { SecretsProvider } from './secretsProvider';
import { logger } from './logger';

export interface PromoteOptions {
  backupDir: string;
  stateDir: string;
  secrets: SecretsProvider;
}

export interface PromoteResult {
  state: BridgeState;
  elapsedMs: number;
}

export async function promote(opts: PromoteOptions): Promise<PromoteResult> {
  const start = Date.now();
  logger.info('Promotion started');

  const restored = restoreFromBackup({
    backupDir: opts.backupDir,
    targetStateDir: opts.stateDir,
  });

  // Prove the signing key is actually reachable before declaring success —
  // a promotion that "succeeds" but can't sign transactions is not a real
  // promotion.
  await opts.secrets.resolveSecret(restored.signingKeySecretRef);

  const promoted = saveState(opts.stateDir, { ...restored, role: 'primary' });

  const elapsedMs = Date.now() - start;
  logger.info('Promotion complete', { elapsedMs });
  return { state: promoted, elapsedMs };
}
