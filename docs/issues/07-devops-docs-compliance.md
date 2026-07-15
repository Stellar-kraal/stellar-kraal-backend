# DevOps & Infrastructure Issues

## Issue 35: Mainnet Deployment Pipeline with Automated Rollback and Blue/Green Contract Strategy

**Work:** Design and implement a production deployment pipeline for the four Soroban contracts and NestJS backend that supports: staged rollout (testnet → staging → mainnet), automated pre-deployment smoke tests, blue/green contract deployment (deploy new version alongside old, migrate traffic, decommission old), and automated rollback triggered by health-check failure. Pipeline must be driven by GitHub Actions with required approvals for mainnet.

**Scope:** In scope: GitHub Actions workflow for mainnet deployment, blue/green contract deployment strategy using Soroban's upgrade mechanism, pre/post deployment smoke tests, automated rollback workflow, required approval gate for mainnet promotions. Out of scope: multi-region deployment, canary traffic splitting at the RPC layer.

**Acceptance Criteria:**
- Deployment pipeline has three stages: testnet, staging, mainnet; each requires passing smoke tests before promotion
- Mainnet promotion requires explicit GitHub Actions manual approval from a maintainer
- Blue/green strategy documented: new contract is deployed and validated before old contract traffic is migrated
- Automated rollback is triggered and tested: a deliberately broken deployment causes rollback within 5 minutes
- Deployment runbook in `docs/ops/deployment.md` covers manual steps for emergencies outside the pipeline

**Complexity:** Very High
**Estimated Time Frame:** 4+ weeks
**Labels:** devops,infrastructure,security,needs-design-review
**Relevant Files:** `.github/workflows/`, `docs/ops/`

---

## Issue 36: On-Chain Anomaly Detection and Alerting System

**Work:** Build a monitoring service that subscribes to Stellar Horizon event streams for the deployed contracts and detects anomalous on-chain activity: abnormally large credit retirements (potential wash-trading), oracle price deviations above threshold, unauthorized entry-point calls resulting in contract errors, and sudden spikes in transaction volume. Alerts fire to a configurable webhook (Slack/PagerDuty).

**Scope:** In scope: Horizon event stream subscriber (Node.js or Python), ≥4 anomaly detection rules with configurable thresholds, webhook alerting, alert deduplication (don't re-alert on the same anomaly within a cooldown window), Docker Compose integration. Out of scope: machine-learning-based anomaly detection, on-chain enforcement of anomaly limits.

**Acceptance Criteria:**
- Monitoring service subscribes to Horizon streams and processes events in real-time (≤10 second lag from on-chain confirmation)
- ≥4 anomaly detection rules implemented with configurable, environment-variable-driven thresholds
- Alerts include context: contract ID, transaction hash, rule triggered, observed vs. threshold value
- Alert deduplication prevents repeat alerts for the same anomaly within a configurable cooldown
- `docs/ops/anomaly-detection.md` documents each rule, its threshold, and the recommended response

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** devops,infrastructure,security,help-wanted
**Relevant Files:** `.github/workflows/`, `monitoring/`, `docs/ops/`

---

## Issue 37: Disaster Recovery Runbook and Automated DR Drill for Oracle Bridge

**Work:** The oracle bridge is a single point of failure for price and monitoring data. Design and implement a disaster recovery strategy: automated state backup for the bridge's signing keys and configuration, a tested recovery procedure from backup, a secondary standby bridge instance that can be promoted in under 15 minutes, and a documented DR drill that is run quarterly. Automate the drill execution where possible.

**Scope:** In scope: backup strategy for bridge state (excluding raw private keys — use a secrets manager reference), standby instance configuration in Docker Compose, automated DR drill script that simulates primary failure and validates standby promotion, runbook documentation. Out of scope: multi-region active-active oracle bridge, on-chain oracle failover.

**Acceptance Criteria:**
- Standby bridge instance configuration is maintained in the repository (parameterized, not hardcoded secrets)
- DR drill script simulates primary failure and promotes standby; full promotion completes in under 15 minutes (measured and documented)
- Runbook in `docs/ops/oracle-bridge-dr.md` covers every manual step required if the automated drill fails
- Backup restoration is tested: restoring from backup produces a functional bridge (tested in CI with mock secrets)
- Quarterly drill reminder is a scheduled GitHub Actions workflow that opens an issue

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** devops,infrastructure,resilience,help-wanted
**Relevant Files:** `oracle-bridge/`, `docs/ops/`, `docker-compose.yml`

---

## Issue 38: CI Gate Design for Soroban Contract Changes: Size, Gas, and ABI Compatibility Checks

**Work:** Contract changes can silently introduce breaking ABI changes, exceed Soroban resource limits, or significantly increase simulation costs. Build a CI gate that: compares WASM binary size against a baseline (fail on >10% increase without explicit override), runs simulation cost benchmarks and fails on regressions, checks for breaking ABI changes (removed or renamed entry points), and generates a contract diff report as a PR comment.

**Scope:** In scope: GitHub Actions CI job for contract changes, WASM size comparison against `main` baseline, simulation cost benchmarking using `stellar-cli`, ABI compatibility check (entry point signature diff), PR comment report. Out of scope: automated gas optimization suggestions, dynamic resource limit profiling on mainnet.

**Acceptance Criteria:**
- CI gate runs on every PR touching `contracts/`
- WASM size regression (>10% increase) blocks merge unless a maintainer adds a bypass label with justification
- Simulation cost benchmark compares against `main` baseline; regressions >15% block merge
- ABI compatibility check catches removed or renamed entry points and blocks merge
- PR comment summarizes: size delta, cost delta, ABI diff, and any blocking findings

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** devops,smart-contract,ci,help-wanted
**Relevant Files:** `.github/workflows/`, `contracts/`

---

## Issue 39: Secrets Management and Rotation Automation for Oracle Bridge and Backend

**Work:** The oracle bridge signing key, JWT secret, and Stellar account keys are currently managed as static environment variables. Implement a secrets management strategy using AWS Secrets Manager or HashiCorp Vault (self-hosted option documented): automated rotation for JWT secrets (with zero-downtime dual-key acceptance window), rotation runbook for oracle signing keys, and CI/CD integration that pulls secrets at deploy time rather than baking them into images.

**Scope:** In scope: secrets manager integration for NestJS backend (JWT secret, DB credentials) and oracle bridge (signing key reference), automated JWT rotation with dual-key acceptance window, rotation runbooks for each secret type, Docker Compose integration for local development using mock secrets. Out of scope: hardware security module (HSM) integration, full PKI infrastructure.

**Acceptance Criteria:**
- No secrets are stored in environment variables in production config or baked into Docker images
- JWT rotation is automated: new key is accepted alongside old key for a configurable overlap window (default 1 hour)
- Rotation runbooks documented in `docs/ops/secrets-rotation.md` for all managed secrets
- CI/CD workflow retrieves secrets from secrets manager at deploy time (demonstrated with mock/test credentials)
- Local development uses clearly labeled mock/dev credentials, never production secrets

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** devops,security,infrastructure,needs-design-review
**Relevant Files:** `oracle-bridge/`, `backend/src/`, `.github/workflows/`, `docs/ops/`

---

# Documentation & Protocol Design Issues

## Issue 40: Formal Protocol Specification for the Carbon Credit Lifecycle

**Work:** Write a comprehensive, implementation-independent protocol specification document covering the full carbon credit lifecycle: project registration, credit issuance, marketplace listing and matching, settlement, retirement, and revocation. The specification must define state machines, preconditions, postconditions, and invariants for each operation in enough detail that an independent team could reimplement the protocol from the document alone.

**Scope:** In scope: state machine diagrams (Mermaid), formal precondition/postcondition tables for each operation, invariant list cross-referenced against the contract implementation, glossary of domain terms, known limitations and design rationale. Out of scope: API reference documentation (separate), implementation code.

**Acceptance Criteria:**
- Document covers all six lifecycle operations with state machine diagrams
- Each operation has a formal precondition/postcondition table with at least 3 conditions each
- All invariants are cross-referenced to the corresponding contract entry point by file and line range
- A glossary defines all domain-specific terms (vintage, serial, retirement, revocation, etc.)
- Document is reviewed by at least two maintainers and any contradictions with the implementation are resolved (implementation corrected or document updated)

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** documentation,protocol,needs-design-review
**Relevant Files:** `docs/protocol/`, all four contract crates

---

## Issue 41: Methodology Alignment Documentation: Gold Standard and Verra VCS Mapping

**Work:** Carbon credits registered on StellarKraal need to align with recognized voluntary carbon market methodologies (Gold Standard, Verra VCS). Document the mapping between StellarKraal's on-chain credit data model and the required fields for Gold Standard and Verra VCS issuance records. Identify any gaps in the current data model and propose schema extensions to close them.

**Scope:** In scope: field-by-field mapping tables for both Gold Standard and Verra VCS, gap analysis, proposed schema extensions to `carbon_registry` to capture missing required fields, documentation of what on-chain data is sufficient for third-party auditor verification. Out of scope: implementing the schema extensions (create follow-up issues), obtaining actual certification.

**Acceptance Criteria:**
- Mapping tables in `docs/compliance/methodology-mapping.md` cover ≥15 fields per standard
- Gap analysis explicitly identifies fields required by each standard that are absent from the current data model
- For each gap, a proposed extension is described (field name, type, rationale)
- Document is reviewed by at least one contributor with domain knowledge of voluntary carbon markets
- Any proposed extensions that are straightforward to implement are tracked as follow-up issues

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** documentation,compliance,protocol,needs-design-review
**Relevant Files:** `docs/compliance/`, `contracts/carbon_registry/src/`

---

## Issue 42: Threat Model Documentation for the Full StellarKraal System

**Work:** Produce a comprehensive threat model for StellarKraal covering all system components: Soroban contracts, NestJS backend, oracle bridge, frontend, and the trust relationships between them. Use the STRIDE framework (or PASTA). Enumerate threat actors, attack surfaces, mitigations in place, residual risks, and recommended future mitigations for each threat.

**Scope:** In scope: STRIDE/PASTA threat model document for all components, trust boundary diagrams, threat actor profiles (external attacker, malicious oracle operator, compromised admin key, malicious marketplace participant), mitigations mapped to existing code. Out of scope: implementing mitigations (create follow-up issues per finding), third-party penetration testing.

**Acceptance Criteria:**
- Threat model document in `docs/security/threat-model.md` covers all 5 system components
- Trust boundary diagram shows data flows and trust levels between components
- At least 3 distinct threat actor profiles are defined with motivation and capability assumptions
- ≥15 distinct threats enumerated with STRIDE category, affected component, existing mitigation, and residual risk rating
- All HIGH residual-risk threats have a corresponding follow-up GitHub issue linked from the document

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** documentation,security,needs-design-review
**Relevant Files:** `docs/security/`, all system components

---

## Issue 43: Architecture Decision Records for Oracle Design, Event Schema, and Cross-Contract Auth

**Work:** Three major architectural decisions currently lack ADRs: the oracle bridge's aggregation and provenance design, the on-chain event schema versioning strategy, and the cross-contract authorization model. Write fully reasoned ADRs for each, following the existing ADR template. Each ADR must document the decision, the options considered, the rationale, the consequences (positive and negative), and the open questions.

**Scope:** In scope: three new ADRs (oracle design, event schema versioning, cross-contract auth model), integration into the existing ADR index in `README.md` and `docs/adr/`. Out of scope: implementing any changes recommended by the ADRs (those become follow-up issues), ADRs for decisions already documented.

**Acceptance Criteria:**
- Three new ADRs created: `ADR-007`, `ADR-008`, `ADR-009` (or next available numbers)
- Each ADR documents ≥2 alternatives considered and the explicit rationale for the chosen approach
- Consequences section covers at least one positive and one negative consequence
- Open questions section lists unresolved design questions for future contributors
- ADR index in `README.md` and `docs/adr/` is updated with all three new entries

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** documentation,protocol,architecture
**Relevant Files:** `docs/adr/`, `README.md`

---

# Compliance & Standards Issues

## Issue 44: SEP-41 Token Standard Compliance Audit for `carbon_credit` Contract

**Work:** Stellar's SEP-41 defines the interface standard for Soroban token contracts. Audit `carbon_credit` for full SEP-41 compliance: check that all required entry points (`balance`, `transfer`, `approve`, `allowance`, `mint`, `burn`, `decimals`, `name`, `symbol`) conform to the specified interfaces, return correct types, and emit the required events. Identify any deviations and implement fixes with regression tests.

**Scope:** In scope: entry-point-by-entry-point SEP-41 compliance check, interface conformance tests for all required functions, fix implementation for any deviations, updated documentation. Out of scope: implementing optional SEP-41 extensions, compatibility with specific wallet or DEX implementations.

**Acceptance Criteria:**
- Compliance matrix in `docs/compliance/sep41-audit.md` covers every required SEP-41 entry point with pass/fail/deviation status
- All deviations are either fixed (with test) or documented as intentional with rationale
- Interface conformance test suite in `contracts/carbon_credit/tests/sep41_conformance.rs` tests every required entry point against the SEP-41 spec
- All conformance tests pass in CI
- `carbon_credit` contract documentation updated to explicitly state its SEP-41 compliance status

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** smart-contract,compliance,audit,help-wanted
**Relevant Files:** `contracts/carbon_credit/src/lib.rs`, `docs/compliance/`

---

## Issue 45: Regulatory Disclosure Data Export Tooling (MiFID II / TCFD Alignment)

**Work:** Institutional participants in carbon markets face regulatory reporting obligations (MiFID II transaction reporting, TCFD climate disclosure). Build a backend export service that produces structured data exports of a user's credit portfolio, trade history, and retirement records in formats compatible with common disclosure frameworks: CSV with standardized column names, JSON-LD with schema.org/GS1 vocabulary where applicable. Exports must be auditable (hash of export included in the audit log).

**Scope:** In scope: `GET /compliance/export` endpoint with format parameter (csv, jsonld), schema documentation for each format, mapping of internal fields to disclosure framework fields, audit log entry on every export, tests for output correctness and completeness. Out of scope: direct regulatory submission, legal compliance review.

**Acceptance Criteria:**
- `GET /compliance/export?format=csv` returns a well-formed CSV with documented column mapping to MiFID II/TCFD fields
- `GET /compliance/export?format=jsonld` returns valid JSON-LD with appropriate vocabulary annotations
- Every export call creates an audit log entry with the requesting user, timestamp, and SHA-256 hash of the exported data
- Export schema documented in `docs/compliance/export-schema.md` with field-by-field mapping rationale
- Integration tests verify export output completeness against a known fixture dataset

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** backend,compliance,api,help-wanted
**Relevant Files:** `backend/src/compliance/`, `docs/compliance/`

---

## Issue 46: KYC/AML Integration Research and Design Specification

**Work:** Carbon credit markets at institutional scale require KYC (Know Your Customer) and AML (Anti-Money Laundering) checks for participants above regulatory thresholds. Research the integration options for KYC/AML providers compatible with a Stellar-based marketplace (e.g., Jumio, Onfido, Chainalysis for on-chain screening), design the integration architecture (where in the flow checks occur, how on-chain addresses are linked to verified identities, data minimization strategy), and produce a design specification document. Do not implement the full integration — produce a specification ready for implementation.

**Scope:** In scope: survey of ≥3 KYC/AML provider options with pros/cons, architecture design for KYC gate (registration flow, on-chain address linking, threshold-based triggering), data minimization and GDPR/privacy considerations, API design for the KYC status endpoint. Out of scope: implementing the integration, legal compliance review, selecting a specific provider.

**Acceptance Criteria:**
- Design specification in `docs/compliance/kyc-aml-design.md` covers provider survey, architecture, and API design
- ≥3 provider options evaluated against criteria: Stellar compatibility, API quality, privacy posture, regulatory coverage
- Architecture diagram shows where KYC checks are enforced in the credit lifecycle (registration, trade execution, bulk retirement)
- Data minimization strategy documented: what PII is stored, where, retention policy
- API design for `GET /users/:id/kyc-status` is fully specified with response schema and error cases

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** compliance,research,needs-design-review
**Relevant Files:** `docs/compliance/`, `backend/src/users/`
