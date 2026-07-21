/**
 * jest.chaos.config.ts
 *
 * Jest configuration for the chaos engineering test suite.
 *
 * Pre-requisites:
 *   docker compose -f docker-compose.chaos.yml up -d
 *
 * Usage:
 *   npm run test:chaos
 */
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/chaos/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
  // Chaos tests have longer timeouts due to fault injection delays
  testTimeout: 60_000,
  setupFiles: ['<rootDir>/tests/setup/jest.setup.ts'],
  clearMocks: true,
  restoreMocks: true,
  // No coverage threshold — chaos tests are exploratory
  collectCoverage: false,
  verbose: true,
};

export default config;
