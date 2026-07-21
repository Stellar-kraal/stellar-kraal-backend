/**
 * src/monitoring/rules/largeValue.rule.ts
 *
 * Flags abnormally large value-moving contract calls (e.g. a collateral
 * mint or credit retirement far above normal size), which can indicate
 * wash-trading or an exploited/misconfigured price feed.
 */

import { monitorConfig } from '../config';
import { Anomaly, AnomalyRule, NormalizedInvocation } from '../types';
import { extractLargestNumericArg } from './common';

export const LARGE_VALUE_RULE_ID = 'large-value-invocation';

export function createLargeValueRule(config: typeof monitorConfig = monitorConfig): AnomalyRule {
  const watchedFunctions = new Set(config.LARGE_VALUE_FUNCTIONS);

  return {
    id: LARGE_VALUE_RULE_ID,
    evaluate(invocation: NormalizedInvocation): Anomaly[] {
      if (!invocation.successful) return [];
      if (!invocation.functionName || !watchedFunctions.has(invocation.functionName)) return [];

      const observed = extractLargestNumericArg(invocation.args);
      if (observed === null || Math.abs(observed) <= config.LARGE_VALUE_THRESHOLD) return [];

      return [
        {
          ruleId: LARGE_VALUE_RULE_ID,
          severity: 'critical',
          contractId: invocation.contractId,
          txHash: invocation.txHash,
          ledger: invocation.ledger,
          functionName: invocation.functionName,
          sourceAccount: invocation.sourceAccount,
          observedValue: observed.toString(),
          thresholdValue: config.LARGE_VALUE_THRESHOLD.toString(),
          message: `Abnormally large value (${observed}) moved by "${invocation.functionName}" — possible wash-trading, exceeds threshold ${config.LARGE_VALUE_THRESHOLD}`,
          dedupKey: `${LARGE_VALUE_RULE_ID}:${invocation.contractId}:${invocation.functionName}:${invocation.sourceAccount}`,
          occurredAt: invocation.occurredAt,
        },
      ];
    },
  };
}
