/**
 * jest.config.ts
 */
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
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
  clearMocks: true,
  restoreMocks: true,
};

export default config;
