/**
 * tests/setup/jest.setup.ts
 *
 * Runs after the test framework is installed, before each test file.
 * Sets test environment variables so config/env.ts passes validation.
 */

// ── Environment ──────────────────────────────────────────────────────────────
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'file:./test.db';
process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-long-enough-for-testing-purposes-only';
process.env['JWT_EXPIRES_IN'] = '1h';
process.env['CONTRACT_ID'] = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
// Valid Stellar secret key (testnet only — never used on mainnet)
process.env['SERVER_SECRET_KEY'] = 'SBDUYVTILOG55EI4N4ICFUQ24KTZ2HXODDN5M5IVGSDACPYYCGPRXNZR';
process.env['STELLAR_NETWORK'] = 'testnet';
process.env['RPC_URL'] = 'https://soroban-testnet.stellar.org';
process.env['FRONTEND_URL'] = 'http://localhost:3000';
process.env['POLL_INTERVAL_MS'] = '60000';
process.env['START_LEDGER'] = '0';
process.env['LOG_LEVEL'] = 'silent';
process.env['PORT'] = '3002';

// ── Monitoring service (src/monitoring/config.ts) ──────────────────────────
process.env['WEBHOOK_URL'] = 'https://hooks.example.test/webhook';
