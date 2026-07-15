# Smart Contract Security & Correctness Issues

## Issue 1: Implement Fuzz Testing Harness for `carbon_credit` Mint/Burn Invariants

**Work:** Build a property-based fuzz testing harness using `cargo-fuzz` (or `proptest`) targeting the `carbon_credit` contract's mint, burn, and transfer entry points. The harness must generate adversarial input sequences that attempt to violate core invariants: total supply consistency, double-burn prevention, and unauthorized minting. Cover both individual-call fuzzing and stateful multi-step sequences.

**Scope:** In scope: fuzz targets for `mint`, `burn`, `transfer`, `approve`, and balance-query functions; CI integration that runs fuzz tests for a time-bounded duration on every PR; documented invariant list. Out of scope: formal verification (separate issue), fuzzing of cross-contract calls.

**Acceptance Criteria:**
- At minimum 5 documented invariants with corresponding fuzz targets
- CI workflow runs fuzz targets for ≥60 seconds per target on PR merge to `main`
- Any invariant violation produces a reproducible failing seed stored in `fuzz/corpus/`
- `README.md` in `fuzz/` documents how to run locally and extend targets
- No existing invariants are violated by the initial corpus run

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,security,testing,help-wanted
**Relevant Files:** `contracts/carbon_credit/src/lib.rs`, new `contracts/carbon_credit/fuzz/`

---

## Issue 2: Cross-Contract Reentrancy and Call-Ordering Audit for `carbon_marketplace`

**Work:** Perform a systematic audit of all cross-contract invocations initiated by `carbon_marketplace` (calls into `carbon_credit`, `carbon_registry`, `carbon_oracle`) and document whether each call site is vulnerable to reentrancy, call-ordering manipulation, or mid-transaction state inconsistency. Soroban's host environment prevents traditional EVM reentrancy, but cross-contract interleaving and auth-context propagation still require analysis. Produce a written finding report and apply any code-level mitigations.

**Scope:** In scope: all `invoke_contract` / `auth::Context` usage in `carbon_marketplace`; documentation of Soroban's reentrancy model and how it applies here; code patches for any confirmed findings. Out of scope: auditing the other three contracts independently, formal verification.

**Acceptance Criteria:**
- Written audit report in `docs/security/marketplace-cross-contract-audit.md` with a finding for each call site (safe / risk / mitigated)
- All medium-or-above findings have corresponding code changes with test coverage
- Auth-context propagation is documented for every external call
- Tests demonstrate that a malicious re-entrant callee cannot corrupt marketplace state
- Report reviewed and signed off by at least one maintainer in a PR comment

**Complexity:** Very High
**Estimated Time Frame:** 3–4 weeks
**Labels:** smart-contract,security,needs-design-review,help-wanted
**Relevant Files:** `contracts/carbon_marketplace/src/lib.rs`, `contracts/carbon_credit/src/lib.rs`, `contracts/carbon_registry/src/lib.rs`

---

## Issue 3: Replay Attack Prevention and Nonce Architecture for Marketplace Orders

**Work:** Analyze the current order-placement flow in `carbon_marketplace` for susceptibility to signature replay attacks across network resets, contract upgrades, or contract ID changes. Design and implement a domain-separated nonce or order-ID scheme (analogous to EIP-712 but adapted for Soroban's XDR-native auth model) that makes each signed order cryptographically bound to the contract, network passphrase, and ledger sequence range.

**Scope:** In scope: nonce/order-ID design, implementation in `carbon_marketplace`, client-side signing changes in the backend's Stellar SDK integration, and comprehensive tests. Out of scope: changes to `carbon_credit` issuance flow, frontend signing UX (separate issue).

**Acceptance Criteria:**
- A signed order cannot be replayed on a different network (testnet vs. mainnet passphrase separation verified by test)
- Orders include an explicit expiry ledger sequence; expired orders are rejected with a typed error
- Nonce/order-ID scheme documented in `docs/protocol/order-signing.md`
- Integration tests simulate replay scenarios and assert rejection
- No breaking changes to the existing REST API contract; backward-compatible migration path documented

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,security,protocol,help-wanted
**Relevant Files:** `contracts/carbon_marketplace/src/lib.rs`, `backend/src/marketplace/`, `docs/protocol/`

---

## Issue 4: Formal Invariant Specification for `carbon_registry` Using Predicate-Based Contracts

**Work:** Write a machine-checkable formal specification of `carbon_registry`'s core invariants using a documented predicate format compatible with Rust's `#[cfg(test)]` model. Invariants must cover: credit registry uniqueness (no two credits share a project ID + vintage + serial), lifecycle state-machine legality (only valid transitions are allowed), and admin-role integrity (registry admin cannot be set to zero address). Integrate specification checks into the test suite.

**Scope:** In scope: invariant authoring, integration with `cargo test`, documentation of the chosen specification approach and its limitations in the Soroban context, mapping each invariant to a concrete test. Out of scope: full end-to-end formal verification with an SMT solver (document as future work), other contracts.

**Acceptance Criteria:**
- At least 8 formally stated invariants with prose and predicate representation
- Each invariant has a corresponding test that falsifies when the invariant is violated (negative test)
- CI runs all invariant tests; no invariant is falsified on `main`
- `docs/security/carbon-registry-invariants.md` explains the invariant set and the verification gap
- A maintainer confirms the invariant set is complete relative to the contract's documented behavior prior to closure

**Complexity:** Very High
**Estimated Time Frame:** 3–4 weeks
**Labels:** smart-contract,security,formal-verification,needs-design-review
**Relevant Files:** `contracts/carbon_registry/src/lib.rs`, `docs/security/`

---

## Issue 5: Upgrade Safety Analysis and Migration Test Suite for All Four Contracts

**Work:** Soroban contracts are upgradeable via `update_current_contract_wasm`. Implement a structured upgrade-safety test suite that deploys a "v1" version of each contract, seeds state, upgrades to a "v2" stub (with additive storage changes), and asserts that all pre-upgrade state is readable and all invariants still hold. Document the upgrade checklist and any storage layout constraints.

**Scope:** In scope: upgrade test harness covering all four contracts, storage-layout compatibility documentation, a developer checklist for safe upgrades (what can/cannot be changed between versions). Out of scope: actual feature changes in v2 stubs, migration of the backend to call new entry points.

**Acceptance Criteria:**
- Test harness in `contracts/tests/upgrade_safety/` covering all four contracts
- Each test verifies that pre-upgrade ledger entries are accessible after upgrade
- The checklist in `docs/protocol/upgrade-checklist.md` lists ≥6 concrete constraints (e.g., storage key stability, entry-point ABI compatibility)
- CI runs upgrade tests as a required check
- At least one negative test demonstrates a deliberately broken upgrade (storage key rename) and shows the failure mode

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,security,infrastructure,help-wanted
**Relevant Files:** `contracts/carbon_registry/`, `contracts/carbon_credit/`, `contracts/carbon_marketplace/`, `contracts/carbon_oracle/`
