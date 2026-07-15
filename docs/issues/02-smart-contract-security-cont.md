## Issue 6: Integer Overflow, Precision Loss, and Fixed-Point Arithmetic Audit

**Work:** Audit all arithmetic in the four contracts for integer overflow/underflow (Rust's debug-mode panics vs. release-mode wrapping), precision loss in credit pricing and fractional-credit calculations, and any use of floating-point that should be replaced with scaled integers. Produce mitigations (use of `checked_*` / `saturating_*` methods, explicit scaling constants) with tests for boundary conditions.

**Scope:** In scope: all arithmetic operations across all four contracts; introduction of a shared `math.rs` utility module with audited helpers; boundary-value tests for maximum credit quantities and minimum price ticks. Out of scope: gas/fee arithmetic in the Stellar host environment itself.

**Acceptance Criteria:**
- All arithmetic uses `checked_add`, `checked_mul`, etc., or is proven not to overflow by invariant (with comment)
- No floating-point types used anywhere in contract code
- A `math.rs` shared module is introduced with unit tests for edge cases (u128 max, zero-price, minimum lot size)
- CI lint step (`clippy`) configured to flag `wrapping_*` usage as a warning in contract crates
- Written summary of all findings in `docs/security/arithmetic-audit.md`

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,security,audit,help-wanted
**Relevant Files:** `contracts/carbon_credit/src/`, `contracts/carbon_marketplace/src/`, `contracts/carbon_registry/src/`, `contracts/carbon_oracle/src/`

---

## Issue 7: Role-Based Access Control (RBAC) Consistency Audit Across All Contracts

**Work:** Map every privileged entry point across the four contracts (admin functions, oracle price updates, registry approvals, credit issuance) and verify that authorization checks are applied consistently, non-bypassable, and documented. Identify any missing `require_auth` calls, incorrect authority hierarchies, or admin-key centralization risks. Introduce an access-control matrix document and add tests for unauthorized-caller rejection on every privileged function.

**Scope:** In scope: static analysis of all `require_auth` / `require_auth_for_args` usage, an RBAC matrix document, tests for every privileged entry point called by an unauthorized address. Out of scope: implementing a multi-sig admin scheme (document as a recommendation).

**Acceptance Criteria:**
- RBAC matrix in `docs/security/access-control-matrix.md` enumerates every entry point, its required authority, and whether a test exists
- Every privileged function has a negative test asserting rejection when called by a non-authorized address
- No privileged entry point lacks a `require_auth` or equivalent guard (CI lint rule enforced)
- Any centralization risks (single admin key) are flagged with a `TODO(security)` comment and noted in the matrix
- PR includes a summary of any findings and whether they were mitigated or accepted

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,security,audit,help-wanted
**Relevant Files:** `contracts/carbon_registry/src/`, `contracts/carbon_credit/src/`, `contracts/carbon_marketplace/src/`, `contracts/carbon_oracle/src/`

---

## Issue 8: `carbon_oracle` Price Feed Staleness Protection and Circuit-Breaker Logic

**Work:** The `carbon_oracle` contract currently stores price data written by an off-chain bridge. Implement on-chain staleness detection (reject reads if the price timestamp is older than a configurable `max_age_ledgers`), a circuit-breaker that halts marketplace trades when the oracle is stale, and a multi-sig or threshold-signature requirement for price updates above a configurable deviation threshold.

**Scope:** In scope: staleness check in `carbon_oracle`, circuit-breaker integration in `carbon_marketplace` (halt trades on stale oracle), threshold-deviation guard for large price moves, tests for all three mechanisms. Out of scope: the off-chain oracle bridge itself (separate issue), frontend staleness UI.

**Acceptance Criteria:**
- Reads from `carbon_oracle` after `max_age_ledgers` return a typed `OracleStalenessError`
- `carbon_marketplace` rejects any trade when the oracle is stale; this is tested end-to-end
- Price updates exceeding a configurable deviation percentage require multi-authority sign-off (configurable threshold, default 20%)
- All three mechanisms are configurable via admin-gated contract storage (no hardcoded magic numbers)
- Tests simulate ledger advancement to trigger staleness and assert correct behavior

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,security,oracle,help-wanted
**Relevant Files:** `contracts/carbon_oracle/src/lib.rs`, `contracts/carbon_marketplace/src/lib.rs`

---

## Issue 9: Event Emission Completeness Audit and Standardized Event Schema

**Work:** Audit all four contracts for missing or inconsistent event emissions. Every state-changing operation must emit a structured, versioned event with a stable schema. Define a canonical event schema (using Soroban's `Events` API with typed topics and data) for the full credit lifecycle: registry, issuance, listing, trade, retirement, and oracle update. Implement any missing events and write an event-schema document.

**Scope:** In scope: event audit, schema design and implementation, event schema documentation, tests asserting events are emitted with correct payloads. Out of scope: off-chain event indexing infrastructure, frontend event display.

**Acceptance Criteria:**
- Every state-changing entry point emits at least one event
- Events follow a versioned schema: `(contract_name, event_type, version)` topics + typed data
- Event schema documented in `docs/protocol/event-schema.md` with XDR type definitions
- Tests assert correct event payloads for all major lifecycle operations
- Schema is forward-compatible: adding new fields does not break existing indexers (documented strategy)

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** smart-contract,protocol,help-wanted
**Relevant Files:** `contracts/carbon_registry/src/`, `contracts/carbon_credit/src/`, `contracts/carbon_marketplace/src/`, `contracts/carbon_oracle/src/`, `docs/protocol/`
