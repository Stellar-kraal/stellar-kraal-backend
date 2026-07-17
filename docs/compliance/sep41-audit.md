# SEP-41 Compliance Audit — `carbon_credit`

**Contract:** `contracts/carbon_credit`
**Standard:** [SEP-41 Soroban Token Interface](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md) (v0.4.1)
**SDK reference:** `soroban_sdk::token::TokenInterface` (soroban-sdk 22)
**Audit date:** 2026-07-17
**Status:** **Compliant** (with documented intentional extensions)

## Summary

The pre-audit `carbon_credit` contract was a project-scoped credit ledger. It did **not** implement the SEP-41 Token Interface:

- Missing: `allowance`, `approve`, `transfer_from`, `burn_from`, `decimals`, `name`, `symbol`, and SEP-41-shaped `balance` / `transfer` / `burn`
- Existing `balance_of` / `transfer` / `burn` / `mint` used `project_id` parameters (non-SEP-41 signatures)
- No SEP-41 events were emitted

This audit adds a full SEP-41 fungible layer (balances, allowances, metadata, events) while retaining project-attribution APIs as **intentional extensions**.

Conformance is enforced by `contracts/carbon_credit/tests/sep41_conformance.rs`, invoked via `TokenClient` so entry points match the SDK’s SEP-41 ABI.

## Compliance matrix

| Entry point | Required by SEP-41 | Signature / return type | Events | Status | Notes |
|---|---|---|---|---|---|
| `allowance(from, spender) -> i128` | Yes | Match | — | **Pass** | Expired allowances read as `0` |
| `approve(from, spender, amount, expiration_ledger)` | Yes | Match | `["approve", from, spender]` → `[amount, expiration_ledger]` | **Pass** | `from.require_auth()` |
| `balance(id) -> i128` | Yes | Match | — | **Pass** | Missing balance → `0` |
| `transfer(from, to, amount)` | Yes | Match (`Address` `to` per SDK 22) | `["transfer", from, to]` → `amount` | **Pass** | `from.require_auth()` |
| `transfer_from(spender, from, to, amount)` | Yes | Match | `["transfer", from, to]` → `amount` | **Pass** | Consumes allowance; `spender.require_auth()` |
| `burn(from, amount)` | Yes | Match | `["burn", from]` → `amount` | **Pass** | `from.require_auth()`; reduces global supply |
| `burn_from(spender, from, amount)` | Yes | Match | `["burn", from]` → `amount` | **Pass** | Consumes allowance |
| `decimals() -> u32` | Yes | Match | — | **Pass** | Set at `initialize` |
| `name() -> String` | Yes | Match | — | **Pass** | Set at `initialize` |
| `symbol() -> String` | Yes | Match | — | **Pass** | Set at `initialize` |
| `mint(...)` | **No** (Token Interface) | Domain extension | `["mint", to]` → `amount` | **Pass (event)** | SEP-41 does not require a `mint` function; event emitted per SEP-41 guidance |

### Muxed addresses

SEP-41 v0.4.0+ allows `MuxedAddress` on `transfer`. This deployment targets **soroban-sdk 22**, whose `TokenInterface::transfer` still uses `Address`. Status: **Pass** against the SDK interface in use. Revisit when upgrading to an SDK that exports `MuxedAddress` on `TokenInterface`.

## Intentional deviations / extensions

These are **not** SEP-41 failures; they are domain APIs kept for carbon project attribution:

| Extension | Rationale |
|---|---|
| `balance_of(owner, project_id)` | Per-project balance for registry/marketplace |
| `mint(to, project_id, amount)` | Marketplace-only mint after registry verification; also credits SEP-41 `balance` and emits `mint` |
| `transfer_project(from, to, project_id, amount)` | Project-preserving transfer; also updates SEP-41 balances and emits `transfer` |
| `burn_project(from, project_id, amount)` | Marketplace-authorized project burn; also updates SEP-41 balances and emits `burn` |
| `retire` / `batch_transfer` / `total_supply(project_id)` / `retired_supply` | Carbon lifecycle helpers outside SEP-41 |

**Breaking rename (pre-audit → post-audit):** the old project-scoped `transfer` / `burn` entry points were renamed to `transfer_project` / `burn_project` so the SEP-41 names `transfer` / `burn` can occupy the standard ABI.

## Event verification

| Event | Topics | Data | Verified by |
|---|---|---|---|
| Approve | `approve`, `from`, `spender` | `(amount, expiration_ledger)` | `sep41_approve_and_allowance` |
| Transfer | `transfer`, `from`, `to` | `amount: i128` | `sep41_transfer_moves_balance_and_emits_event` |
| Burn | `burn`, `from` | `amount: i128` | `sep41_burn_reduces_balance_and_emits_event` |
| Mint | `mint`, `to` | `amount: i128` | `sep41_mint_extension_emits_mint_event` |

## Test plan

```bash
cargo test -p carbon_credit
cargo test -p carbon_credit --test sep41_conformance
```

CI workflow: `.github/workflows/contracts-ci.yml` runs the full `carbon_credit` test suite (including SEP-41 conformance) on every PR.

## Residual risks

1. **Dual balance surfaces:** SEP-41 `balance` and project `balance_of` are dual-written on mint / project transfer / project burn / retire. Direct SEP-41 `transfer` / `burn` move fungible balances without adjusting per-project attribution (by design). Integrators that need attribution must use `transfer_project` / `burn_project` / `retire`.
2. **TOCTOU on mint:** Registry status is still read before mint write (pre-existing VULN-CC-01). Out of scope for this SEP-41 audit; tracked separately as a security finding.
