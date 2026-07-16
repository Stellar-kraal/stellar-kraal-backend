/**
 * tests/e2e/config.ts
 *
 * Centralised configuration for the E2E test suite.
 * Values are read from environment variables (populated from .env.e2e
 * by jest.e2e.config.ts via dotenv).
 *
 * All values have safe defaults for testnet runs.
 */

export interface E2EConfig {
  /** Base URL of the running backend API, e.g. http://localhost:3001 */
  apiUrl: string;

  /** Stellar network: "testnet" | "mainnet" */
  network: string;

  /** Soroban RPC endpoint */
  rpcUrl: string;

  /**
   * Deployed contract ID for the E2E run.
   * If E2E_DEPLOY_CONTRACT=true this is set after deployment.
   * Otherwise provide a pre-deployed contract ID.
   */
  contractId: string;

  /** Server-side oracle secret key (used to pre-sign appraisal txns in tests) */
  serverSecretKey: string;

  /**
   * Whether the test runner should deploy a fresh contract before the suite.
   * Set E2E_DEPLOY_CONTRACT=true in CI to enable.
   */
  deployContract: boolean;

  /** Print verbose step logs to console */
  verbose: boolean;

  /** Maximum time (ms) to wait for on-chain confirmation in any step */
  onChainTimeoutMs: number;

  /** JWT secret used by the backend (needed to verify tokens in assertions) */
  jwtSecret: string;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`[e2e] Missing required environment variable: ${key}`);
  return v;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue;
}

export const E2E_CONFIG: E2EConfig = {
  apiUrl: optionalEnv('E2E_API_URL', 'http://localhost:3001'),
  network: optionalEnv('E2E_NETWORK', 'testnet'),
  rpcUrl: optionalEnv('E2E_RPC_URL', 'https://soroban-testnet.stellar.org'),
  contractId: optionalEnv(
    'E2E_CONTRACT_ID',
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  ),
  serverSecretKey: optionalEnv(
    'E2E_SERVER_SECRET_KEY',
    // CI-safe placeholder — real key must be supplied for on-chain assertions
    'SBDUYVTILOG55EI4N4ICFUQ24KTZ2HXODDN5M5IVGSDACPYYCGPRXNZR',
  ),
  deployContract: optionalEnv('E2E_DEPLOY_CONTRACT', 'false') === 'true',
  verbose: optionalEnv('E2E_VERBOSE', 'true') === 'true',
  onChainTimeoutMs: parseInt(optionalEnv('E2E_ON_CHAIN_TIMEOUT_MS', '90000'), 10),
  jwtSecret: optionalEnv(
    'E2E_JWT_SECRET',
    'test-jwt-secret-that-is-long-enough-for-testing-purposes-only',
  ),
};
