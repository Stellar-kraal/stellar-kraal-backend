/**
 * src/monitoring/index.ts
 *
 * Entry point for the on-chain anomaly detection service. Subscribes to
 * the Horizon operations stream for CONTRACT_ID, evaluates every
 * invocation against the configured anomaly rules, and dispatches
 * deduplicated alerts to WEBHOOK_URL.
 *
 * See docs/ops/anomaly-detection.md for the rule catalogue and response
 * playbook.
 */

import { monitorConfig } from './config';
import { createLogger } from './logger';
import { startHorizonStream } from './horizon/stream';
import { createDefaultRules } from './rules';
import { AlertDeduplicator } from './alerting/dedup';
import { createDispatcher } from './alerting/dispatcher';
import { startHealthServer } from './health';

const log = createLogger('bootstrap');

function main(): void {
  log.info('Starting anomaly detection service', {
    network: monitorConfig.STELLAR_NETWORK,
    contractId: monitorConfig.CONTRACT_ID,
    horizonUrl: monitorConfig.HORIZON_URL,
  });

  const rules = createDefaultRules();
  const dedup = new AlertDeduplicator(monitorConfig.ALERT_COOLDOWN_SECONDS * 1000);
  const handleInvocation = createDispatcher(rules, dedup);

  const stream = startHorizonStream({
    horizonUrl: monitorConfig.HORIZON_URL,
    contractId: monitorConfig.CONTRACT_ID,
    allowHttp: monitorConfig.NODE_ENV !== 'production',
    onInvocation: (invocation) => {
      void handleInvocation(invocation);
    },
  });

  const healthServer = startHealthServer(() => stream.stats);

  const shutdown = (signal: string): void => {
    log.info('Shutting down anomaly detection service', { signal });
    stream.close();
    healthServer.close(() => process.exit(0));
    // Force-exit if the health server doesn't close promptly.
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
