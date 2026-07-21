/**
 * src/monitoring/rules/oracleDeviation.rule.ts
 *
 * Tracks a rolling average of observed values per watched function and
 * flags a new value that deviates from that average by more than the
 * configured percentage — a proxy for oracle price manipulation or feed
 * corruption.
 */

import { monitorConfig } from '../config';
import { Anomaly, AnomalyRule, NormalizedInvocation } from '../types';
import { extractLargestNumericArg, mean } from './common';

export const ORACLE_DEVIATION_RULE_ID = 'oracle-price-deviation';

const HISTORY_LIMIT = 50;

export function createOracleDeviationRule(config: typeof monitorConfig = monitorConfig): AnomalyRule {
  const watchedFunctions = new Set(config.ORACLE_PRICE_FUNCTIONS);
  const history = new Map<string, number[]>();

  return {
    id: ORACLE_DEVIATION_RULE_ID,
    evaluate(invocation: NormalizedInvocation): Anomaly[] {
      if (!invocation.successful) return [];
      if (!invocation.functionName || !watchedFunctions.has(invocation.functionName)) return [];

      const observed = extractLargestNumericArg(invocation.args);
      if (observed === null) return [];

      const key = `${invocation.contractId}:${invocation.functionName}`;
      const samples = history.get(key) ?? [];

      const anomalies: Anomaly[] = [];

      if (samples.length >= config.ORACLE_DEVIATION_MIN_SAMPLES) {
        const baseline = mean(samples);
        const deviationPct = baseline === 0 ? (observed === 0 ? 0 : 100) : (Math.abs(observed - baseline) / Math.abs(baseline)) * 100;

        if (deviationPct > config.ORACLE_DEVIATION_THRESHOLD_PCT) {
          anomalies.push({
            ruleId: ORACLE_DEVIATION_RULE_ID,
            severity: 'critical',
            contractId: invocation.contractId,
            txHash: invocation.txHash,
            ledger: invocation.ledger,
            functionName: invocation.functionName,
            sourceAccount: invocation.sourceAccount,
            observedValue: observed.toString(),
            thresholdValue: `${config.ORACLE_DEVIATION_THRESHOLD_PCT}% (baseline ${baseline.toFixed(4)})`,
            message: `Value from "${invocation.functionName}" deviates ${deviationPct.toFixed(1)}% from the rolling ${samples.length}-sample baseline of ${baseline.toFixed(4)}`,
            dedupKey: `${ORACLE_DEVIATION_RULE_ID}:${key}`,
            occurredAt: invocation.occurredAt,
          });
        }
      }

      samples.push(observed);
      if (samples.length > HISTORY_LIMIT) samples.shift();
      history.set(key, samples);

      return anomalies;
    },
  };
}
