/**
 * src/monitoring/types.ts
 *
 * Shared types for the on-chain anomaly detection service.
 */

/**
 * A single `invoke_host_function` call against the monitored contract,
 * normalized from a raw Horizon operation record.
 */
export interface NormalizedInvocation {
  /** Horizon operation id */
  operationId: string;
  contractId: string;
  txHash: string;
  ledger: number;
  /** ISO-8601 timestamp from Horizon's `created_at` */
  occurredAt: string;
  sourceAccount: string;
  /** Decoded contract function name (Symbol), or null if it couldn't be decoded */
  functionName: string | null;
  /** Decoded native argument values (best-effort; undecodable args are omitted) */
  args: unknown[];
  /** Whether the parent transaction succeeded on-chain */
  successful: boolean;
}

export type AnomalySeverity = 'warning' | 'critical';

export interface Anomaly {
  ruleId: string;
  severity: AnomalySeverity;
  contractId: string;
  txHash: string;
  ledger: number;
  functionName: string | null;
  sourceAccount: string;
  observedValue: string;
  thresholdValue: string;
  message: string;
  /** Key used for cooldown-based deduplication (rule-specific) */
  dedupKey: string;
  occurredAt: string;
}

/**
 * An anomaly detection rule. Rules are stateful closures (e.g. rolling
 * averages, sliding windows) so they're created once via a factory and
 * fed every normalized invocation in order.
 */
export interface AnomalyRule {
  id: string;
  evaluate(invocation: NormalizedInvocation): Anomaly[];
}
