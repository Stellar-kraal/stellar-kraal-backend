#!/usr/bin/env ts-node
/**
 * scripts/rotate-jwt-secret.ts
 *
 * Generates a new JWT signing secret and prints the environment variables
 * to apply for a zero-downtime rotation: the new secret becomes JWT_SECRET,
 * the current secret moves to JWT_SECRET_PREVIOUS, and JWT_SECRET_ROTATED_AT
 * records when the overlap window started (see verifyJwt's dual-key check
 * in src/services/auth.service.ts and docs/ops/secrets-rotation.md).
 *
 * This script only prints values — it does not write to a secrets manager
 * or a running process. Wire its output into your CI/CD deploy step or
 * secrets-manager CLI (aws secretsmanager put-secret-value, vault kv put, ...).
 *
 * Usage: npm run rotate:jwt-secret
 */
import { randomBytes } from 'crypto';
import { createSecretsProvider } from '../src/lib/secretsProvider';

async function main(): Promise<void> {
  const providerName = (process.env.SECRETS_PROVIDER as 'mock' | 'aws') || 'mock';
  const provider = createSecretsProvider(providerName);

  const newSecret =
    providerName === 'mock'
      ? await provider.resolveSecret(`mock://backend/jwt-secret/${randomBytes(4).toString('hex')}`)
      : randomBytes(64).toString('hex');

  const currentSecret = process.env.JWT_SECRET;
  const rotatedAt = new Date().toISOString();

  // eslint-disable-next-line no-console
  console.log('# Apply these to your secrets manager / deploy environment:');
  // eslint-disable-next-line no-console
  console.log(`JWT_SECRET=${newSecret}`);
  if (currentSecret) {
    // eslint-disable-next-line no-console
    console.log(`JWT_SECRET_PREVIOUS=${currentSecret}`);
    // eslint-disable-next-line no-console
    console.log(`JWT_SECRET_ROTATED_AT=${rotatedAt}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('# No current JWT_SECRET found in this environment — first-time setup, no overlap window needed.');
  }
  // eslint-disable-next-line no-console
  console.log(
    '\n# After JWT_ROTATION_OVERLAP_MS has elapsed, remove JWT_SECRET_PREVIOUS and JWT_SECRET_ROTATED_AT.',
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('JWT secret rotation failed:', (err as Error).message);
  process.exit(1);
});
