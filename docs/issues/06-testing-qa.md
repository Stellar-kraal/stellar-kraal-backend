# Testing & QA Infrastructure Issues

## Issue 29: End-to-End Test Suite for Full Carbon Credit Lifecycle Using Soroban Testnet

**Work:** Build a full end-to-end test suite that exercises the complete credit lifecycle: project registration → credit issuance → marketplace listing → purchase → retirement, running against a live Soroban testnet with funded test accounts. Tests must be deterministic, isolated (each test run deploys fresh contracts), and executable in CI without manual setup.

**Scope:** In scope: E2E test framework (Playwright for frontend + direct Soroban SDK calls for contract verification), test account management (funded via Friendbot), fresh contract deployment per test run, assertions at both API and on-chain levels. Out of scope: performance testing (separate issue), mainnet E2E tests.

**Acceptance Criteria:**
- Full lifecycle test passes end-to-end in CI against Soroban testnet in under 10 minutes
- Each test run deploys fresh contract instances; tests do not share state
- Assertions verify both backend API responses and on-chain state via Horizon queries
- Failed tests produce a structured report with the failing step, API response, and Horizon transaction link
- CI workflow documented in `docs/testing/e2e-setup.md` with instructions for running locally

**Complexity:** Very High
**Estimated Time Frame:** 3–4 weeks
**Labels:** testing,e2e,infrastructure,help-wanted
**Relevant Files:** `tests/e2e/`, `contracts/`, `backend/src/`, `frontend/src/`

---

## Issue 30: Adversarial / Red-Team Test Scenarios for `carbon_marketplace` Contract

**Work:** Design and implement a red-team test suite for `carbon_marketplace` that attempts to exploit it from the perspective of a malicious actor: submitting crafted XDR to bypass validation, impersonating a credit issuer, manipulating oracle price reads between transaction submission and execution, and griefing order books. Document each attack scenario, its feasibility in Soroban's execution model, and the test outcome.

**Scope:** In scope: red-team test suite in `contracts/tests/red_team/`, documentation of each attack vector and its Soroban-specific feasibility analysis, tests asserting the contract is not vulnerable (or documenting accepted risks). Out of scope: off-chain attack vectors against the backend, social-engineering attacks.

**Acceptance Criteria:**
- ≥8 distinct adversarial scenarios are documented and tested
- Each scenario has a test that either demonstrates the attack is impossible (with explanation) or demonstrates a confirmed vulnerability that triggers a follow-up security issue
- Test documentation in `docs/security/marketplace-red-team.md` includes per-scenario feasibility analysis
- All tests are deterministic and run in CI via `cargo test`
- Any confirmed vulnerability creates a linked GitHub issue before this issue is closed

**Complexity:** Very High
**Estimated Time Frame:** 3–4 weeks
**Labels:** testing,security,smart-contract,needs-design-review
**Relevant Files:** `contracts/carbon_marketplace/src/`, `docs/security/`

---

## Issue 31: Load Testing Suite for Bulk Marketplace Operations and API Throughput Benchmarking

**Work:** Build a load testing suite (using k6 or Locust) that benchmarks the backend API under realistic marketplace load: concurrent credit listings queries, bulk purchase submissions, simultaneous retirement requests, and oracle price update ingestion. Identify throughput ceilings, database contention points, and Stellar submission queue saturation. Produce a baseline performance report.

**Scope:** In scope: k6 or Locust scripts for ≥5 scenarios, test data generation tooling, baseline performance report, identification of top 3 bottlenecks with root-cause analysis, CI step that runs a smoke-level load test (low VU count) on PRs. Out of scope: performance fixes themselves (create follow-up issues), load testing the Soroban network directly.

**Acceptance Criteria:**
- Load test suite covers ≥5 distinct scenarios with configurable virtual user counts
- Baseline report in `docs/testing/load-test-baseline.md` documents throughput, p50/p95/p99 latencies, and error rates at 10/50/100 concurrent users
- Top 3 bottlenecks identified with supporting evidence (profiling, query analysis, queue depth metrics)
- CI smoke load test (10 VUs, 30 seconds) passes as a required check and fails if p95 latency exceeds a documented threshold
- Load test scripts are parameterized (base URL, credentials) and documented for local execution

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** testing,performance,infrastructure,help-wanted
**Relevant Files:** `backend/src/`, `tests/load/`

---

## Issue 32: Property-Based Testing for Oracle Aggregation and Price Feed Logic

**Work:** Apply property-based testing (using Hypothesis for Python) to the oracle bridge's aggregation, outlier-rejection, and validation logic. Define properties that must hold for all valid inputs: median is always within the range of inputs, outlier rejection never removes the median itself, staleness detection fires at exactly the right ledger boundary, data-quality validation is monotone (stricter thresholds reject strictly more batches).

**Scope:** In scope: Hypothesis-based test suite in `oracle-bridge/tests/`, property definitions for ≥6 distinct properties, CI integration, documentation of each property and why it is meaningful for correctness. Out of scope: fuzzing the GEE API client, property testing the Soroban contracts (separate Rust issue).

**Acceptance Criteria:**
- ≥6 distinct properties are defined and tested with Hypothesis
- Each property has a prose description of what it proves and its relevance to oracle correctness
- CI runs property tests with a configurable example count (default ≥500 examples per property)
- Any property violation produces a minimal failing example and a clear error message
- `oracle-bridge/tests/README.md` explains how to run property tests and how to add new properties

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** testing,oracle,off-chain,help-wanted
**Relevant Files:** `oracle-bridge/`, `oracle-bridge/tests/`

---

## Issue 33: Mutation Testing for Smart Contract Test Suite Coverage Quality Assessment

**Work:** Apply mutation testing to the Soroban contract test suites to assess whether tests actually catch bugs rather than merely execute code. Use `cargo-mutants` on all four contracts. Generate a mutation score report, identify under-tested areas, and add targeted tests to kill surviving mutants in security-critical paths (authorization checks, arithmetic, state transitions).

**Scope:** In scope: `cargo-mutants` integration for all four contracts, mutation score baseline report, targeted new tests to improve mutation scores in security-critical paths, CI integration for mutation testing on `main` merges. Out of scope: achieving 100% mutation score, mutating test code itself.

**Acceptance Criteria:**
- Initial mutation score baseline documented per contract in `docs/testing/mutation-scores.md`
- Security-critical paths (auth checks, arithmetic, state transitions) achieve ≥80% mutation score after targeted test additions
- CI runs mutation testing on merge to `main` and posts a score summary as a commit status
- Any new surviving mutant in a security-critical path blocks the merge (configurable path list)
- `docs/testing/mutation-scores.md` explains how to interpret mutation scores and how to add new kill targets

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** testing,smart-contract,security,help-wanted
**Relevant Files:** All four contract crates under `contracts/`, `.github/workflows/`

---

## Issue 34: Chaos Engineering Suite for Oracle Bridge and Backend Resilience Validation

**Work:** Implement a chaos engineering suite (using Toxiproxy or equivalent) that injects failures into the oracle bridge and backend: GEE API timeouts, Stellar RPC intermittent failures, database lock contention, and partial oracle data corruption. Validate that the system degrades gracefully (circuit breakers fire, retries work, no data corruption, alerts are triggered) rather than silently failing or corrupting state.

**Scope:** In scope: Toxiproxy-based failure injection in Docker Compose test environment, ≥6 failure scenarios, assertions on system behavior during each failure, recovery assertions after fault removal. Out of scope: chaos testing the Soroban network itself, production chaos experiments.

**Acceptance Criteria:**
- ≥6 distinct failure scenarios are automated and repeatable
- Each scenario has documented expected behavior (graceful degradation) and an assertion that validates it
- No scenario results in silent data corruption (oracle writing incorrect values, database inconsistency)
- Recovery assertions confirm system returns to healthy state within a documented time bound after fault removal
- `docs/testing/chaos-scenarios.md` documents each scenario, the fault injected, expected behavior, and observed behavior

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** testing,resilience,infrastructure,help-wanted
**Relevant Files:** `oracle-bridge/`, `backend/src/`, `docker-compose.yml`
