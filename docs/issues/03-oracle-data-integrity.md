# Oracle & Off-Chain Data Integrity Issues

## Issue 10: Satellite Data Verification Pipeline with Cryptographic Provenance

**Work:** The Python oracle bridge currently pulls Google Earth Engine (GEE) data and submits it to `carbon_oracle`. Build a cryptographic provenance layer: each GEE data batch must be hashed (SHA-256 of the raw API response), signed by the oracle bridge's key, and the hash committed on-chain alongside the price/monitoring data. Implement a verification CLI tool that allows anyone to reconstruct and verify the hash from archived raw data.

**Scope:** In scope: hash-and-sign pipeline in the Python bridge, on-chain hash storage in `carbon_oracle`, a verification CLI (`oracle-bridge/verify_provenance.py`), and documentation. Out of scope: decentralized storage of raw data (document as future work), changes to the GEE query logic itself.

**Acceptance Criteria:**
- Every `carbon_oracle` price/monitoring write includes the SHA-256 hash of the source data batch
- The oracle bridge's signing key is separate from its Stellar account key (key separation documented)
- `verify_provenance.py --batch-id <id>` reconstructs and verifies the hash against on-chain commitment
- Integration test submits a known data batch, verifies on-chain hash, and asserts tampering detection
- Documentation in `oracle-bridge/docs/provenance.md` explains the full trust chain

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** oracle,security,off-chain,help-wanted
**Relevant Files:** `oracle-bridge/`, `contracts/carbon_oracle/src/lib.rs`

---

## Issue 11: Multi-Source Price Feed Aggregation with Outlier Rejection for Xpansiv/Toucan Feeds

**Work:** The oracle bridge currently uses a single feed from Xpansiv CBL or Toucan Protocol. Implement a multi-source aggregation layer that ingests both feeds (plus at least one additional configurable source), applies a median aggregation with configurable outlier-rejection (e.g., reject sources deviating >N% from the median), and publishes the aggregated price. Handle source unavailability gracefully with logged fallback behavior.

**Scope:** In scope: multi-source ingestion in the Python bridge, median aggregator with outlier rejection, fallback policy (configurable: halt vs. use remaining sources), unit and integration tests for aggregation logic. Out of scope: on-chain multi-oracle architecture (separate issue), adding more than three sources initially.

**Acceptance Criteria:**
- Aggregator ingests ≥2 sources concurrently; each source has a configurable timeout
- Median-with-outlier-rejection is unit-tested with known input sets including cases where one source is an outlier
- If fewer than a configurable minimum number of sources respond, the bridge logs a warning and does not update on-chain price
- Source health metrics (last success, last error) are exposed via a `/metrics` endpoint (Prometheus format)
- `oracle-bridge/docs/aggregation.md` documents the algorithm, configuration parameters, and fallback behavior

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** oracle,off-chain,resilience,help-wanted
**Relevant Files:** `oracle-bridge/`, `contracts/carbon_oracle/src/lib.rs`

---

## Issue 12: Liveness Guarantee and Dead-Man's-Switch for Oracle Bridge

**Work:** If the oracle bridge process crashes or loses connectivity, `carbon_oracle` will serve stale data indefinitely. Implement a liveness monitoring system: a watchdog process that independently monitors oracle freshness on-chain, alerts via configurable webhook (Slack/PagerDuty) when the oracle hasn't been updated within a threshold, and automatically attempts a bridge restart with exponential backoff. Integrate with the circuit-breaker in `carbon_oracle`.

**Scope:** In scope: watchdog process (`oracle-bridge/watchdog.py`), webhook alerting integration, restart-with-backoff logic, Docker Compose health check integration, runbook documentation. Out of scope: multi-region oracle bridge deployment, on-chain circuit-breaker implementation (separate issue).

**Acceptance Criteria:**
- Watchdog detects oracle staleness within two polling intervals of the actual staleness event
- Alerts fire to at least one configurable webhook within 5 minutes of staleness detection
- Automatic restart attempts use exponential backoff (documented parameters) and give up after a configurable number of attempts before paging
- Docker Compose `healthcheck` for the oracle bridge service passes only when the bridge is within freshness threshold
- Runbook in `docs/ops/oracle-bridge-runbook.md` covers manual recovery steps

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** oracle,infrastructure,resilience,help-wanted
**Relevant Files:** `oracle-bridge/`, `docs/ops/`

---

## Issue 13: Adversarial Price Manipulation Resistance: Economic Attack Simulation

**Work:** Model and simulate economic attacks against the oracle price feed: slow-grinding manipulation (small consistent deviations over time to shift the median), source-collusion attacks (two of three sources controlled by an adversary), and single-submission-window manipulation. For each attack vector, document the attack, quantify the cost/feasibility, and propose or implement a mitigation.

**Scope:** In scope: threat model document, simulation scripts (Python) for each identified attack vector against the current aggregation design, mitigation proposals, and any mitigations implementable within the oracle bridge. Out of scope: implementing mitigations that require contract changes (create follow-up issues).

**Acceptance Criteria:**
- Threat model document in `docs/security/oracle-threat-model.md` covers ≥4 distinct attack vectors
- Each vector has an associated simulation script producing a reproducible output (e.g., price deviation over N rounds)
- Mitigations are assessed as: implemented, recommended (follow-up issue created), or accepted-risk (with rationale)
- TWAP (time-weighted average price) as a mitigation is evaluated and documented with rationale for or against adoption
- Document reviewed and signed off by a maintainer before closure

**Complexity:** Very High
**Estimated Time Frame:** 3–4 weeks
**Labels:** oracle,security,research,needs-design-review
**Relevant Files:** `oracle-bridge/`, `contracts/carbon_oracle/src/lib.rs`, `docs/security/`

---

## Issue 14: Google Earth Engine Data Freshness and Quality Validation Layer

**Work:** GEE imagery and carbon monitoring data has variable quality (cloud cover, sensor gaps, processing latency). Build a data-quality validation layer in the oracle bridge that inspects each GEE batch for: cloud-cover percentage above threshold, missing bands/indices, anomalous NDVI/carbon-flux values (statistical outlier detection), and temporal gaps. Batches failing validation should be rejected, logged, and not submitted to the oracle contract.

**Scope:** In scope: validation module (`oracle-bridge/validation.py`), configurable quality thresholds, rejection logging with structured JSON, unit tests using real GEE response fixtures (anonymized), integration with the main ingestion pipeline. Out of scope: alternative data source fallback when GEE is degraded, changes to GEE query parameters.

**Acceptance Criteria:**
- Validation module checks ≥4 distinct quality dimensions (cloud cover, missing bands, statistical outlier, temporal gap)
- Rejected batches are logged with a structured record including batch ID, rejection reason, and timestamp
- All validation thresholds are configurable via environment variables or config file (no hardcoded values)
- Unit tests cover all validation checks including edge cases (all clouds, no data, extreme outlier)
- Rejection rate is tracked in the `/metrics` endpoint alongside other oracle health metrics

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** oracle,off-chain,data-quality,help-wanted
**Relevant Files:** `oracle-bridge/`

---

## Issue 15: On-Chain Multi-Oracle Median Aggregation Contract

**Work:** Extend `carbon_oracle` from a single-writer model to a permissioned multi-oracle model: multiple registered oracle addresses can submit price/monitoring data, and the contract computes an on-chain median aggregation (or weighted median) over the most recent submission from each oracle within the freshness window. Registering and removing oracles is an admin-gated operation.

**Scope:** In scope: multi-oracle data model in `carbon_oracle`, on-chain median computation over oracle submissions, admin-gated oracle registration, deprecation of single-writer assumption in `carbon_marketplace`, comprehensive tests. Out of scope: oracle reputation/slashing mechanisms, incentive design.

**Acceptance Criteria:**
- `carbon_oracle` stores submissions per oracle address; median is computed on read
- Oracle registration and deregistration are admin-gated with `require_auth`
- Marketplace reads aggregated median, not raw submission; tested end-to-end
- Stale individual oracle submissions (older than `max_age_ledgers`) are excluded from aggregation
- Tests cover: single oracle, two oracles with outlier, all oracles stale, oracle added/removed mid-operation

**Complexity:** Very High
**Estimated Time Frame:** 3–4 weeks
**Labels:** smart-contract,oracle,protocol,needs-design-review
**Relevant Files:** `contracts/carbon_oracle/src/lib.rs`, `contracts/carbon_marketplace/src/lib.rs`
