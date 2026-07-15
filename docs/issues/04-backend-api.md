# Backend & API Engineering Issues

## Issue 16: Idempotency Layer for Critical Financial Endpoints (Credit Issuance, Trades, Retirements)

**Work:** Implement an idempotency key system (following Stripe's model) for the credit issuance, trade execution, and retirement endpoints in the NestJS backend. Clients supply an `Idempotency-Key` header; the backend stores the result of the first successful call and returns the cached result for duplicate requests within a TTL. This must be resilient to partial failures (Stellar transaction submitted but backend crashed before recording).

**Scope:** In scope: idempotency middleware/interceptor for NestJS, SQLite-backed idempotency store with TTL, two-phase commit pattern (record intent → submit → record result), tests for crash-recovery scenarios. Out of scope: distributed idempotency across multiple backend instances (document as a scaling limitation).

**Acceptance Criteria:**
- Duplicate requests with the same idempotency key within TTL return HTTP 200 with the original response body (not re-executed)
- A request that crashed after Stellar submission but before recording is detected and reconciled on retry
- Idempotency store has a background cleanup job for expired keys
- Integration tests simulate network interruption mid-request and assert correct retry behavior
- API documentation updated with `Idempotency-Key` header description and client guidance

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** backend,reliability,financial-safety,help-wanted
**Relevant Files:** `backend/src/marketplace/`, `backend/src/credits/`, `backend/src/common/`

---

## Issue 17: Event-Sourced Audit Trail for All State-Changing Operations

**Work:** Introduce an append-only audit log (event-sourcing style) for all state-changing backend operations: credit registration, issuance, trade execution, retirement, oracle writes, and user actions. Each event record must include actor, action, payload hash, timestamp, and the resulting Stellar transaction hash. The log must be tamper-evident (hash-chained entries) and exportable for compliance purposes.

**Scope:** In scope: audit log schema design, NestJS service integration, hash-chained log entries in SQLite (or a dedicated append-only table), export endpoint (`GET /admin/audit-log`), tests for tamper detection. Out of scope: external SIEM integration, real-time streaming of audit events.

**Acceptance Criteria:**
- Every state-changing API endpoint writes an audit log entry (enforced by integration test that checks log after each endpoint call)
- Log entries are hash-chained: each entry includes the hash of the previous entry
- Tamper-detection utility can verify the integrity of the entire chain and report the first broken link
- Export endpoint supports date-range filtering and returns NDJSON format
- Audit log schema documented in `docs/architecture/audit-log-schema.md`

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** backend,compliance,audit,help-wanted
**Relevant Files:** `backend/src/`, `backend/src/common/audit/`

---

## Issue 18: Zero-Downtime Database Migration Strategy with SQLite to PostgreSQL Migration Path

**Work:** The current SQLite backend works for development but is a scaling bottleneck. Design and implement a migration strategy that: (1) introduces a database abstraction layer (TypeORM or Prisma) decoupling SQL dialect from business logic, (2) provides a tested, reversible migration from SQLite to PostgreSQL, and (3) documents the zero-downtime migration procedure (shadow writes, dual-read, cutover). The implementation must not break existing SQLite functionality.

**Scope:** In scope: ORM abstraction layer introduction, schema migration scripts, SQLite-to-PostgreSQL data migration script, zero-downtime procedure documentation, CI tests against both SQLite and PostgreSQL. Out of scope: deploying PostgreSQL to production, connection pooling, read replicas.

**Acceptance Criteria:**
- All database queries go through the ORM abstraction; no raw SQL strings in business logic
- CI runs the full test suite against both SQLite (default) and PostgreSQL (Docker service)
- SQLite-to-PostgreSQL data migration script is idempotent and tested with representative seed data
- Zero-downtime cutover procedure documented step-by-step in `docs/ops/database-migration.md`
- All existing API integration tests pass unchanged after the abstraction layer is introduced

**Complexity:** Very High
**Estimated Time Frame:** 4+ weeks
**Labels:** backend,infrastructure,database,needs-design-review
**Relevant Files:** `backend/src/`, `backend/db/`

---

## Issue 19: Rate Limiting, DDoS Resilience, and Abuse Prevention for Public API

**Work:** Implement a layered rate-limiting strategy for the NestJS backend: per-IP limits for unauthenticated endpoints, per-user limits for authenticated endpoints, and endpoint-specific limits for expensive operations (oracle queries, bulk credit listings). Add abuse detection for patterns like credential-stuffing (many failed auth attempts from one IP) and bulk-scraping (high-frequency read patterns). All limits must be configurable without code changes.

**Scope:** In scope: NestJS rate-limiting interceptor/guard, per-endpoint configuration, Redis-backed distributed rate limit store (with SQLite fallback for development), abuse-detection logging, tests for limit enforcement. Out of scope: WAF/CDN-layer protection, bot detection.

**Acceptance Criteria:**
- Per-IP and per-user rate limits are enforced; limit headers (`X-RateLimit-*`) are returned on all responses
- Limits are configurable via environment variables (no hardcoded values)
- Credential-stuffing detection: ≥5 failed auth attempts from one IP within 10 minutes triggers a temporary block (duration configurable)
- Rate-limit events are logged in structured format (actor, endpoint, limit hit, timestamp)
- Integration tests assert 429 responses when limits are exceeded

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** backend,security,resilience,help-wanted
**Relevant Files:** `backend/src/`, `backend/src/auth/`, `backend/src/common/`

---

## Issue 20: Stellar Transaction Submission Reliability: Retry, Timeout, and Reconciliation Engine

**Work:** Stellar transaction submission is not guaranteed to succeed on the first attempt (fee bumps, sequence number conflicts, RPC timeouts). Build a reliable transaction submission engine in the NestJS backend that: queues transactions, handles `tx_bad_seq` by re-sequencing, retries on RPC timeout with fee-bump escalation, detects and reconciles transactions that may have been submitted but not confirmed, and exposes a transaction status endpoint.

**Scope:** In scope: transaction queue (SQLite-backed job queue), retry logic with fee-bump escalation, sequence number conflict resolution, reconciliation job that polls Stellar Horizon for pending transactions, `GET /transactions/:id/status` endpoint. Out of scope: replacing the existing Stellar SDK, multi-account transaction routing.

**Acceptance Criteria:**
- Transactions that fail with `tx_bad_seq` are automatically re-sequenced and retried (tested with mock)
- Fee-bump escalation is applied after a configurable number of retry attempts
- Reconciliation job detects transactions submitted but unconfirmed within TTL and updates their status
- `GET /transactions/:id/status` returns current lifecycle state: `queued`, `submitted`, `confirmed`, `failed`
- All retry/reconciliation behavior is observable via structured logs

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** backend,reliability,stellar,help-wanted
**Relevant Files:** `backend/src/stellar/`, `backend/src/transactions/`

---

## Issue 21: Structured Logging, Distributed Tracing, and Observability Pipeline

**Work:** The backend currently lacks consistent structured logging and has no distributed tracing across the NestJS API, oracle bridge, and Stellar transaction submission path. Implement OpenTelemetry-based tracing with trace context propagation across all three components, structured JSON logging with correlation IDs, and a local Jaeger or OTLP-compatible collector setup for development.

**Scope:** In scope: OpenTelemetry SDK integration in NestJS and Python oracle bridge, trace context propagation via HTTP headers, structured JSON log format with `traceId`/`spanId` fields, Docker Compose local collector setup. Out of scope: production observability platform selection, frontend tracing, log aggregation pipelines.

**Acceptance Criteria:**
- Every inbound HTTP request generates a trace spanning NestJS → Stellar submission; trace ID is returned in response header
- Oracle bridge Python process emits spans for GEE fetch, aggregation, and on-chain submission
- All logs are structured JSON with at minimum: `timestamp`, `level`, `service`, `traceId`, `spanId`, `message`
- `docker compose up` includes a Jaeger UI accessible at `http://localhost:16686` showing full request traces
- `docs/ops/observability.md` documents how to configure export to a production OTLP endpoint

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** backend,infrastructure,observability,help-wanted
**Relevant Files:** `backend/src/`, `oracle-bridge/`, `docker-compose.yml`

---

## Issue 22: Bulk Credit Retirement API with Atomic Batching and Partial-Failure Handling

**Work:** Institutional buyers need to retire large quantities of carbon credits in a single operation. Implement a bulk retirement endpoint that accepts a list of credit IDs and quantities, constructs optimally batched Soroban invocations (respecting transaction size limits), and handles partial failures atomically — either all retire or none do, with a detailed per-credit result payload. Integrate with the idempotency layer.

**Scope:** In scope: `POST /retirements/bulk` endpoint, Soroban transaction batching logic, atomic failure handling, per-credit result payload in response, idempotency key support, rate limiting for bulk endpoints. Out of scope: cross-account batch retirements, frontend bulk-retirement UI (separate issue).

**Acceptance Criteria:**
- Endpoint accepts up to a configurable maximum number of credits per batch (default 100); larger batches return 422 with guidance
- If any credit in a batch fails validation pre-submission, the entire request is rejected before any Stellar transaction is submitted
- On-chain transaction batching respects Soroban operation size limits; oversized batches are automatically split into sequential sub-transactions
- Response body enumerates per-credit outcome: `retired`, `failed`, `skipped` with reason
- Integration test exercises a 50-credit batch including one invalid credit and asserts correct partial-validation rejection behavior

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** backend,api,financial-safety,help-wanted
**Relevant Files:** `backend/src/retirements/`, `backend/src/stellar/`
