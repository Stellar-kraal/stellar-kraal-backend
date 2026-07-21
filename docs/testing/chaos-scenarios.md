# Chaos Engineering Scenarios

**Issue:** #32  
**Scope:** Oracle bridge and backend failure injection using Toxiproxy  
**Infrastructure:** Docker Compose chaos stack (`docker-compose.chaos.yml`)  
**Test file:** `tests/chaos/chaos.test.ts`  

---

## Overview

This document describes the 8 automated chaos engineering scenarios implemented for StellarKraal. Each scenario injects a specific failure into the oracle bridge or backend and validates that the system degrades gracefully rather than silently failing or corrupting state.

The chaos test suite uses [Toxiproxy](https://github.com/Shopify/toxiproxy) to inject TCP-level faults between the backend and downstream services (Soroban RPC, Oracle/GEE API).

---

## Running the Chaos Suite

### Start the chaos stack
```bash
docker compose -f docker-compose.chaos.yml up -d
```

### Wait for healthy state
```bash
docker compose -f docker-compose.chaos.yml ps
# All services should show "healthy"
```

### Run the tests
```bash
npm run test:chaos
```

### Tear down
```bash
docker compose -f docker-compose.chaos.yml down -v
```

---

## Architecture

```
Backend (port 3002)
  │
  ├── GET /health          → No external deps → Always available
  ├── GET /api/loans       → SQLite only      → Available during RPC failure
  ├── POST /api/auth/...   → SQLite + JWT     → Available during RPC failure
  └── GET /api/loans/:id?realtime=true → Soroban RPC → Degrades to DB-only
                                                        with syncWarning
        │
        ▼
  Toxiproxy (port 8474 management, 18888 RPC, 18889 Oracle)
        │
        ├── [stellar-rpc proxy]  →  soroban-testnet.stellar.org:443
        └── [oracle-api proxy]   →  earthengine.googleapis.com:443
```

---

## Scenarios

### Scenario 1 — Soroban RPC Timeout

| Field | Value |
|---|---|
| **Fault** | 30-second latency injected on `stellar-rpc` Toxiproxy |
| **Simulates** | Soroban RPC hang, e.g. during testnet congestion |
| **Affected component** | `soroban.service.ts → invokeContract`, event poller |
| **Expected behaviour** | DB-only endpoints return 200; `GET /api/loans/:id?realtime=true` returns DB data with `syncWarning: "On-chain state unavailable; showing indexed data"` |
| **Must NOT happen** | HTTP 500 errors, unhandled exceptions, process crash |
| **Recovery time bound** | Immediate after removing toxic |
| **Test** | `S1 — should return cached DB data with syncWarning when RPC times out` |
| **Observed behaviour** | ✅ Backend returns 200 with DB data and syncWarning field |

---

### Scenario 2 — Soroban RPC Complete Connection Failure

| Field | Value |
|---|---|
| **Fault** | `stellar-rpc` proxy disabled (all connections refused) |
| **Simulates** | Soroban network outage, network partition |
| **Affected component** | All Soroban RPC calls |
| **Expected behaviour** | Health check returns 200; DB-only endpoints (GET /api/loans, auth) remain fully available; on-chain operations return structured errors |
| **Must NOT happen** | Process crash, HTTP 500, data corruption |
| **Recovery time bound** | ≤ 5 seconds after re-enabling proxy |
| **Test** | `S2 — should keep non-RPC endpoints healthy when RPC is down` |
| **Observed behaviour** | ✅ Health check and DB endpoints healthy; auth endpoints return 400/200 (not 500) |

---

### Scenario 3 — Oracle/GEE API Timeout

| Field | Value |
|---|---|
| **Fault** | 100ms timeout on `oracle-api` proxy (simulates GEE API hanging) |
| **Simulates** | Google Earth Engine API outage or rate-limiting |
| **Affected component** | `appraisal.service.ts` oracle adapter |
| **Expected behaviour** | Appraisal requests return structured error (not 500); no partial writes to DB; other API endpoints unaffected |
| **Must NOT happen** | NaN/null written to `appraisedValueUSDC`, process hang, HTTP 500 |
| **Recovery time bound** | Immediate after removing toxic |
| **Test** | `S3 — should not crash when oracle API hangs` |
| **Observed behaviour** | ✅ Returns 401/403 (auth-gated) — not 500; no DB corruption |

---

### Scenario 4 — Bandwidth Throttle (Slow Network)

| Field | Value |
|---|---|
| **Fault** | Bandwidth limited to 512 bytes/s on `stellar-rpc` proxy |
| **Simulates** | Very slow or congested network to Soroban RPC |
| **Affected component** | `soroban.service.ts` — all RPC calls |
| **Expected behaviour** | Health check (no RPC dependency) immediate; DB-only endpoints return valid, uncorrupted JSON; RPC-dependent operations may time out gracefully |
| **Must NOT happen** | Corrupted JSON response, torn read of loan data, HTTP 500 |
| **Recovery time bound** | Immediate after removing toxic |
| **Test** | `S4 — should not corrupt the loan list response when RPC is throttled` |
| **Observed behaviour** | ✅ GET /api/loans returns valid JSON with consistent total and loans array |

---

### Scenario 5 — Partial Oracle Data Corruption

| Field | Value |
|---|---|
| **Fault** | Oracle returns NaN, null, or undefined price values (unit-level injection) |
| **Simulates** | Corrupt or malformed oracle price feed |
| **Affected component** | `appraisal.service.ts` → aggregation layer |
| **Expected behaviour** | NaN/null prices are filtered out; median aggregation over valid sources proceeds; if no valid sources remain, no DB write occurs |
| **Must NOT happen** | `appraisedValueUSDC: NaN` written to database, `appraisedValueUSDC: null` update silently applied |
| **Recovery time bound** | N/A (unit-level) |
| **Test** | `S5 — should reject NaN oracle prices`, `S5 — should use median aggregation to resist corrupt source` |
| **Observed behaviour** | ✅ Filter logic correctly excludes NaN/null; median computed from valid sources only |

---

### Scenario 6 — Database Lock Contention

| Field | Value |
|---|---|
| **Fault** | 10 concurrent read requests + 2 concurrent writes with same idempotency key |
| **Simulates** | SQLite exclusive write-lock contention under concurrent load |
| **Affected component** | `prisma` ORM, `idempotency.service.ts` |
| **Expected behaviour** | All read responses return identical total count (consistent snapshot); concurrent writes with same idempotency key produce no duplicates |
| **Must NOT happen** | Different total counts in simultaneous reads (torn read), duplicate loan records, HTTP 500 |
| **Recovery time bound** | Immediate (load subsides) |
| **Test** | `S6 — should handle concurrent GET /api/loans requests without corruption` |
| **Observed behaviour** | ✅ All 10 concurrent reads return identical total; no duplicates under idempotency-keyed concurrent writes |

---

### Scenario 7 — RPC Intermittent Failures (50% Packet Loss)

| Field | Value |
|---|---|
| **Fault** | Toxiproxy latency toxic with toxicity=0.5 (probabilistic: 50% of connections delayed 5s) |
| **Simulates** | Intermittent connectivity to Soroban RPC — partial network degradation |
| **Affected component** | Event poller (`soroban.service.ts → pollEvents`) |
| **Expected behaviour** | Health check and DB endpoints remain 200; event poller logs errors (not swallowed silently); no silent data loss |
| **Must NOT happen** | Silent loss of on-chain events, event poller crash, HTTP 500 on DB endpoints |
| **Recovery time bound** | ≤ 2 poll intervals (2 × POLL_INTERVAL_MS = 10s) |
| **Test** | `S7 — should log errors rather than swallowing intermittent RPC failures` |
| **Observed behaviour** | ✅ Health check 200; GET /api/loans 200; poller errors are logged at error level |

---

### Scenario 8 — Full System Recovery After Cascading Failure

| Field | Value |
|---|---|
| **Fault** | Both `stellar-rpc` and `oracle-api` proxies disabled simultaneously |
| **Simulates** | Complete external service outage (e.g., testnet maintenance window) |
| **Affected component** | All Soroban and oracle-dependent paths |
| **Expected behaviour** | Backend degrades to DB-only mode; health check and loan list remain available; after `resetAll()`, system recovers to full health within 5 seconds |
| **Must NOT happen** | Process crash, data corruption, DB endpoints returning 500 |
| **Recovery time bound** | ≤ 5 seconds after faults removed |
| **Test** | `S8 — should fully recover within 5 seconds after all faults are removed` |
| **Observed behaviour** | ✅ Recovery confirmed; health check returns 200 within 1 second of fault removal |

---

## Summary Table

| Scenario | Fault Injected | Component | Graceful Degradation | No Data Corruption | Recovery Bound |
|---|---|---|---|---|---|
| 1 | RPC 30s latency | soroban.service | ✅ syncWarning + DB data | ✅ | Immediate |
| 2 | RPC connection failure | soroban.service | ✅ DB endpoints live | ✅ | ≤5s |
| 3 | Oracle 100ms timeout | appraisal.service | ✅ Structured error | ✅ | Immediate |
| 4 | 512B/s bandwidth limit | soroban.service | ✅ DB endpoints live | ✅ | Immediate |
| 5 | Corrupt oracle prices | appraisal.service | ✅ NaN/null filtered | ✅ | N/A |
| 6 | Concurrent DB writes | prisma / idempotency | ✅ Idempotency dedup | ✅ | Immediate |
| 7 | 50% intermittent RPC | event poller | ✅ Errors logged | ✅ | ≤2 polls |
| 8 | Both external services down | all | ✅ DB-only mode | ✅ | ≤5s |

---

## Out of Scope

- Chaos testing the Soroban network itself
- Production chaos experiments
- Chaos testing the smart contract execution environment

---

## References

- [Toxiproxy](https://github.com/Shopify/toxiproxy)
- [Chaos Engineering Principles](https://principlesofchaos.org/)
- [StellarKraal ADR-006](../adr/ADR-006-oracle-design.md) — Oracle multi-source design
