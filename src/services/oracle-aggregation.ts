/**
 * src/services/oracle-aggregation.ts
 *
 * Pure, side-effect-free primitives for the collateral price oracle
 * aggregation layer (ADR-006). Kept separate from appraisal.service.ts so
 * the aggregation math can be property-tested in isolation from the
 * async oracle adapters and pricing tables.
 *
 * Terminology: samples are tagged with a Stellar ledger sequence number
 * (rather than a wall-clock timestamp) so staleness can be defined in
 * terms of ledger age, matching how freshness is evaluated on-chain.
 */

export interface OraclePriceSample {
  source: string;
  price: number;
  ledger: number;
}

export interface AggregationOptions {
  /** Current ledger sequence, used as the staleness reference point. */
  currentLedger: number;
  /** A sample older than this many ledgers is excluded as stale. */
  maxAgeLedgers: number;
  /** A sample deviating from the reference median by more than this % is rejected as an outlier. */
  maxDeviationPct: number;
  /** Minimum number of surviving samples required to produce a price. */
  minSources: number;
}

export interface AggregationResult {
  /** Aggregated median price, or null if too few samples survived filtering. */
  price: number | null;
  usedSources: string[];
  rejectedStale: string[];
  rejectedOutlier: string[];
}

/**
 * Median of a non-empty array of finite numbers.
 * Even-length arrays return the average of the two middle values.
 */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error('median: values must be non-empty');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * True if `value` deviates from `referenceMedian` by more than `maxDeviationPct` percent.
 * A referenceMedian of 0 is treated as a special case: any non-zero value is an outlier,
 * since percentage deviation from zero is undefined.
 */
export function isOutlier(
  value: number,
  referenceMedian: number,
  maxDeviationPct: number,
): boolean {
  if (referenceMedian === 0) {
    return value !== 0;
  }
  const deviationPct = (Math.abs(value - referenceMedian) / Math.abs(referenceMedian)) * 100;
  return deviationPct > maxDeviationPct;
}

/**
 * Rejects values that deviate from the set's own median by more than `maxDeviationPct`.
 *
 * The reference median is always computed from `values` itself, so any element whose
 * value exactly equals that median has zero deviation and can never be rejected
 * (for any maxDeviationPct >= 0).
 */
export function rejectOutliers(values: number[], maxDeviationPct: number): number[] {
  if (values.length === 0) return [];
  const ref = median(values);
  return values.filter((v) => !isOutlier(v, ref, maxDeviationPct));
}

/**
 * A sample is stale once it is more than `maxAgeLedgers` ledgers old.
 * A sample submitted exactly `maxAgeLedgers` ledgers ago is still fresh (boundary is inclusive).
 */
export function isStale(
  currentLedger: number,
  sampleLedger: number,
  maxAgeLedgers: number,
): boolean {
  return currentLedger - sampleLedger > maxAgeLedgers;
}

/**
 * True if `value` passes quality validation against `referenceMedian` under `maxDeviationPct`.
 * This is the accept-side complement of isOutlier — used to express and test the
 * monotonicity of data-quality thresholds (stricter thresholds accept a subset).
 */
export function validateQuality(
  value: number,
  referenceMedian: number,
  maxDeviationPct: number,
): boolean {
  return !isOutlier(value, referenceMedian, maxDeviationPct);
}

/**
 * Full aggregation pipeline: drop stale samples, drop outliers (relative to the
 * median of the still-fresh samples), then return the median of what remains —
 * provided at least `minSources` samples survived both filters.
 */
export function aggregate(
  samples: OraclePriceSample[],
  opts: AggregationOptions,
): AggregationResult {
  const { currentLedger, maxAgeLedgers, maxDeviationPct, minSources } = opts;

  const rejectedStale: string[] = [];
  const fresh: OraclePriceSample[] = [];
  for (const s of samples) {
    if (isStale(currentLedger, s.ledger, maxAgeLedgers)) {
      rejectedStale.push(s.source);
    } else {
      fresh.push(s);
    }
  }

  if (fresh.length === 0) {
    return { price: null, usedSources: [], rejectedStale, rejectedOutlier: [] };
  }

  const ref = median(fresh.map((s) => s.price));
  const rejectedOutlier: string[] = [];
  const surviving: OraclePriceSample[] = [];
  for (const s of fresh) {
    if (isOutlier(s.price, ref, maxDeviationPct)) {
      rejectedOutlier.push(s.source);
    } else {
      surviving.push(s);
    }
  }

  if (surviving.length < minSources) {
    return {
      price: null,
      usedSources: [],
      rejectedStale,
      rejectedOutlier,
    };
  }

  return {
    price: median(surviving.map((s) => s.price)),
    usedSources: surviving.map((s) => s.source),
    rejectedStale,
    rejectedOutlier,
  };
}
