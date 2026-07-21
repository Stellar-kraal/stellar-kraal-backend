/**
 * src/monitoring/rules/unauthorizedEntryPoint.rule.ts
 *
 * Flags two distinct conditions against the monitored contract:
 *   1. Any invocation whose transaction failed on-chain (a contract error).
 *   2. A privileged function invoked by a source account outside the
 *      configured allowlist (a likely unauthorized caller).
 */

import { monitorConfig } from '../config';
import { Anomaly, AnomalyRule, NormalizedInvocation } from '../types';

export const UNAUTHORIZED_ENTRY_POINT_RULE_ID = 'unauthorized-entry-point';

export function createUnauthorizedEntryPointRule(config: typeof monitorConfig = monitorConfig): AnomalyRule {
  const privilegedFunctions = new Set(config.PRIVILEGED_FUNCTIONS);
  const allowedInvokers = new Set(config.ALLOWED_INVOKER_ACCOUNTS);

  return {
    id: UNAUTHORIZED_ENTRY_POINT_RULE_ID,
    evaluate(invocation: NormalizedInvocation): Anomaly[] {
      const anomalies: Anomaly[] = [];
      const fnLabel = invocation.functionName ?? '(undecoded function)';

      if (!invocation.successful) {
        anomalies.push({
          ruleId: UNAUTHORIZED_ENTRY_POINT_RULE_ID,
          severity: 'critical',
          contractId: invocation.contractId,
          txHash: invocation.txHash,
          ledger: invocation.ledger,
          functionName: invocation.functionName,
          sourceAccount: invocation.sourceAccount,
          observedValue: 'failed',
          thresholdValue: 'success',
          message: `Call to "${fnLabel}" from ${invocation.sourceAccount} failed on-chain (contract error)`,
          dedupKey: `${UNAUTHORIZED_ENTRY_POINT_RULE_ID}:failed:${invocation.contractId}:${invocation.functionName ?? 'unknown'}:${invocation.sourceAccount}`,
          occurredAt: invocation.occurredAt,
        });
      }

      if (
        invocation.successful &&
        invocation.functionName &&
        privilegedFunctions.has(invocation.functionName) &&
        allowedInvokers.size > 0 &&
        !allowedInvokers.has(invocation.sourceAccount)
      ) {
        anomalies.push({
          ruleId: UNAUTHORIZED_ENTRY_POINT_RULE_ID,
          severity: 'critical',
          contractId: invocation.contractId,
          txHash: invocation.txHash,
          ledger: invocation.ledger,
          functionName: invocation.functionName,
          sourceAccount: invocation.sourceAccount,
          observedValue: invocation.sourceAccount,
          thresholdValue: `allowlisted account (${allowedInvokers.size} configured)`,
          message: `Privileged function "${invocation.functionName}" invoked by non-allowlisted account ${invocation.sourceAccount}`,
          dedupKey: `${UNAUTHORIZED_ENTRY_POINT_RULE_ID}:unauthorized:${invocation.contractId}:${invocation.functionName}:${invocation.sourceAccount}`,
          occurredAt: invocation.occurredAt,
        });
      }

      return anomalies;
    },
  };
}
