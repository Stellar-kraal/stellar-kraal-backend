/**
 * src/services/appraisal.service.ts
 *
 * Collateral Appraisal Oracle — ADR-005 & ADR-006
 *
 * Implements a multi-factor, breed-aware pricing model that produces an
 * off-chain USDC appraisal for a livestock asset.  The model uses:
 *   - Base price per animal type/breed table
 *   - Weight adjustment (price per kg)
 *   - Age depreciation curve (young/prime/senior)
 *   - Health discount matrix
 *   - Conservative haircut (loan-to-value)
 *
 * ADR-006: In production, multiple price oracles (e.g. regional market feeds,
 * government livestock price APIs) are aggregated via a median to resist
 * manipulation.  This module provides the aggregation layer and stub adapters
 * that can be swapped for real HTTP adapters.
 */

import { createLogger } from '../lib/logger';
import { median, rejectOutliers } from './oracle-aggregation';

const log = createLogger('appraisal');

/**
 * Max % deviation from the median an oracle price may have before it is
 * excluded as an outlier (ADR-006). Configurable so operators can tighten
 * or loosen manipulation resistance without a code change.
 */
const ORACLE_MAX_DEVIATION_PCT = Number(process.env.ORACLE_MAX_DEVIATION_PCT ?? 15);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnimalType = 'CATTLE' | 'GOAT' | 'SHEEP' | 'PIG' | 'DONKEY';

export type HealthStatus =
  | 'EXCELLENT'
  | 'GOOD'
  | 'FAIR'
  | 'POOR';

export interface LivestockMetadata {
  type: AnimalType;
  breed: string;
  weightKg: number;
  ageMonths: number;
  healthStatus: HealthStatus;
  imageUrl?: string;
  location?: string;
}

export interface AppraisalResult {
  /** Gross market value in USDC */
  marketValueUSDC: number;
  /** Collateral value after LTV haircut (used as loan ceiling) */
  collateralValueUSDC: number;
  /** Loan-to-value ratio applied, e.g. 0.70 */
  ltvRatio: number;
  /** Confidence score 0–1 */
  confidence: number;
  breakdown: {
    basePrice: number;
    weightAdjustment: number;
    ageMultiplier: number;
    healthMultiplier: number;
  };
}

// ─── Price Tables (USD) ──────────────────────────────────────────────────────

/** Base market price per kg of live weight by animal type */
const BASE_PRICE_PER_KG_USD: Record<AnimalType, number> = {
  CATTLE: 2.5,
  GOAT: 3.2,
  SHEEP: 2.8,
  PIG: 1.9,
  DONKEY: 1.4,
};

/**
 * Breed premium multipliers.
 * Key pattern: `${type}:${breed.toLowerCase()}` → multiplier
 * Unknown breeds fall back to 1.0.
 */
const BREED_PREMIUM: Record<string, number> = {
  'CATTLE:angus': 1.35,
  'CATTLE:brahman': 1.20,
  'CATTLE:hereford': 1.28,
  'CATTLE:local': 1.00,
  'GOAT:boer': 1.40,
  'GOAT:kalahari': 1.30,
  'GOAT:local': 1.00,
  'SHEEP:dorper': 1.25,
  'SHEEP:merino': 1.20,
  'SHEEP:local': 1.00,
  'PIG:large white': 1.15,
  'PIG:local': 1.00,
  'DONKEY:local': 1.00,
};

/**
 * Age multiplier curve.
 * Livestock in prime years command the highest price; very young or old animals
 * are discounted.
 *
 * Ranges are in months.
 */
function ageMultiplier(type: AnimalType, ageMonths: number): number {
  // Prime age windows by species (months)
  const primeRanges: Record<AnimalType, [number, number]> = {
    CATTLE: [24, 84],   // 2–7 years
    GOAT: [12, 60],     // 1–5 years
    SHEEP: [12, 60],
    PIG: [6, 36],       // 6 months – 3 years
    DONKEY: [36, 120],  // 3–10 years
  };

  const [primeStart, primeEnd] = primeRanges[type];

  if (ageMonths < primeStart * 0.5) return 0.60;  // very young
  if (ageMonths < primeStart) return 0.80;          // juvenile
  if (ageMonths <= primeEnd) return 1.00;            // prime
  if (ageMonths <= primeEnd * 1.5) return 0.85;     // mature
  return 0.65;                                        // old
}

/** Health discount applied to market value */
const HEALTH_MULTIPLIER: Record<HealthStatus, number> = {
  EXCELLENT: 1.00,
  GOOD: 0.90,
  FAIR: 0.75,
  POOR: 0.50,
};

/** LTV haircut per health status — reduces collateral value further */
const LTV_RATIO: Record<HealthStatus, number> = {
  EXCELLENT: 0.75,
  GOOD: 0.70,
  FAIR: 0.60,
  POOR: 0.45,
};

// ─── Oracle adapters (ADR-006) ────────────────────────────────────────────────

interface OracleAdapter {
  name: string;
  /** Returns a price per kg for the given animal type, or null on failure */
  getPricePerKg(type: AnimalType, breed: string): Promise<number | null>;
}

/**
 * Primary oracle: uses the internal price table.
 * In production replace with an HTTP call to a regional livestock exchange API.
 */
const internalOracle: OracleAdapter = {
  name: 'internal',
  async getPricePerKg(type, breed): Promise<number | null> {
    const base = BASE_PRICE_PER_KG_USD[type];
    const breedKey = `${type}:${breed.toLowerCase()}`;
    const premium = BREED_PREMIUM[breedKey] ?? 1.0;
    return base * premium;
  },
};

/**
 * Stub secondary oracle — replace with a real market data provider.
 * Returns null to simulate unavailability; the aggregator will exclude nulls.
 */
const marketFeedOracle: OracleAdapter = {
  name: 'market-feed',
  async getPricePerKg(_type, _breed): Promise<number | null> {
    // TODO: implement real HTTP call to regional livestock price feed
    return null;
  },
};

/** All oracle adapters. Add more here to improve price accuracy. */
const ORACLES: OracleAdapter[] = [internalOracle, marketFeedOracle];

/**
 * Aggregate oracle prices using median with outlier rejection (ADR-006).
 * Null responses (unavailable feeds) are excluded. Any responding price that
 * deviates from the group median by more than ORACLE_MAX_DEVIATION_PCT is
 * dropped before the final median is computed, so a single manipulated or
 * malfunctioning feed cannot skew the aggregate (see oracle-aggregation.ts).
 */
async function aggregatedPricePerKg(
  type: AnimalType,
  breed: string,
): Promise<number> {
  const results = await Promise.allSettled(
    ORACLES.map((o) => o.getPricePerKg(type, breed)),
  );

  const prices: number[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      prices.push(result.value);
    }
  }

  if (prices.length === 0) {
    // Hard fallback to internal table if all external oracles fail
    log.warn('All external oracles failed; using internal table', { type, breed });
    const base = BASE_PRICE_PER_KG_USD[type];
    const premium = BREED_PREMIUM[`${type}:${breed.toLowerCase()}`] ?? 1.0;
    return base * premium;
  }

  const filtered = rejectOutliers(prices, ORACLE_MAX_DEVIATION_PCT);
  if (filtered.length < prices.length) {
    log.warn('Rejected outlier oracle price(s)', {
      type,
      breed,
      allPrices: prices,
      keptPrices: filtered,
      maxDeviationPct: ORACLE_MAX_DEVIATION_PCT,
    });
  }

  return median(filtered);
}

// ─── Main appraisal function ──────────────────────────────────────────────────

/**
 * Appraise a livestock asset and return the USDC valuation.
 *
 * @param metadata  Livestock metadata submitted by the farmer
 * @returns         Structured appraisal result
 */
export async function appraiseLivestock(
  metadata: LivestockMetadata,
): Promise<AppraisalResult> {
  const { type, breed, weightKg, ageMonths, healthStatus } = metadata;

  // Input validation
  if (weightKg <= 0) throw new Error('weightKg must be positive');
  if (ageMonths < 0) throw new Error('ageMonths must be non-negative');

  const pricePerKg = await aggregatedPricePerKg(type, breed);
  const ageMult = ageMultiplier(type, ageMonths);
  const healthMult = HEALTH_MULTIPLIER[healthStatus];
  const ltv = LTV_RATIO[healthStatus];

  const basePrice = pricePerKg * weightKg;
  const weightAdjustment = 0; // weight already factored into basePrice
  const marketValueUSDC = parseFloat(
    (basePrice * ageMult * healthMult).toFixed(2),
  );
  const collateralValueUSDC = parseFloat((marketValueUSDC * ltv).toFixed(2));

  // Confidence: 1.0 if all oracles responded, lower otherwise
  const availableOracles = (
    await Promise.allSettled(ORACLES.map((o) => o.getPricePerKg(type, breed)))
  ).filter((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<number | null>).value !== null).length;

  const confidence = parseFloat((availableOracles / ORACLES.length).toFixed(2));

  log.info('Appraisal complete', {
    type,
    breed,
    weightKg,
    ageMonths,
    healthStatus,
    marketValueUSDC,
    collateralValueUSDC,
    ltv,
  });

  return {
    marketValueUSDC,
    collateralValueUSDC,
    ltvRatio: ltv,
    confidence,
    breakdown: {
      basePrice: parseFloat(basePrice.toFixed(2)),
      weightAdjustment,
      ageMultiplier: ageMult,
      healthMultiplier: healthMult,
    },
  };
}

// Re-export types for consumers
export type { OracleAdapter };
