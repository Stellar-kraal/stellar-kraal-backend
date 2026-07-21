# ADR-007: Off-Chain Median Aggregation with Hash-Committed Provenance for the Appraisal Oracle

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** StellarKraal maintainers

## Context

Livestock appraisals are the root of trust for the whole protocol: the value the
oracle bridge submits via `mint_collateral` determines how much a farmer can
borrow and when a loan becomes liquidatable. Two questions were unresolved:

1. **Aggregation** — how do we turn several imperfect price sources (regional
   livestock exchanges, government price APIs, our internal price table) into a
   single value that one bad or manipulated source cannot skew?
2. **Provenance** — once a value is on-chain, how can anyone verify which
   source data produced it? Today the inputs exist only in backend logs, so a
   compromised or buggy bridge could submit arbitrary values undetectably.

Constraints: livestock prices for our target markets have no existing on-chain
feed, source APIs are regional and intermittently available, and the bridge is
currently a single backend process holding one Stellar key
(`src/services/soroban.service.ts`).

## Decision

Aggregate prices **off-chain in the oracle bridge using the median** of all
responding adapters, and give every on-chain submission **cryptographic
provenance** by committing a hash of the source data batch alongside the value.

Concretely:

- Each price source is an `OracleAdapter` (`src/services/appraisal.service.ts`).
  Adapters that fail or return `null` are excluded; the median of the remainder
  is used. If every adapter fails, the bridge falls back to the internal price
  table and flags the appraisal with a reduced confidence score.
- Each submission includes the SHA-256 hash of the canonicalized raw source
  responses (the "batch"), signed by a **dedicated provenance signing key that
  is separate from the bridge's Stellar submission key**, so compromising the
  transaction key alone cannot forge provenance. Raw batches are archived
  off-chain so any third party can re-derive and check the committed hash.

## Options Considered

### Option A: Single trusted feed, no provenance (status quo before ADR-006)

The bridge reads one source and submits its price directly.

- Simplest possible pipeline; no aggregation logic to test.
- A single API outage halts appraisals; a single compromised source (or the
  bridge itself) silently corrupts every collateral valuation.

### Option B: Off-chain median aggregation with hash-committed provenance (chosen)

Described above.

- Manipulating the reported price requires corrupting a majority of sources,
  and every submission is auditable after the fact.
- The bridge remains a trusted single writer: aggregation happens where no one
  can observe it, and provenance makes fraud *detectable*, not *impossible*.

### Option C: On-chain multi-oracle aggregation

Multiple independent oracle operators each submit their source price to the
contract; the contract stores per-oracle submissions and computes the median on
read, excluding stale entries.

- Strongest trust model: no single process can set the price, and aggregation
  is verifiable by construction.
- Requires recruiting and funding independent operators we do not yet have,
  N× transaction fees per update, and significant contract work (registration,
  staleness windows, admin gating). Premature at current protocol size.

### Option D: Third-party oracle network (e.g. Reflector, Band)

Delegate the feed to an existing Stellar oracle provider.

- Outsources liveness and aggregation to specialists.
- No provider publishes regional livestock prices — we would still have to
  operate the first-mile data collection ourselves, inheriting all of Option
  B's trust issues plus an integration dependency and fees.

## Rationale

Option B is the only design that materially improves manipulation resistance
and auditability **without** requiring an operator ecosystem that does not
exist yet. The median (rather than a mean) means one outlier source — whether
malicious or broken — cannot move the result at all with three or more sources.
Hash commitment costs a few bytes per submission but converts "trust the
bridge's logs" into "verify against an on-chain commitment", which is the
minimum bar for a lending protocol. Option C remains the intended end state;
Option B is deliberately designed so adapters and the batch-hash format can be
reused by independent operators when we migrate (see Open Questions).

## Consequences

### Positive

- A single corrupted or failed price source cannot skew appraisals, and every
  on-chain value can be independently re-derived from archived source data.
- Key separation limits blast radius: stealing the Stellar submission key does
  not allow forging provenance signatures, and vice versa.

### Negative

- The bridge is still a centralized trusted writer and a liveness single point
  of failure — if the process dies, appraisals and price updates stop, and
  nothing on-chain proves the median was computed honestly.
- Operating burden: raw batches must be durably archived (their loss breaks
  verifiability), and the provenance key adds a second secret to rotate and
  protect.

## Open Questions

- Outlier rejection: should sources deviating more than N% from the median be
  excluded before aggregation, and what is the right N for thin rural markets?
- What is the minimum source quorum below which the bridge should refuse to
  update rather than fall back to the internal table?
- Staleness/liveness: threshold and alerting for a dead bridge (dead-man's
  switch), and whether the contract should reject reads of data older than a
  freshness window.
- Migration trigger to on-chain multi-oracle aggregation (Option C): at what
  TVL or operator count does the added cost become justified?
- Where should raw batches be archived long-term (backend disk vs. object
  storage vs. decentralized storage)?

## References

- `src/services/appraisal.service.ts` — adapter interface, median aggregation, fallback
- `src/services/soroban.service.ts` — `mintCollateral` on-chain submission
- ADR-005 (collateral appraisal model), ADR-006 (multi-oracle median for price feeds)
- `docs/issues/03-oracle-data-integrity.md` — provenance, aggregation, and liveness work items
