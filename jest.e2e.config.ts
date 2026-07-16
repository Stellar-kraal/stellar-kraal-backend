/**
 * jest.e2e.config.ts
 *
 * Jest configuration for the E2E test suite.
 *
 * Run with:
 *   npm run test:e2e
 *
 * This config is intentionally separate from jest.config.ts so that
 * unit/integration tests (npm test) never accidentally trigger E2E runs
 * that require a live backend and Soroban testnet connection.
 *
 * Key differences from jest.config.ts:
 *   - testMatch targets tests/e2e/**\/*.e2e.test.ts only
 *   - testTimeout is 90 000 ms (on-chain confirmations can be slow)
 *   - maxWorkers=1 — E2E tests run serially to avoid Friendbot rate limits
 *   - globalSetup/globalTeardown point to the E2E-specific setup scripts
 *   - dotenv is loaded from .env.e2e by the globalSetup script
 */

import type { Config } from 'jest';

const config: Config = {
  displayName: 'e2e',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',

  // Only pick up files in the e2e directory with the .e2e.test.ts suffix
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          // Allow dynamic imports in globalSetup
          module: 'commonjs',
        },
      },
    ],
  },

  // Load .env.e2e and set base process.env values before any test module runs
  setupFiles: ['<rootDir>/tests/e2e/setup/jestEnvSetup.ts'],

  // E2E-specific global setup/teardown (health check, db push, optional deploy)
  globalSetup: '<rootDir>/tests/e2e/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/e2e/setup/globalTeardown.ts',

  // Run all E2E tests in a single worker — prevents Friendbot rate limiting
  // and avoids shared Soroban sequence number conflicts
  maxWorkers: 1,

  // Individual test timeout — on-chain confirmation can take 30–60 s
  testTimeout: 90_000,

  // Do not collect coverage during E2E runs (use unit/integration for coverage)
  collectCoverage: false,

  // Verbose output so CI logs show each step name
  verbose: true,

  // Clear mocks between tests (E2E does not use mocks but keeps parity)
  clearMocks: true,
  restoreMocks: true,
};

export default config;
