# ADR-008: Topic-Based Versioning for On-Chain Event Schemas

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** StellarKraal maintainers

## Context

The backend's event indexer (`src/services/soroban.service.ts`) polls Soroban
RPC and syncs contract events (`LoanCreated`, `LoanRepaid`, `AssetLiquidated`)
into the off-chain database. It identifies an event solely by its first topic
(the event name) and decodes the data payload by field name.

Soroban contracts are upgradeable in place via `update_current_contract_wasm`,
so the event schema **will** change over the protocol's life — new fields on
`LoanCreated`, changed units, renamed fields. Today any such change silently
breaks the indexer (decode failures are caught and logged, and the event is
dropped), corrupting the off-chain mirror with no recovery path other than a
coordinated deploy of contract and backend at the same instant. We need a
versioning strategy before the schema evolves, not after.

## Decision

Version every contract event **explicitly in its topics**: events are emitted
with topics `(event_name: Symbol, schema_version: u32)` followed by any
indexed identifiers (e.g. `loan_id`), with these evolution rules:

- **Additive changes** (new optional data fields) do not bump the version;
  consumers must ignore unknown fields.
- **Breaking changes** (removing/renaming fields, changing types or units)
  bump `schema_version`. During a migration window the contract dual-emits the
  old and new versions, giving indexers a deploy-order-independent upgrade.
- The indexer processes only versions it knows, logs-and-skips **newer**
  versions (alerting that an upgrade is required), and each `(event_name,
  version)` pair has its schema documented in `docs/protocol/event-schema.md`.
- Events already emitted without a version topic are grandfathered as
  version 1.

## Options Considered

### Option A: No versioning; coordinate deploys (status quo)

Keep `(event_name)` topics and require contract and indexer to be upgraded in
lockstep whenever the schema changes.

- Zero on-chain cost and no rules to enforce.
- Deploys become high-risk flag days; historical events become undecodable
  once the indexer moves on, breaking re-indexing from an old start ledger —
  unacceptable for financial records.

### Option B: Version as a topic (chosen)

`(event_name, schema_version)` topics as described above.

- The version is visible without decoding the payload, and Soroban RPC topic
  filters can select exactly the versions an indexer understands. Old and new
  versions coexist during migrations.
- Costs one extra topic per event and requires discipline about what counts as
  a breaking change.

### Option C: Version field inside the data payload

Embed `{ "schema_version": 2, ... }` in the event data map.

- No extra topic; version travels with the data.
- The consumer must successfully decode the payload *before* learning which
  schema to decode it with — exactly backwards. Not filterable server-side, so
  every indexer downloads and inspects events it will discard.

### Option D: Version mangled into the event name (`LoanCreated_v2`)

- Trivially simple; works with the existing `topic[0]` dispatch.
- Explodes the event namespace, breaks any consumer filtering on the stable
  name `LoanCreated`, and turns the version into string parsing instead of a
  typed value. Contract-side `Symbol` length limits make long names fragile.

## Rationale

Option B is the only design where a consumer can cheaply and reliably decide
"can I decode this?" before touching the payload, which is the entire job of a
version marker. Topic filtering keeps indexer bandwidth proportional to what
it understands, and dual-emission during migrations removes the lockstep
deploy requirement that makes Option A dangerous. The additive-change rule
keeps version churn low so the common case (adding a field) costs nothing. The
one-topic overhead is a few bytes per event — negligible against the
operational cost of a corrupted off-chain mirror.

## Consequences

### Positive

- Contract and backend can be upgraded independently: an old indexer keeps
  consuming v1 events during dual-emission, and full re-indexing from genesis
  stays possible because every historical event carries its schema version.
- Unknown-newer-version events are detected and alerted on instead of being
  silently mis-decoded or dropped.

### Negative

- Every event pays the extra topic, and maintainers must correctly classify
  changes as additive vs. breaking — a mistake (e.g. changing units without a
  bump) still corrupts consumers, so schema review becomes part of contract PR
  review.
- Dual-emission windows double event costs for migrated events and add
  temporary contract code that must later be removed.

## Open Questions

- How long should a dual-emission window last — fixed ledger count, fixed
  calendar time, or until all known indexers confirm the upgrade?
- Should `docs/protocol/event-schema.md` be generated from contract source
  (guaranteeing accuracy) rather than hand-maintained, and should the indexer's
  decoders be generated from the same definition?
- Do we need a schema registry richer than markdown (e.g. XDR/JSON type
  definitions per version) for third-party indexers?
- Should the indexer persist unknown-version events raw for later replay,
  instead of skipping them?

## References

- `src/services/soroban.service.ts` — `processEvent` topic dispatch and payload decoding
- `docs/issues/02-smart-contract-security-cont.md` (Issue 9) — event emission audit and `(contract_name, event_type, version)` schema work item
- `docs/issues/01-smart-contract-security.md` (contract upgrade safety) — why in-place upgrades make schema drift inevitable
