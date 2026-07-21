import { loadConfig } from '../src/config';

const REQUIRED_ENV = {
  CONTRACT_ID: 'CTESTCONTRACT0000000000000000000000000000000000000000',
  SIGNING_KEY_SECRET_REF: 'mock://oracle-bridge/signing-key',
};

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) original[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('loadConfig', () => {
  it('fails fast when CONTRACT_ID is missing', () => {
    withEnv({ CONTRACT_ID: undefined, SIGNING_KEY_SECRET_REF: REQUIRED_ENV.SIGNING_KEY_SECRET_REF }, () => {
      expect(() => loadConfig()).toThrow(/Missing required environment variable: CONTRACT_ID/);
    });
  });

  it('fails fast when SIGNING_KEY_SECRET_REF is missing', () => {
    withEnv({ CONTRACT_ID: REQUIRED_ENV.CONTRACT_ID, SIGNING_KEY_SECRET_REF: undefined }, () => {
      expect(() => loadConfig()).toThrow(/Missing required environment variable: SIGNING_KEY_SECRET_REF/);
    });
  });

  it('rejects an invalid BRIDGE_ROLE', () => {
    withEnv({ ...REQUIRED_ENV, BRIDGE_ROLE: 'tertiary' }, () => {
      expect(() => loadConfig()).toThrow(/BRIDGE_ROLE must be "primary" or "standby"/);
    });
  });

  it('defaults to a safe configuration (standby-less, dry-run, mock secrets)', () => {
    withEnv({ ...REQUIRED_ENV, BRIDGE_ROLE: undefined, DRY_RUN: undefined, SECRETS_PROVIDER: undefined }, () => {
      const config = loadConfig();
      expect(config.role).toBe('primary');
      expect(config.dryRun).toBe(true);
      expect(config.secretsProvider).toBe('mock');
    });
  });

  it('accepts an explicit standby role and dry-run override', () => {
    withEnv({ ...REQUIRED_ENV, BRIDGE_ROLE: 'standby', DRY_RUN: 'false' }, () => {
      const config = loadConfig();
      expect(config.role).toBe('standby');
      expect(config.dryRun).toBe(false);
    });
  });
});
