/**
 * tests/unit/secretsProvider.test.ts
 *
 * Unit tests for the backend's secrets provider abstraction
 * (src/lib/secretsProvider.ts), mirroring oracle-bridge/tests/secretsProvider.test.ts.
 */

import { MockSecretsProvider, AwsSecretsManagerProvider, createSecretsProvider } from '../../src/lib/secretsProvider';

describe('MockSecretsProvider', () => {
  it('resolves a mock:// reference to a non-empty secret', async () => {
    const provider = new MockSecretsProvider();
    const secret = await provider.resolveSecret('mock://backend/jwt-secret');
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });

  it('is deterministic per-ref within a process lifetime', async () => {
    const provider = new MockSecretsProvider();
    const a = await provider.resolveSecret('mock://backend/jwt-secret');
    const b = await provider.resolveSecret('mock://backend/jwt-secret');
    expect(a).toBe(b);
  });

  it('gives different refs different secrets', async () => {
    const provider = new MockSecretsProvider();
    const a = await provider.resolveSecret('mock://backend/jwt-secret');
    const b = await provider.resolveSecret('mock://backend/db-password');
    expect(a).not.toBe(b);
  });

  it('refuses to resolve a non-mock:// reference', async () => {
    const provider = new MockSecretsProvider();
    await expect(provider.resolveSecret('arn:aws:secretsmanager:real-secret')).rejects.toThrow(
      /refuses to resolve a non-mock reference/,
    );
  });
});

describe('AwsSecretsManagerProvider', () => {
  it('is an explicit not-yet-implemented extension point, not a silent no-op', async () => {
    const provider = new AwsSecretsManagerProvider();
    await expect(provider.resolveSecret('arn:aws:secretsmanager:region:acct:secret:x')).rejects.toThrow(
      /not implemented/,
    );
  });
});

describe('createSecretsProvider', () => {
  it('creates the requested provider by name', () => {
    expect(createSecretsProvider('mock')).toBeInstanceOf(MockSecretsProvider);
    expect(createSecretsProvider('aws')).toBeInstanceOf(AwsSecretsManagerProvider);
  });
});
