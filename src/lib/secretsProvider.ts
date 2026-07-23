/**
 * src/lib/secretsProvider.ts
 *
 * Abstraction over "resolve a secret reference to its raw value" for the
 * backend API. Mirrors oracle-bridge/src/secretsProvider.ts so both services
 * follow the same rotation/deployment story: config only ever holds a
 * *reference* string, never the raw secret, and a SecretsProvider is the only
 * thing allowed to turn that reference into the real value.
 *
 * Two providers are implemented:
 *  - MockSecretsProvider: deterministic fake values for CI/local dev. Refs
 *    must start with "mock://" so a mock ref can never be silently accepted
 *    in a context expecting a real one.
 *  - AwsSecretsManagerProvider: a documented extension point. Wiring this to
 *    a real secrets manager (AWS Secrets Manager, Vault, etc.) is left as
 *    follow-up work — see docs/ops/secrets-rotation.md — rather than shipping
 *    an untested cloud SDK integration.
 */

import { randomBytes } from 'crypto';

export type SecretsProviderName = 'mock' | 'aws';

export interface SecretsProvider {
  readonly name: SecretsProviderName;
  resolveSecret(ref: string): Promise<string>;
}

/**
 * Deterministic per-ref fake secret. NOT cryptographically tied to anything
 * real — suitable only for local development and CI.
 */
export class MockSecretsProvider implements SecretsProvider {
  readonly name = 'mock' as const;
  private cache = new Map<string, string>();

  async resolveSecret(ref: string): Promise<string> {
    if (!ref.startsWith('mock://')) {
      throw new Error(
        `MockSecretsProvider refuses to resolve a non-mock reference: "${ref}". ` +
          'Set SECRETS_PROVIDER=aws (or your real provider) for non-mock refs.',
      );
    }
    const cached = this.cache.get(ref);
    if (cached) return cached;

    const value = randomBytes(48).toString('hex');
    this.cache.set(ref, value);
    return value;
  }
}

export class AwsSecretsManagerProvider implements SecretsProvider {
  readonly name = 'aws' as const;

  async resolveSecret(ref: string): Promise<string> {
    throw new Error(
      `AwsSecretsManagerProvider is not implemented in this repository yet (ref: "${ref}"). ` +
        'Wire it to your secrets manager of choice and set SECRETS_PROVIDER=aws. ' +
        'See docs/ops/secrets-rotation.md for the integration contract this class must satisfy.',
    );
  }
}

export function createSecretsProvider(name: SecretsProviderName): SecretsProvider {
  switch (name) {
    case 'mock':
      return new MockSecretsProvider();
    case 'aws':
      return new AwsSecretsManagerProvider();
  }
}
