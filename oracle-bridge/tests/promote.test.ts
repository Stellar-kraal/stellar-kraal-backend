import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeConfig } from '../src/config';
import { defaultState, saveState, loadState } from '../src/state';
import { createBackup } from '../src/backup';
import { promote } from '../src/promote';
import { MockSecretsProvider } from '../src/secretsProvider';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function testConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    role: 'primary',
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    contractId: 'CTESTCONTRACT0000000000000000000000000000000000000000',
    signingKeySecretRef: 'mock://oracle-bridge/signing-key',
    secretsProvider: 'mock',
    dryRun: true,
    stateDir: '',
    backupDir: '',
    backupIntervalMs: 30_000,
    submitIntervalMs: 60_000,
    port: 4000,
    ...overrides,
  };
}

describe('promote', () => {
  let primaryStateDir: string;
  let standbyStateDir: string;
  let backupDir: string;

  beforeEach(() => {
    primaryStateDir = tempDir('bridge-primary-');
    standbyStateDir = tempDir('bridge-standby-');
    backupDir = tempDir('bridge-backups-');
  });

  afterEach(() => {
    for (const dir of [primaryStateDir, standbyStateDir, backupDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('promotes a standby to primary, well within the 15-minute budget', async () => {
    const config = testConfig({ stateDir: primaryStateDir, backupDir });
    const state = defaultState(config);
    state.lastProcessedLedger = 10;
    saveState(primaryStateDir, state);
    createBackup(primaryStateDir, backupDir);

    const { state: promoted, elapsedMs } = await promote({
      backupDir,
      stateDir: standbyStateDir,
      secrets: new MockSecretsProvider(),
    });

    expect(promoted.role).toBe('primary');
    expect(promoted.lastProcessedLedger).toBe(10);
    expect(elapsedMs).toBeLessThan(15 * 60 * 1000);

    const onDisk = loadState(standbyStateDir);
    expect(onDisk?.role).toBe('primary');
  });

  it('fails promotion if the signing key reference cannot be resolved', async () => {
    const config = testConfig({
      stateDir: primaryStateDir,
      backupDir,
      signingKeySecretRef: 'arn:aws:secretsmanager:not-a-mock-ref',
    });
    saveState(primaryStateDir, defaultState(config));
    createBackup(primaryStateDir, backupDir);

    await expect(
      promote({ backupDir, stateDir: standbyStateDir, secrets: new MockSecretsProvider() }),
    ).rejects.toThrow(/refuses to resolve a non-mock reference/);
  });

  it('fails promotion if there is nothing to restore from', async () => {
    await expect(
      promote({ backupDir, stateDir: standbyStateDir, secrets: new MockSecretsProvider() }),
    ).rejects.toThrow(/No backup available/);
  });
});
