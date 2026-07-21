# Architecture Decision Records

Architecture Decision Records (ADRs) capture significant design decisions, the
alternatives that were considered, and the consequences of the choice.

To add a new ADR: copy [template.md](template.md), take the next available
number, fill in every section, and add a row to the index below and to the ADR
table in the repository [README](../../README.md).

## Index

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Use Soroban for On-Chain Loan Lifecycle Management | Accepted |
| ADR-002 | JWT-Based Authentication Strategy | Accepted |
| ADR-003 | SQLite as the Off-Chain Database | Accepted |
| ADR-004 | Next.js 14 + Tailwind CSS for the Frontend | Accepted |
| ADR-005 | Off-chain collateral appraisal model | Accepted |
| ADR-006 | Multi-oracle median aggregation for price feeds | Accepted |
| [ADR-007](ADR-007-oracle-aggregation-provenance.md) | Off-chain median aggregation with hash-committed provenance for the appraisal oracle | Accepted |
| [ADR-008](ADR-008-event-schema-versioning.md) | Topic-based versioning for on-chain event schemas | Accepted |
| [ADR-009](ADR-009-cross-contract-auth.md) | Native `require_auth` with stored role addresses for cross-contract authorization | Accepted |

> **Note:** ADR-001 through ADR-006 predate this directory and have not yet
> been backfilled as files; their decisions are summarized in the repository
> README and referenced from code comments (e.g.
> `src/services/appraisal.service.ts` for ADR-005/006).
