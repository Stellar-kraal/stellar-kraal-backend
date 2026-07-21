import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeConfig } from '../src/config';
import { defaultState, saveState, loadState } from '../src/state';
import { createBackup, readLatestBackup } from '../src/backup';
import { restoreFromBackup } from '../src/restore';

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

describe('backup + restore', () => {
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

  it('creates a backup snapshot that never contains a raw secret, only the reference', () => {
    const config = testConfig({ stateDir: primaryStateDir, backupDir });
    saveState(primaryStateDir, defaultState(config));

    const { file, manifest } = createBackup(primaryStateDir, backupDir);

    expect(fs.existsSync(file)).toBe(true);
    expect(manifest.state.signingKeySecretRef).toBe('mock://oracle-bridge/signing-key');

    const raw = fs.readFileSync(file, 'utf-8');
    // The reference string itself contains no secret material to leak, but
    // assert the field name present is the *reference*, not e.g. a field
    // that could plausibly hold a raw Stellar secret key (which start with "S").
    expect(raw).not.toMatch(/"S[A-Z0-9]{55}"/); // Stellar secret key shape
  });

  it('restoring into a fresh instance produces a usable, equivalent state', () => {
    const config = testConfig({ stateDir: primaryStateDir, backupDir });
    const state = defaultState(config);
    state.lastProcessedLedger = 42;
    state.lastSubmittedPrice = 512.34;
    state.lastSubmittedAt = new Date().toISOString();
    saveState(primaryStateDir, state);
    createBackup(primaryStateDir, backupDir);

    // Fresh instance — no prior state dir contents at all
    expect(loadState(standbyStateDir)).toBeNull();

    const restored = restoreFromBackup({ backupDir, targetStateDir: standbyStateDir });

    expect(restored.contractId).toBe(state.contractId);
    expect(restored.lastProcessedLedger).toBe(42);
    expect(restored.lastSubmittedPrice).toBe(512.34);
    expect(loadState(standbyStateDir)).toEqual(restored);
  });

  it('restoring with an explicit asRole overrides the manifest role, without losing other fields', () => {
    const config = testConfig({ stateDir: primaryStateDir, backupDir, role: 'primary' });
    saveState(primaryStateDir, defaultState(config));
    createBackup(primaryStateDir, backupDir);

    const restored = restoreFromBackup({
      backupDir,
      targetStateDir: standbyStateDir,
      asRole: 'standby',
    });

    expect(restored.role).toBe('standby');
    expect(restored.contractId).toBe(config.contractId);
  });

  it('throws a clear error when no backup exists yet', () => {
    expect(() => restoreFromBackup({ backupDir, targetStateDir: standbyStateDir })).toThrow(
      /No backup available/,
    );
  });

  it('throws when a backup manifest is missing a required field', () => {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, 'latest.json'),
      JSON.stringify({
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        state: { role: 'primary' }, // missing contractId, network, rpcUrl, signingKeySecretRef
      }),
    );

    expect(() => restoreFromBackup({ backupDir, targetStateDir: standbyStateDir })).toThrow(
      /missing required field/,
    );
  });

  it('rejects an unsupported backup format version', () => {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, 'latest.json'),
      JSON.stringify({ formatVersion: 99, createdAt: new Date().toISOString(), state: {} }),
    );

    expect(() => restoreFromBackup({ backupDir, targetStateDir: standbyStateDir })).toThrow(
      /Unsupported backup format version/,
    );
  });

  it('readLatestBackup reflects the most recently created snapshot', () => {
    const config = testConfig({ stateDir: primaryStateDir, backupDir });
    const state = defaultState(config);
    saveState(primaryStateDir, state);
    createBackup(primaryStateDir, backupDir);

    state.lastProcessedLedger = 7;
    saveState(primaryStateDir, state);
    createBackup(primaryStateDir, backupDir);

    const latest = readLatestBackup(backupDir);
    expect(latest?.state.lastProcessedLedger).toBe(7);
  });
});
