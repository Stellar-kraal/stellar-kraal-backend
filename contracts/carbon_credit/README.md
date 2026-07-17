# carbon_credit

SEP-41 compliant fungible carbon credit token for StellarKraal.

## SEP-41 compliance status

**Compliant** with the [SEP-41 Soroban Token Interface](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md).

| Entry point | Status |
|---|---|
| `allowance` | Pass |
| `approve` | Pass |
| `balance` | Pass |
| `transfer` | Pass |
| `transfer_from` | Pass |
| `burn` | Pass |
| `burn_from` | Pass |
| `decimals` | Pass |
| `name` | Pass |
| `symbol` | Pass |

Required events (`approve`, `transfer`, `burn`) are emitted in the SEP-41 format. The domain `mint` entry point emits the recommended SEP-41 `mint` event (mint itself is not part of the Token Interface).

Project-scoped helpers (`balance_of`, `mint`, `transfer_project`, `burn_project`, `retire`, `batch_transfer`) are intentional extensions for registry/marketplace attribution and are documented in [`docs/compliance/sep41-audit.md`](../../docs/compliance/sep41-audit.md).

## Build & test

```bash
# from repository root
cargo test -p carbon_credit
```

SEP-41 conformance suite:

```bash
cargo test -p carbon_credit --test sep41_conformance
```
