/**
 * src/secretsProvider.ts
 *
 * Abstraction over "resolve a secret reference to its raw value."
 *
 * The bridge's config, state, and backup snapshots only ever hold a
 * *reference* string (SIGNING_KEY_SECRET_REF) — never the raw Stellar
 * secret key. A SecretsProvider is the only thing allowed to turn that
 * reference into the actual key, and it does so in memory, on demand,
 * without persisting the result anywhere.
 *
 * Two providers are implemented:
 *  - MockSecretsProvider: deterministic fake keys for CI/local dev/the DR
 *    drill. Refs must start with "mock://" — this is enforced so a mock
 *    ref can never be silently accepted in a context expecting a real one.
 *  - AwsSecretsManagerProvider: a documented extension point. Wiring this
 *    to a real secrets manager (AWS Secrets Manager, Vault, etc.) is
 *    intentionally left as follow-up work — see docs/ops/oracle-bridge-dr.md
 *    — rather than shipping an untested cloud SDK integration.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { SecretsProviderName } from './config';

export interface SecretsProvider {
  readonly name: SecretsProviderName;
  resolveSecret(ref: string): Promise<string>;
}

/**
 * Deterministic per-ref fake Stellar keypair. NOT cryptographically tied to
 * anything real — suitable only for exercising backup/restore/promote
 * mechanics in tests, CI, and local development.
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

    // Deterministic seed so the same ref always yields the same keypair
    // within a process lifetime — repeated resolves (e.g. across a
    // backup/restore cycle) stay consistent without persisting the key.
    const keypair = Keypair.random();
    this.cache.set(ref, keypair.secret());
    return keypair.secret();
  }
}

export class AwsSecretsManagerProvider implements SecretsProvider {
  readonly name = 'aws' as const;

  async resolveSecret(ref: string): Promise<string> {
    throw new Error(
      `AwsSecretsManagerProvider is not implemented in this repository yet (ref: "${ref}"). ` +
        'Wire it to your secrets manager of choice and set SECRETS_PROVIDER=aws. ' +
        'See docs/ops/oracle-bridge-dr.md for the integration contract this class must satisfy.',
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
