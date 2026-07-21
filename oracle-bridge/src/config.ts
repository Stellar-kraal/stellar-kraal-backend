/**
 * src/config.ts
 *
 * Centralised, fail-fast environment configuration for the oracle bridge.
 * Mirrors the pattern used by the main backend (src/config/env.ts): every
 * required variable is validated at startup so the process never runs in a
 * half-configured state.
 *
 * Security note: SIGNING_KEY_SECRET_REF is a *reference* string (e.g.
 * "mock://oracle-bridge/signing-key" or a real secrets-manager ARN/path) —
 * never a raw private key. The raw key is resolved at runtime through a
 * SecretsProvider (see secretsProvider.ts) and is never persisted to disk,
 * logged, or included in a backup snapshot.
 */

export type BridgeRole = 'primary' | 'standby';
export type SecretsProviderName = 'mock' | 'aws';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value?.trim() || defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer, got: "${raw}"`);
  }
  return parsed;
}

function optionalBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.trim().toLowerCase() === 'true';
}

export interface BridgeConfig {
  role: BridgeRole;
  network: string;
  rpcUrl: string;
  contractId: string;
  signingKeySecretRef: string;
  secretsProvider: SecretsProviderName;
  /**
   * When true (the default), the bridge never sends a real Soroban
   * transaction — it logs what it *would* submit. This keeps CI, local
   * dev, and the DR drill fully self-contained with no live network or
   * funded testnet account required, matching the mock-secrets testing
   * requirement from the DR issue.
   */
  dryRun: boolean;
  stateDir: string;
  backupDir: string;
  backupIntervalMs: number;
  submitIntervalMs: number;
  port: number;
}

export function loadConfig(): BridgeConfig {
  const role = optionalEnv('BRIDGE_ROLE', 'primary') as BridgeRole;
  if (role !== 'primary' && role !== 'standby') {
    throw new Error(`BRIDGE_ROLE must be "primary" or "standby", got: "${role}"`);
  }

  const secretsProvider = optionalEnv('SECRETS_PROVIDER', 'mock') as SecretsProviderName;
  if (secretsProvider !== 'mock' && secretsProvider !== 'aws') {
    throw new Error(`SECRETS_PROVIDER must be "mock" or "aws", got: "${secretsProvider}"`);
  }

  return {
    role,
    network: optionalEnv('NETWORK', 'testnet'),
    rpcUrl: optionalEnv('RPC_URL', 'https://soroban-testnet.stellar.org'),
    contractId: requireEnv('CONTRACT_ID'),
    signingKeySecretRef: requireEnv('SIGNING_KEY_SECRET_REF'),
    secretsProvider,
    dryRun: optionalBool('DRY_RUN', true),
    stateDir: optionalEnv('STATE_DIR', './data/state'),
    backupDir: optionalEnv('BACKUP_DIR', './data/backups'),
    backupIntervalMs: optionalInt('BACKUP_INTERVAL_MS', 30_000),
    submitIntervalMs: optionalInt('SUBMIT_INTERVAL_MS', 60_000),
    port: optionalInt('PORT', 4000),
  };
}
