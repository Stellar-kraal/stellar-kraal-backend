/**
 * src/monitoring/alerting/dispatcher.ts
 *
 * Wires normalized invocations through every anomaly rule, deduplicates
 * the results against the cooldown window, and dispatches survivors to
 * the webhook.
 */

import { createLogger } from '../logger';
import { AnomalyRule, NormalizedInvocation } from '../types';
import { AlertDeduplicator } from './dedup';
import { sendAlert } from './webhook';

const log = createLogger('dispatcher');

export function createDispatcher(rules: AnomalyRule[], dedup: AlertDeduplicator) {
  return async function handleInvocation(invocation: NormalizedInvocation): Promise<void> {
    for (const rule of rules) {
      let anomalies;
      try {
        anomalies = rule.evaluate(invocation);
      } catch (err) {
        log.error('Rule evaluation threw', { ruleId: rule.id, err });
        continue;
      }

      for (const anomaly of anomalies) {
        if (!dedup.shouldAlert(anomaly.dedupKey)) {
          log.debug('Anomaly suppressed by cooldown', { ruleId: anomaly.ruleId, dedupKey: anomaly.dedupKey });
          continue;
        }

        log.warn('Anomaly detected', {
          ruleId: anomaly.ruleId,
          severity: anomaly.severity,
          txHash: anomaly.txHash,
          observedValue: anomaly.observedValue,
          thresholdValue: anomaly.thresholdValue,
        });

        await sendAlert(anomaly);
      }
    }
  };
}
