/**
 * tests/unit/oracle-aggregation.property.test.ts
 *
 * Property-based tests for the oracle aggregation layer (ADR-006), using
 * fast-check — the property-based testing library for TypeScript/JavaScript,
 * equivalent in model (generators + automatic shrinking to a minimal
 * counterexample) to Python's Hypothesis.
 *
 * Each property below is intentionally documented with the invariant it
 * proves and why that invariant matters for oracle correctness. See
 * tests/README.md for how to run these and how to add new properties.
 */

import fc from 'fast-check';
import {
  median,
  rejectOutliers,
  isStale,
  validateQuality,
  aggregate,
  OraclePriceSample,
} from '../../src/services/oracle-aggregation';

// ─── Configuration ──────────────────────────────────────────────────────────

// AC: "CI runs property tests with a configurable example count (default
// ≥500 examples per property)". Override in CI / locally via FC_NUM_RUNS.
const NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 500);

// Bounded, finite numeric domain. Oracle prices are always positive; we also
// exercise zero/negative edges explicitly in dedicated unit tests, and keep
// the property domain finite to avoid NaN/Infinity noise unrelated to the
// invariants under test.
const price = () =>
  fc.double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

const anyFinite = () =>
  fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

const deviationPct = () => fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true });

const ledger = () => fc.integer({ min: 0, max: 10_000_000 });

/** Arbitrary array of oracle samples with guaranteed-unique source names. */
const samplesArb = (opts?: { minLength?: number; maxLength?: number }) =>
  fc
    .array(
      fc.record({ price: price(), ledger: ledger() }),
      { minLength: opts?.minLength ?? 1, maxLength: opts?.maxLength ?? 25 },
    )
    .map((rows): OraclePriceSample[] =>
      rows.map((r, i) => ({ source: `oracle-${i}`, price: r.price, ledger: r.ledger })),
    );

// ─── Property 1: median is always within the range of its inputs ──────────
//
// Why it matters: the median is the aggregator's final published price. If
// it could ever fall outside [min(inputs), max(inputs)], the aggregation
// arithmetic itself would be broken, independent of outlier rejection —
// this is the most basic soundness guarantee the whole aggregator rests on.

describe('property: median is always within the range of inputs', () => {
  it('min(values) <= median(values) <= max(values)', () => {
    fc.assert(
      fc.property(fc.array(anyFinite(), { minLength: 1, maxLength: 200 }), (values) => {
        const m = median(values);
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        return m >= lo && m <= hi;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 2: outlier rejection never removes the median itself ────────
//
// Why it matters: the rejection threshold is measured as a % deviation from
// the group's own median. By construction the median has zero deviation
// from itself, so the source reporting the median value must always
// survive rejection, for any non-negative threshold. If this property ever
// broke, it would mean an attacker (or a bug) could cause the aggregator to
// discard the very value it is supposed to converge on.

describe('property: outlier rejection never removes the median itself', () => {
  it('the element equal to the array median always survives rejectOutliers', () => {
    fc.assert(
      fc.property(
        fc
          .array(price(), { minLength: 1, maxLength: 49 })
          .filter((arr) => arr.length % 2 === 1), // odd length => median is a real element
        deviationPct(),
        (values, maxDeviationPct) => {
          const m = median(values);
          const survivors = rejectOutliers(values, maxDeviationPct);
          return survivors.includes(m);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 3: outlier rejection only ever shrinks the set ──────────────
//
// Why it matters: rejection must be a pure filter — it can drop sources but
// must never fabricate a price that wasn't reported by any oracle. This
// guards against a subtle class of bug where "cleaning" the input set
// accidentally introduces synthetic values.

describe('property: outlier rejection is a subset of its input', () => {
  it('every surviving value was present in the original array, and count never grows', () => {
    fc.assert(
      fc.property(
        fc.array(price(), { minLength: 0, maxLength: 50 }),
        deviationPct(),
        (values, maxDeviationPct) => {
          const survivors = rejectOutliers(values, maxDeviationPct);
          if (survivors.length > values.length) return false;
          return survivors.every((v) => values.includes(v));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 4: staleness fires at exactly the right ledger boundary ─────
//
// Why it matters: an off-by-one in the staleness check is the difference
// between silently serving stale collateral pricing and correctly halting.
// The boundary must be exact: a sample exactly `maxAgeLedgers` old is still
// fresh; one ledger older, it must flip to stale.

describe('property: staleness detection fires at exactly the right ledger boundary', () => {
  it('age === maxAgeLedgers is fresh; age === maxAgeLedgers + 1 is stale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }), // currentLedger
        fc.integer({ min: 1, max: 1_000_000 }), // age (>=1 so age-1 >= 0)
        (currentLedger, age) => {
          const sampleLedger = currentLedger - age;
          const atBoundary = !isStale(currentLedger, sampleLedger, age);
          const pastBoundary = isStale(currentLedger, sampleLedger, age - 1);
          return atBoundary && pastBoundary;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 5: staleness is monotone in age ──────────────────────────────
//
// Why it matters: for a fixed staleness threshold, an older sample can never
// be considered "fresher" than a younger one. This catches non-monotone
// bugs (e.g. integer overflow/wraparound, sign errors) that a single
// boundary test could miss.

describe('property: staleness is monotone non-decreasing in sample age', () => {
  it('if age1 <= age2 then isStale(age1) implies isStale(age2)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }), // currentLedger
        fc.integer({ min: 0, max: 1_000_000 }), // age1
        fc.integer({ min: 0, max: 1_000_000 }), // age2
        fc.integer({ min: 0, max: 1_000_000 }), // maxAgeLedgers
        (currentLedger, ageA, ageB, maxAgeLedgers) => {
          const age1 = Math.min(ageA, ageB);
          const age2 = Math.max(ageA, ageB);
          const stale1 = isStale(currentLedger, currentLedger - age1, maxAgeLedgers);
          const stale2 = isStale(currentLedger, currentLedger - age2, maxAgeLedgers);
          return !stale1 || stale2; // stale1 => stale2
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 6: data-quality validation is monotone in threshold ─────────
//
// Why it matters: this is the core acceptance criterion from the issue —
// "stricter thresholds reject strictly more batches" (equivalently: reject
// no fewer). If a stricter (smaller %) threshold ever accepted a value a
// looser threshold rejected, the whole notion of "strict vs. lenient"
// configuration would be incoherent, and operators tightening thresholds
// for safety could get unpredictable results.

describe('property: quality validation is monotone in the deviation threshold', () => {
  it('a value accepted under a stricter threshold is also accepted under any looser one', () => {
    fc.assert(
      fc.property(
        anyFinite(),
        anyFinite(),
        deviationPct(),
        deviationPct(),
        (value, referenceMedian, pctA, pctB) => {
          const strict = Math.min(pctA, pctB);
          const loose = Math.max(pctA, pctB);
          const acceptedStrict = validateQuality(value, referenceMedian, strict);
          const acceptedLoose = validateQuality(value, referenceMedian, loose);
          return !acceptedStrict || acceptedLoose; // acceptedStrict => acceptedLoose
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 7: the aggregate never uses a sample it flagged as stale ────
//
// Why it matters: this is an integration-level check that the staleness
// filter is actually wired into the pipeline correctly — a sample cannot
// simultaneously be reported as rejected-for-staleness and be counted
// toward the published price.

describe('property: aggregate never counts a stale sample toward the published price', () => {
  it('usedSources and rejectedStale are always disjoint', () => {
    fc.assert(
      fc.property(
        samplesArb({ minLength: 1, maxLength: 15 }),
        ledger(),
        fc.integer({ min: 0, max: 1_000_000 }), // maxAgeLedgers
        deviationPct(),
        fc.integer({ min: 1, max: 5 }), // minSources
        (samples, currentLedger, maxAgeLedgers, maxDeviationPct, minSources) => {
          const result = aggregate(samples, {
            currentLedger,
            maxAgeLedgers,
            maxDeviationPct,
            minSources,
          });
          return result.usedSources.every((s) => !result.rejectedStale.includes(s));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 8: aggregate refuses to publish below the minimum source count ──
//
// Why it matters: this is the "do not update on-chain price" safety
// guarantee — if too few sources survive staleness + outlier filtering,
// the aggregator must return null rather than silently publishing a price
// backed by an under-sampled, potentially unreliable set of sources.

describe('property: aggregate returns null when fewer than minSources survive filtering', () => {
  it('surviving.length < minSources implies price is null and usedSources is empty', () => {
    fc.assert(
      fc.property(
        samplesArb({ minLength: 0, maxLength: 15 }),
        ledger(),
        fc.integer({ min: 0, max: 1_000_000 }),
        deviationPct(),
        fc.integer({ min: 1, max: 20 }),
        (samples, currentLedger, maxAgeLedgers, maxDeviationPct, minSources) => {
          const result = aggregate(samples, {
            currentLedger,
            maxAgeLedgers,
            maxDeviationPct,
            minSources,
          });
          if (result.usedSources.length < minSources) {
            return result.price === null && result.usedSources.length === 0;
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
