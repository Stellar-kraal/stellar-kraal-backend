import { monitorConfig } from '../../../src/monitoring/config';
import { NormalizedInvocation } from '../../../src/monitoring/types';

/** A fully-populated MonitorConfig fixture; override per-test with `{ ...baseMonitorConfig, FIELD: value }`. */
export const baseMonitorConfig: typeof monitorConfig = {
  STELLAR_NETWORK: 'testnet',
  CONTRACT_ID: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  MONITOR_PORT: 3002,
  MAX_EVENT_LAG_MS: 10_000,
  WEBHOOK_URL: 'https://hooks.example.test/webhook',
  WEBHOOK_FORMAT: 'slack',
  ALERT_COOLDOWN_SECONDS: 900,
  LARGE_VALUE_FUNCTIONS: ['mint_collateral'],
  LARGE_VALUE_THRESHOLD: 50_000,
  ORACLE_PRICE_FUNCTIONS: ['set_price'],
  ORACLE_DEVIATION_THRESHOLD_PCT: 20,
  ORACLE_DEVIATION_MIN_SAMPLES: 3,
  PRIVILEGED_FUNCTIONS: ['mint_collateral'],
  ALLOWED_INVOKER_ACCOUNTS: [],
  VOLUME_WINDOW_SECONDS: 60,
  VOLUME_BASELINE_WINDOWS: 10,
  VOLUME_SPIKE_MULTIPLIER: 3,
  VOLUME_SPIKE_MIN_COUNT: 10,
};

let counter = 0;

export function makeInvocation(overrides: Partial<NormalizedInvocation> = {}): NormalizedInvocation {
  counter += 1;
  return {
    operationId: `op-${counter}`,
    contractId: baseMonitorConfig.CONTRACT_ID,
    txHash: `tx-${counter}`,
    ledger: 1_000_000 + counter,
    occurredAt: new Date('2026-07-20T00:00:00Z').toISOString(),
    sourceAccount: 'GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3',
    functionName: null,
    args: [],
    successful: true,
    ...overrides,
  };
}
