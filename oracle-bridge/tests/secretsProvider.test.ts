import { MockSecretsProvider, AwsSecretsManagerProvider, createSecretsProvider } from '../src/secretsProvider';

describe('MockSecretsProvider', () => {
  it('resolves a mock:// reference to a valid-looking Stellar secret key', async () => {
    const provider = new MockSecretsProvider();
    const secret = await provider.resolveSecret('mock://oracle-bridge/signing-key');
    expect(secret).toMatch(/^S[A-Z0-9]{55}$/);
  });

  it('is deterministic per-ref within a process lifetime', async () => {
    const provider = new MockSecretsProvider();
    const a = await provider.resolveSecret('mock://oracle-bridge/signing-key');
    const b = await provider.resolveSecret('mock://oracle-bridge/signing-key');
    expect(a).toBe(b);
  });

  it('gives different refs different secrets', async () => {
    const provider = new MockSecretsProvider();
    const a = await provider.resolveSecret('mock://oracle-bridge/signing-key');
    const b = await provider.resolveSecret('mock://oracle-bridge/other-key');
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
