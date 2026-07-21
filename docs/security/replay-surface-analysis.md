# Replay Surface Analysis

**Issue:** #58  
**Scope:** `carbon_marketplace` purchase and `carbon_credit` retire operations  
**Date:** 2026-07-18  
**Status:** Mitigations implemented

---

## 1. Overview

This document identifies all replay attack surfaces in the StellarKraal transaction lifecycle, categorises each by mitigation layer, and maps them to the PoC test cases in `tests/unit/replay.test.ts` and `tests/integration/replay-mitigation.test.ts`.

A **replay attack** occurs when a valid, previously-executed transaction (or its authorisation artefact) is re-submitted to obtain a duplicate effect — e.g. retiring the same carbon credit twice, or purchasing the same marketplace listing multiple times.

---

## 2. Protocol-Layer Mitigations (Out of Scope)

The following are handled by the Stellar protocol and are **assumed mitigated** at that layer:

| Mechanism | How it Prevents Replay |
|---|---|
| **Sequence numbers** | Each Stellar account has a monotonically increasing sequence number. A transaction is only valid if its sequence number equals `account_sequence + 1`. Resubmitting the exact same transaction fails because the sequence has already been consumed. |
| **Network passphrase** | Transactions include a network passphrase (`Networks.TESTNET` / `Networks.PUBLIC`). A transaction from testnet cannot be replayed on mainnet. |
| **Transaction expiry (`timeBounds`)** | A transaction with `maxTime` set expires after that ledger close time, preventing delayed replays. |

These are Soroban/Stellar protocol guarantees; the backend does not need to re-enforce them.

---

## 3. Identified Replay Surfaces

### Surface 1 — Application-Level Idempotency Key Bypass

**Risk:** HIGH  
**Location:** `src/middleware/idempotency.ts`, `src/services/idempotency.service.ts`  
**Mitigation Layer:** Application  

**Description:**  
The idempotency middleware checks the `Idempotency-Key` header. If a client omits the header entirely, no idempotency check is performed and the same logical operation can be submitted multiple times, creating duplicate loan requests or duplicate on-chain invocations.

**Mitigation:**  
Enforce the `Idempotency-Key` header as mandatory on all state-mutating endpoints (`POST /api/loans/request`, `POST /api/livestock`, etc.). Return `400 Bad Request` if missing on financial endpoints.

**Test:** `replay.test.ts` → `"Surface 1: missing idempotency key allows duplicate loan request"`

---

### Surface 2 — Processing-State Race (TOCTOU Window)

**Risk:** MEDIUM  
**Location:** `src/middleware/idempotency.ts` lines 29–35  
**Mitigation Layer:** Application  

**Description:**  
The middleware writes a `_processing` sentinel key, then deletes it when the response is sent. If two concurrent requests with the same idempotency key arrive before the first completes, both may pass the initial `getStoredResponse` check (sentinel not yet written) and proceed in parallel, resulting in two on-chain submissions.

**Mitigation:**  
Use an atomic `upsert`-based lock: attempt to create the processing sentinel inside a database transaction with a unique constraint. The second concurrent request gets a `P2002` (unique violation) and should return `409 Conflict` immediately rather than proceeding.

**Test:** `replay.test.ts` → `"Surface 2: concurrent requests with same key only process once"`

---

### Surface 3 — Off-Chain Pre-Authorization Token Replay

**Risk:** HIGH  
**Location:** `src/controllers/loans.controller.ts → requestLoan()`  
**Mitigation Layer:** Application  

**Description:**  
`POST /api/loans/request` returns a JSON payload containing the Soroban contract call parameters (`borrower`, `collateralId`, `principalUSDC`, `durationDays`). This payload is not time-bound or nonce-bound on the backend. An attacker who intercepts or captures this response can re-use the same parameters to submit additional on-chain calls, potentially creating duplicate loans against the same collateral if backend validation is bypassed.

**Mitigation:**  
Return a short-lived, signed **nonce token** alongside the contract parameters. The backend records the nonce with an expiry (e.g. 5 minutes). The frontend must include this nonce token in the on-chain call's `memo` field (or as a contract argument). The event indexer (`soroban.service.ts`) validates the nonce before creating the off-chain DB record, preventing double-indexing.

**Test:** `replay.test.ts` → `"Surface 3: pre-authorization payload cannot be replayed after expiry"`

---

### Surface 4 — Ledger Bound Not Enforced on High-Value Operations

**Risk:** HIGH  
**Location:** `src/services/soroban.service.ts → invokeContract()`  
**Mitigation Layer:** Application / Contract  

**Description:**  
`invokeContract()` calls `.setTimeout(30)` which sets a `timeBounds.maxTime` of 30 seconds from build time. However, there is no `minTime` set and no `ledgerBounds` (Soroban-specific). For high-value operations like `mint_collateral`, the absence of ledger bounds means a transaction built but not yet submitted could be held and submitted much later (beyond the 30-second timeout if the builder clock was manipulated, or if the transaction envelope is extracted before signing).

**Mitigation:**  
For all high-value operations (`mint_collateral`, `create_loan`), add explicit `ledgerBounds` using the current ledger obtained from `rpc.getLatestLedger()`:

```typescript
const latestLedger = await rpc.getLatestLedger();
txBuilder
  .addOperation(...)
  .setLedgerBounds(latestLedger.sequence, latestLedger.sequence + 100) // valid for ~100 ledgers (~8 min)
  .setTimeout(30);
```

**Test:** `tests/integration/replay-mitigation.test.ts` → `"ledger bounds enforced on mint_collateral"` and `"ledger bounds enforced on create_loan"`

---

### Surface 5 — Event Indexer Upsert Allows Re-processing

**Risk:** LOW  
**Location:** `src/services/soroban.service.ts → handleLoanCreated()`  
**Mitigation Layer:** Application  

**Description:**  
`handleLoanCreated` uses `prisma.loan.upsert()` keyed on `contractLoanId`. While this prevents duplicate DB rows, the `update` branch re-applies `status: ACTIVE` and updates `lastSyncedAt` even if the event was already processed. A malicious RPC provider or a network replay delivering the same event twice could trigger unnecessary state changes (e.g. un-liquidating a loan by flipping it back to `ACTIVE`).

**Mitigation:**  
Add a `lastEventLedger` guard: only process an event if its ledger is strictly greater than the stored `lastEventLedger` for that loan. Discard events with equal or lower ledger values.

**Test:** `replay.test.ts` → `"Surface 5: duplicate on-chain event does not re-process loan"`

---

### Surface 6 — JWT Token Does Not Expire (Missing exp Claim Validation)

**Risk:** MEDIUM  
**Location:** `src/middleware/requireAuth.ts`, `src/services/auth.service.ts`  
**Mitigation Layer:** Application  

**Description:**  
If a JWT token is captured (e.g. via a compromised browser or log leak), it can be replayed to authenticate as the original user. The risk is proportional to the token TTL. Tokens should have a short expiry and the `exp` claim must be validated.

**Mitigation:**  
Confirm `jsonwebtoken.verify()` validates `exp` (it does by default). Ensure `expiresIn` is set to a short value (e.g. 1 hour) in `auth.service.ts`. Add a token revocation/blocklist for high-value actions.

**Test:** `replay.test.ts` → `"Surface 6: expired JWT is rejected"`

---

## 4. Mitigation Summary

| Surface | Risk | Layer | Status |
|---|---|---|---|
| 1 – Missing idempotency key | HIGH | Application | ✅ Idempotency key now required on financial endpoints |
| 2 – Processing-state race (TOCTOU) | MEDIUM | Application | ✅ Atomic upsert lock implemented |
| 3 – Pre-auth token replay | HIGH | Application | ✅ Nonce token with expiry added |
| 4 – Missing ledger bounds | HIGH | Application | ✅ Ledger bounds enforced in `invokeContract` |
| 5 – Duplicate event re-processing | LOW | Application | ✅ `lastEventLedger` guard added |
| 6 – JWT replay via long-lived token | MEDIUM | Application | ✅ Short TTL + `exp` validation confirmed |
| Sequence number replay | N/A | Protocol | ✅ Mitigated at Stellar protocol layer |
| Network passphrase replay | N/A | Protocol | ✅ Mitigated at Stellar protocol layer |
| Transaction timeBounds expiry | N/A | Protocol | ✅ Mitigated at Stellar protocol layer |

---

## 5. Testing Matrix

| Test ID | Surface | File | Type |
|---|---|---|---|
| T1 | Surface 1 | `tests/unit/replay.test.ts` | Unit |
| T2 | Surface 2 | `tests/unit/replay.test.ts` | Unit |
| T3 | Surface 3 | `tests/unit/replay.test.ts` | Unit |
| T4 | Surface 4 | `tests/integration/replay-mitigation.test.ts` | Integration |
| T5 | Surface 4 | `tests/integration/replay-mitigation.test.ts` | Integration |
| T6 | Surface 5 | `tests/unit/replay.test.ts` | Unit |
| T7 | Surface 6 | `tests/unit/replay.test.ts` | Unit |

---

## 6. References

- [Stellar Transaction Lifecycle](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle)
- [Soroban Auth Model](https://soroban.stellar.org/docs/learn/authorization)
- [Soroban Ledger Bounds](https://developers.stellar.org/docs/build/guides/transactions/ledger-bounds)
- [OWASP Replay Attack](https://owasp.org/www-community/attacks/Replay_Attack)
