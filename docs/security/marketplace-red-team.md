# `carbon_marketplace` Red-Team Test Scenarios

**Relates to:** Issue #31-adjacent — Adversarial red-team test scenarios for carbon_marketplace contract
**Status:** METHODOLOGY TEMPLATE ONLY — no tests implemented, see [Status](#status)

---

## Status

`contracts/carbon_marketplace/` does not exist in this repository. There is
no `contracts/` directory at all — this checkout is the StellarKraal
backend (livestock-collateral loans; see `README.md` and `src/`), while the
issue this document responds to describes a carbon-credit marketplace
contract (`carbon_marketplace`, `carbon_credit`, `carbon_registry`,
`carbon_oracle`) that isn't part of this product.

Because of that, none of the acceptance criteria requiring actual
`cargo test` coverage can be met right now:

- ❌ Tests in `contracts/tests/red_team/` — no contract to test against
- ❌ "All tests are deterministic and run in CI" — no tests exist
- ❌ "Confirmed vulnerability creates a linked GitHub issue" — nothing has
  been executed against real code, so nothing can be confirmed

What follows is a **scenario catalogue and feasibility-analysis
methodology**: attack categories any Soroban-based marketplace/exchange
contract should be red-teamed against, reasoned about generically from
Soroban's execution model. Treat every "Feasibility" note below as a
hypothesis to re-verify against the actual contract's entry points, auth
checks, and state model once one exists — not as a finding. When a real
`carbon_marketplace` (or equivalent) contract lands, each scenario below
should become an actual `#[test]` in `contracts/tests/red_team/`, and this
document should be rewritten to report real outcomes instead of
hypotheses.

## How to use this once a contract exists

For each scenario:

1. Write a test that actually attempts the attack against the deployed
   test contract (using `soroban_sdk::testutils`), not a test that merely
   asserts the attack "should" fail.
2. Record the outcome: **Blocked** (attack fails, explain the specific
   mechanism that stops it), or **Vulnerable** (attack succeeds — file a
   linked GitHub issue immediately, don't let this document be the only
   record of a live finding).
3. Update the feasibility analysis with what was actually observed, not
   the generic reasoning below.

---

## Scenario catalogue

### 1. Crafted/malformed XDR bypassing client-side validation

**Attack:** Submit a hand-crafted `InvokeHostFunction` operation directly
to the network (bypassing the backend/SDK's normal argument construction
and validation) with argument types, ranges, or structures the backend
would never generate — e.g. negative amounts encoded as unsigned, oversized
strings for asset codes, malformed `Address` XDR, or argument counts that
don't match the contract's declared signature.

**Feasibility (generic):** Soroban enforces the contract's WASM-exported
function signature at the host level — a call with the wrong argument
*count* or fundamentally incompatible XDR *type* is rejected before it
reaches contract code. What client-side validation cannot be assumed to
cover is *semantic* validity within a type: a syntactically valid `i128`
that's negative where the contract expects a "reasonable" amount, or a
valid `Address` that isn't the caller. Any bound the backend enforces
client-side (min/max order size, asset whitelist, etc.) must be re-checked
on-chain or it's not actually enforced against this attack.

**Test status:** Not implemented — no contract to target.

---

### 2. Credit-issuer impersonation

**Attack:** Call an issuer-gated entry point (e.g. list/mint a credit)
while authenticated as an address that is *not* the registered issuer, or
exploit a mismatch between the address the contract believes it
authorized and the address whose authorization was actually checked.

**Feasibility (generic):** Soroban's `require_auth()` / `require_auth_for_args()`
verify that a specific `Address` authorized the *current* invocation (and,
for `_for_args`, specific argument values), enforced by the host — a
contract cannot be tricked into treating an unauthorized address as
authorized purely via crafted XDR. The realistic vulnerability class here
isn't bypassing `require_auth` itself, it's a contract that *forgets* to
call it on a sensitive path, or authorizes the wrong address (e.g. checks
`buyer.require_auth()` but should also verify `issuer == registry.get_issuer(asset)`
before treating the call as issuer-privileged). This is a code-review /
per-entry-point audit target, not something genericizable further without
the actual contract.

**Test status:** Not implemented — no contract to target.

---

### 3. Oracle price manipulation between submission and execution (TOCTOU)

**Attack:** Submit an order referencing a favorable price, then race
contract state so the order executes after the oracle price has moved —
either by delaying inclusion, or by triggering a price update between
submission and execution — extracting value the contract intended to
prevent (a stale-price arbitrage).

**Feasibility (generic):** Soroban transactions execute deterministically
against ledger state as of the ledger they're included in, with no
public pre-confirmation mempool to snipe in the EVM MEV sense — but there
*is* a window between a user signing/submitting a transaction and it being
included, during which on-chain price state can change. Whether this is
exploitable is entirely a function of what the contract does: if it reads
the oracle price *at execution time* with no user-specified bound, a stale
signed order becomes a blank check as the reference price drifts. The
mitigation pattern is a client-specified slippage/price bound (min-out /
max-in analog) checked on-chain at execution, plus an explicit order
expiry ledger sequence. Issue #3's nonce/expiry design and Issue #15's
oracle-freshness window are directly relevant prerequisites for this
scenario's mitigation.

**Test status:** Not implemented — no contract to target.

---

### 4. Order-book griefing via spam/dust orders

**Attack:** Flood the order book with a large number of negligible-size or
zero-fillable orders to degrade matching performance, exhaust contract
storage, or push out legitimate orders (if the book has a bounded size and
evicts on overflow).

**Feasibility (generic):** Soroban charges the submitter for the ledger
storage (rent/TTL) their transaction writes, so pure storage-exhaustion
spam has an economic cost to the attacker proportional to the entries
created — the question is whether that cost is high enough relative to
the damage (e.g. a `min_order_size` or per-order listing fee raises the
attacker's cost; their absence makes griefing cheap). A separate axis is
compute: if order matching iterates the full book on every call, a large
enough book can push a legitimate match into the transaction's CPU
instruction budget, causing it to fail — that's a state-growth-driven
denial-of-service independent of storage rent economics.

**Test status:** Not implemented — no contract to target.

---

### 5. Cross-contract reentrancy / call-ordering exploitation

**Attack:** During a `carbon_marketplace` call that invokes
`carbon_credit` and/or `carbon_registry`, attempt to have one of those
callees re-enter `carbon_marketplace` (or another callee) mid-transaction
to observe or mutate state between the marketplace's own state-transition
steps.

**Feasibility (generic):** Soroban's host does not have EVM-style external
call semantics that hand control to arbitrary attacker-supplied bytecode
mid-call in the same way — a callee is itself a known, deployed contract,
not attacker-controlled bytecode, unless the attacker controls one of the
callees (e.g. a malicious token-like contract registered as an accepted
asset). The actual risk is *state-ordering*, not classic reentrancy: does
`carbon_marketplace` fully commit/finalize its own invariants (balance
debited, order marked filled) *before* making the cross-contract call, or
after? A call sequenced before the marketplace's own state is finalized
can observe a half-updated marketplace. This scenario is effectively a
test-suite instantiation of the audit issue already scoped separately
(cross-contract reentrancy and call-ordering audit) — build the tests
alongside that audit, not independently of it.

**Test status:** Not implemented — no contract to target.

---

### 6. Authorization scope escalation via under-scoped `require_auth`

**Attack:** Obtain a valid authorization for a narrow action (e.g. "approve
transfer of exactly 10 units to address X") and reuse or replay the
underlying authorization entry for a broader or different action than the
signer intended.

**Feasibility (generic):** `require_auth_for_args` binds an authorization
to specific argument values, not just the calling address — a contract
that uses plain `require_auth()` where it should scope to specific
arguments (amount, recipient, asset) is the vulnerable pattern; a contract
that correctly uses `require_auth_for_args` with the exact sensitive
arguments is not. This is directly auditable per entry point once the
contract exists: for every `require_auth*` call, does the bound argument
set include everything a malicious re-user could otherwise vary?

**Test status:** Not implemented — no contract to target.

---

### 7. Arithmetic manipulation in fee/price calculations

**Attack:** Construct order parameters (price, quantity, fee basis points)
designed to trigger integer overflow, underflow, truncation, or
rounding-direction abuse in fee or settlement-amount calculations —
aiming for a free trade, a negative-cost trade, or fee-avoidance via
precision loss accumulated over many small orders.

**Feasibility (generic):** Rust panics on overflow in debug builds and
wraps silently in release builds unless the contract explicitly uses
checked/saturating arithmetic (`checked_mul`, `checked_add`, etc.) —
Soroban contracts are typically built in release mode, so an unguarded
arithmetic op is a real wrap-around risk, not just a debug-time panic.
Separately, rounding direction on fee calculations (round-down on fees
owed *to* the protocol, round-up on fees owed *by* the protocol — never
the reverse) is a correctness property worth an explicit test with
adversarial quantities (1, 3, prime numbers) chosen to maximize rounding
error, not just round numbers.

**Test status:** Not implemented — no contract to target.

---

### 8. Signed-order replay across ledgers or after cancellation

**Attack:** Re-submit a previously valid signed order (or its underlying
authorization entry) after it was already filled, cancelled, or after the
signer intended it to expire, attempting to have it execute again.

**Feasibility (generic):** Soroban's authorization entries include a
signature *expiration ledger* that the host enforces, which bounds naive
indefinite replay — but that only helps if the contract's own order model
also has expiry/cancellation semantics *and* checks them, since the host
only guarantees the authorization was valid for the invocation it was
attached to, not that the invocation is semantically "the same order" the
signer still wants active. A cancelled order needs an explicit
cancelled/filled flag checked before execution, independent of whether the
underlying auth entry has expired — this is directly the nonce/order-ID
architecture scoped in the separate replay-prevention issue.

**Test status:** Not implemented — no contract to target.

---

### 9. Upgrade-boundary race

**Attack:** Submit a transaction timed to interact with `carbon_marketplace`
in the same ledger window as an admin-triggered
`update_current_contract_wasm` call, attempting to land on whichever side
(old logic reading new storage layout, or vice versa) produces an
inconsistent or exploitable state.

**Feasibility (generic):** Ledger execution within Soroban is sequential
and deterministic per ledger close — there's no true concurrent execution
to race within a single ledger, so the realistic exposure window is
*across* the ledger boundary where the upgrade lands: is there a
transaction ordering within that ledger where a user's call executes
after the WASM swap but storage still reflects pre-upgrade layout
assumptions? This is the scenario the separate upgrade-safety test suite
(v1 seed → upgrade → v2 read) is designed to cover structurally; this
red-team framing adds the adversarial angle of "does an attacker gain
anything by deliberately timing a call around a known upgrade," which the
upgrade-safety suite alone doesn't test for.

**Test status:** Not implemented — no contract to target.

---

### 10. Resource-budget exhaustion (compute-bound denial of service)

**Attack:** Craft inputs that force a legitimate, otherwise-valid
operation (e.g. matching against the order book, iterating registry
entries) to exceed Soroban's per-transaction CPU instruction or memory
budget, causing it to fail — denying service to legitimate users without
needing to corrupt any state.

**Feasibility (generic):** Any contract logic with a loop bound that grows
with attacker-controlled state (order count, registry size) rather than a
fixed or caller-chosen bound is a candidate: if matching a market order
requires scanning up to N resting orders and N is unbounded and
attacker-inflatable (see Scenario 4), the attacker doesn't need to corrupt
state to cause harm — inflating N until legitimate calls hit the budget
ceiling is sufficient. The mitigation is bounding iteration (paginated
matching, capped book depth) rather than trying to raise the budget.

**Test status:** Not implemented — no contract to target.

---

## Summary table

| # | Scenario | Category | Test status |
|---|---|---|---|
| 1 | Crafted XDR bypassing validation | Input validation | Not implemented |
| 2 | Credit-issuer impersonation | Authorization | Not implemented |
| 3 | Oracle price TOCTOU | Economic / oracle | Not implemented |
| 4 | Order-book spam/dust griefing | Resource / economic | Not implemented |
| 5 | Cross-contract reentrancy / call ordering | State ordering | Not implemented |
| 6 | Auth scope escalation | Authorization | Not implemented |
| 7 | Arithmetic manipulation in fees | Arithmetic | Not implemented |
| 8 | Signed-order replay | Replay / nonce | Not implemented |
| 9 | Upgrade-boundary race | Upgrade safety | Not implemented |
| 10 | Resource-budget exhaustion | Denial of service | Not implemented |

10 scenarios cataloged, exceeding the ≥8 required by the issue — headroom
for scenarios that turn out inapplicable once weighed against the real
contract's actual design.
