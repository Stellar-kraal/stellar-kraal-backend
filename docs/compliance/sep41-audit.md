# SEP-41 Compliance Audit: carbon_credit

## Summary
The carbon_credit contract implements the full SEP-41 Soroban token interface. This audit covers all required entry points.

## Compliance Matrix

| Entry Point | Interface Signature | Status | Notes |
|---|---|---|---|
| `name` | `() -> String` | PYS | Returns `Carbon Credit` |
| `symbol` | `() -> String` | PSS | Returns `CRBN` |
| `decimals` | `() -> u32` | PSS | Returns `7` |
| `balance` | `(Address) -> i128` | PSS | Standard behavior |
| `transfer` | `(Address, Address, i128) -> Result<(), Error>` | PSS | Standard behavior |
| `transfer_from` | `(Address, Address, Address, i128) -> Result<(), Error>` | PSS | Standard behavior |
| `approve` | `(Address, i128, u32) -> Result<((), Error>` | PSS | Standard behavior |
| `allowance` | `(Address, Address) -> i128` | PSS | Standard behavior |
| `mint` | `(Address, i128) -> Result<(), Error>` | PSS | Admin-only |
| `burn` | `(Address, i128) -> Result<(), Error>` | PSS | Standard behavior |
| `set_admin` | `(Address) -> Result<((), Error>` | PSS | Admin-only |
| `admin` | `() -> Option<Address>` | PSS | Standard behavior |

All required SEP-41 entry points are implemented and tested in `contracts/carbon_credit/tests/sep41_conformance.rs`.