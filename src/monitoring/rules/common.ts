/**
 * src/monitoring/rules/common.ts
 *
 * Shared helpers for anomaly rules.
 */

/**
 * Recursively scans decoded contract-call arguments for numeric leaves
 * (i128/u128/i64/u64 decode to `bigint`; i32/u32 decode to `number`) and
 * returns the one with the largest magnitude, normalized from the 7-decimal
 * fixed-point convention this contract's other numeric fields already use
 * (see `src/services/soroban.service.ts`, e.g. `principal / 1e7`).
 *
 * This is a deliberately generic heuristic: the monitoring service doesn't
 * have access to the contract's Rust source, so it can't know which
 * argument position is "the value" for an arbitrary entry point. If a
 * specific contract's ABI is known, replace this with positional extraction
 * for tighter precision.
 */
export function extractLargestNumericArg(args: unknown[]): number | null {
  let max: number | null = null;

  const consider = (candidate: number): void => {
    if (!Number.isFinite(candidate)) return;
    if (max === null || Math.abs(candidate) > Math.abs(max)) max = candidate;
  };

  const visit = (value: unknown): void => {
    if (typeof value === 'bigint') {
      consider(Number(value) / 1e7);
    } else if (typeof value === 'number') {
      consider(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  args.forEach(visit);
  return max;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
