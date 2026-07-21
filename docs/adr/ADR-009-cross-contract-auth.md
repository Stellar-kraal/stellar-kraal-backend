# ADR-009: Native `require_auth` with Stored Role Addresses for Cross-Contract Authorization

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** StellarKraal maintainers

## Context

The protocol is evolving from a single Soroban contract into cooperating
contracts (loan lifecycle, collateral registry, price oracle), which raises
the question every multi-contract Soroban system must answer: **when contract
A calls contract B, on whose authority does B act, and how does B check it?**

Privileged operations today include oracle writes (`mint_collateral`, price
updates — currently submitted by the backend's single server key, see
`src/services/soroban.service.ts`), admin functions (pausing, parameter
changes), and borrower actions (loan creation, repayment). Soroban's native
model is address-based: `Address::require_auth()` verifies that the address —
a user account *or a contract* — authorized this invocation within the
transaction's signed authorization tree, and auth does not implicitly flow
through cross-contract calls.

## Decision

Use **Soroban's native `require_auth` for every privileged entry point,
checked against role addresses stored in each contract's instance storage** —
no custom signature schemes and no central auth contract.

Concretely:

- Each contract stores the addresses allowed to act in each role (`admin`,
  `oracle_updater`, the addresses of peer protocol contracts) in instance
  storage, set at initialization and changeable only by `admin`.
- Every privileged entry point loads the role address and calls
  `require_auth()` on it. Borrower-facing entry points call
  `require_auth()` on the borrower address passed in.
- For cross-contract calls, the *calling contract's address* is the
  authorized party: when the loan contract calls the registry to lock
  collateral, the registry checks that the caller is the stored loan-contract
  address (via `require_auth` on that address, which a contract satisfies for
  its own calls). Authority is therefore explicit per hop — a contract never
  silently inherits the end user's authority.
- User authority never propagates implicitly; where a downstream contract
  must act on a user's behalf, the user signs that sub-invocation in their
  authorization tree, making the full call path visible in the signed payload.

## Options Considered

### Option A: Monolithic single contract

Keep everything in one contract so no cross-contract authorization exists.

- Simplest auth story; the status quo works this way.
- Couples oracle, registry, and lifecycle upgrades together, bloats a single
  WASM toward size limits, and merely postpones this decision — the oracle
  split is already planned. Not a durable answer.

### Option B: Native `require_auth` + stored role addresses (chosen)

Described above.

- Uses the primitive the platform ships, audits, and documents; the signed
  authorization tree makes every authority grant explicit and inspectable in
  the transaction itself.
- Role wiring is per-contract state that must be initialized and kept correct.

### Option C: Central authorization contract (RBAC hub)

A dedicated `auth` contract stores all roles; every contract calls into it to
ask "may X do Y?".

- Single place to grant/revoke roles and audit the role table.
- Every privileged call pays an extra cross-contract hop; the hub is a single
  point of failure and its own upgrade/compromise risk; and it recreates in
  custom code what `require_auth` already provides for our small, mostly
  static role set (two or three contracts, one admin, a handful of updaters).

### Option D: Custom signed-payload authorization

Entry points accept an ed25519 signature over (function, args, nonce) verified
in contract code, analogous to EIP-712-style meta-transactions.

- Maximum flexibility (off-chain grants, delegation, gasless flows).
- Reimplements — badly — what the Soroban host already does: we would own
  nonce/replay tracking, domain separation, and signature verification bugs.
  This class of custom scheme is where auth vulnerabilities concentrate.

## Rationale

Option B wins because it has the smallest amount of security-critical code we
own. `require_auth` gives replay protection (per-address nonces), domain
separation (network passphrase and contract binding), and multi-party auth
trees for free, all enforced by the host rather than by our contract code.
Our role set is small and changes rarely, so a central RBAC hub (Option C)
adds a hop and a failure point without adding expressiveness we need, and
Option D adds exactly the attack surface audits warn about. Explicit per-hop
authority (never inheriting the invoker's auth) is deliberately conservative:
it means a compromised peer contract can only do what its own address was
granted, not everything its callers could do.

## Consequences

### Positive

- Minimal bespoke auth code: replay protection, signature verification, and
  auth-tree semantics are the host's responsibility, and every authority grant
  is visible in the signed transaction for auditing.
- Compartmentalized blast radius: each role address is scoped per contract, so
  compromising one key or contract does not confer another contract's rights.

### Negative

- Authority centralization at the operational layer remains: one backend
  server key is currently `oracle_updater` and one admin key controls role
  changes — the contracts are only as safe as those two keys.
- Role wiring is distributed state: initialization order matters, and pointing
  a stored role at the wrong address (or forgetting to update it after
  redeploying a peer contract) silently breaks or misroutes authority; every
  privileged entry point needs an unauthorized-caller rejection test.

## Open Questions

- When and how do we move `admin` (and ideally `oracle_updater`) to a
  multisig or threshold scheme, and does that change any entry-point design?
- Key rotation runbook: what is the safe sequence for rotating a role address
  across multiple contracts without a window where calls fail?
- Should peer-contract addresses be immutable after initialization (safer,
  but blocks redeployment) or admin-changeable (flexible, but a takeover
  vector)?
- Do we need per-function granularity (e.g. separate `pauser` vs `admin`)
  once the contract set grows, and at what point does that tip the balance
  back toward a central RBAC contract (Option C)?

## References

- `src/services/soroban.service.ts` — backend server key as sole transaction submitter
- `docs/issues/02-smart-contract-security-cont.md` (Issue 8) — access-control matrix and `require_auth` audit work item
- `docs/issues/01-smart-contract-security.md` (Issues 2–3) — cross-contract auth-context propagation and replay/nonce analysis
- [Soroban authorization docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
