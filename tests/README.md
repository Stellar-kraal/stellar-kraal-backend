# Tests

## Property-based tests (oracle aggregation)

`tests/unit/oracle-aggregation.property.test.ts` property-tests the pure
aggregation primitives in [`src/services/oracle-aggregation.ts`](../src/services/oracle-aggregation.ts):
median computation, outlier rejection, ledger-based staleness detection, and
data-quality threshold validation. It's wired into [`appraisal.service.ts`](../src/services/appraisal.service.ts),
the collateral price oracle (ADR-006).

This repo has no Python component, so [Hypothesis](https://hypothesis.readthedocs.io/)
isn't applicable directly. [`fast-check`](https://fast-check.dev/) is used
instead — it's the direct TS/JS equivalent: you describe generators
("arbitraries") for inputs, state a property that must hold for *all*
generated inputs, and on failure it automatically shrinks to a minimal
counterexample.

### Properties covered

| # | Property | Why it matters |
|---|----------|-----------------|
| 1 | `median(values)` is always within `[min(values), max(values)]` | Basic soundness of the aggregation arithmetic the whole pipeline depends on. |
| 2 | Outlier rejection never removes the element equal to the group's own median | The rejection threshold is measured as deviation *from* the median, so the median has zero deviation from itself and can never be rejected — proves the aggregator can't discard the value it's meant to converge on. |
| 3 | Outlier rejection only ever returns a subset of its input | Rejection must be a pure filter; it must never fabricate a price no oracle reported. |
| 4 | Staleness fires at exactly the right ledger boundary | A sample exactly `maxAgeLedgers` old is fresh; one ledger older, it must flip to stale. Off-by-one here is the difference between correctly halting and silently serving stale collateral pricing. |
| 5 | Staleness is monotone non-decreasing in sample age | For a fixed threshold, an older sample can never look fresher than a younger one — catches non-monotone bugs a single boundary case would miss. |
| 6 | Data-quality validation is monotone in the deviation threshold | Core acceptance criterion: a stricter (smaller %) threshold must accept a subset of what a looser threshold accepts — i.e. reject no fewer batches. |
| 7 | The aggregate never counts a stale sample toward the published price | Integration check that the staleness filter is actually wired into `aggregate()`, not just correct in isolation. |
| 8 | The aggregate refuses to publish when fewer than `minSources` survive filtering | Safety guarantee: rather than publish a price backed by an under-sampled set, the aggregator must return `null` (bridge should log + skip the on-chain update). |

### Running

```bash
npm test                                   # all unit tests, including properties (500 examples/property)
npx jest tests/unit/oracle-aggregation.property.test.ts

# Run with more examples locally, e.g. for a pre-release confidence pass:
FC_NUM_RUNS=5000 npx jest tests/unit/oracle-aggregation.property.test.ts
```

`FC_NUM_RUNS` controls how many examples fast-check generates per property
(default `500`, matching the acceptance criteria for this suite). CI can
override it via the `unit-tests.yml` workflow's `property-test-examples`
manual-dispatch input.

On failure, fast-check prints the shrunk (minimal) counterexample and the
seed needed to reproduce it deterministically — no need to hunt through
hundreds of generated cases by hand.

### Adding a new property

1. Add or extend a pure function in `src/services/oracle-aggregation.ts` — property tests target pure, deterministic logic, not the async oracle adapters.
2. In `oracle-aggregation.property.test.ts`, add a `describe`/`it` block:
   - State the invariant as a single boolean-returning predicate inside `fc.property(...)`.
   - Reuse the arbitraries already defined near the top of the file (`price()`, `anyFinite()`, `deviationPct()`, `ledger()`, `samplesArb()`) where possible, rather than redefining generators inline.
   - Write a one-paragraph "why it matters" comment above the block — every property in this suite documents what it proves and why it's meaningful for oracle correctness; a property without that context is hard to justify keeping later.
3. Run it locally with a high `FC_NUM_RUNS` (e.g. `FC_NUM_RUNS=5000`) before committing, to catch rare counterexamples the default run size might miss.
4. If you need to reproduce a specific CI failure locally, pass the seed/path fast-check prints in its failure output: `fc.assert(fc.property(...), { seed, path })`.
