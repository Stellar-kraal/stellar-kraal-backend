# E2E Test Setup Guide

**Relates to:** Issue #27 — Full Credit Lifecycle E2E Test Suite  
**CI workflow:** [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml)

---

## Overview

The E2E test suite exercises the complete StellarKraal credit lifecycle against a live Soroban testnet:

```
Fund accounts (Friendbot)
  → SEP-10 authentication (farmer + investor)
  → Register livestock (triggers appraisal oracle)
  → Poll until verificationStatus = VERIFIED (on-chain mint_collateral confirmed)
  → Request loan (API validates preconditions, returns contract params)
  → Market view (investor perspective)
  → Investor loan detail (API + Horizon assertion)
  → My-loans, my-kraal, auth rejection, health check
```

Each test run:
- Generates **fresh funded keypairs** via Stellar Friendbot — no shared wallet state between runs
- Operates against a **freshly seeded SQLite database** (`e2e.db`) that is wiped after the run
- Makes assertions at both the **backend API level** and directly against **Stellar Horizon** for dual-layer verification

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | `node --version` |
| npm | 10+ | bundled with Node 20 |
| Internet access | — | Friendbot + Soroban testnet RPC are public endpoints |
| Running backend | — | `npm run dev` or `node dist/server.js` |
| `stellar-cli` | latest | Only needed if `E2E_DEPLOY_CONTRACT=true` |

---

## Quick Start (local)

### 1. Copy and configure the environment file

```bash
cp .env.e2e.example .env.e2e
```

Edit `.env.e2e` and fill in:

| Variable | Where to get it |
|---|---|
| `E2E_SERVER_SECRET_KEY` | Must match `SERVER_SECRET_KEY` in your backend `.env`. Generate with `stellar keys generate --network testnet e2e-oracle` |
| `E2E_CONTRACT_ID` | Your deployed testnet contract ID (starts with `C`) |
| `JWT_SECRET` | Must match `JWT_SECRET` in your backend `.env` |

The other variables have safe defaults for testnet runs.

### 2. Start the backend

In a separate terminal:

```bash
# Using dev server (auto-reloads)
npm run dev

# Or compiled build
npm run build && npm start
```

Wait until you see `Server started on port 3001` in the logs.

### 3. Run the E2E suite

```bash
npm run test:e2e
```

Expected output:

```
 RUNS  tests/e2e/lifecycle.e2e.test.ts

  StellarKraal — full credit lifecycle E2E

  [e2e] ▶ fund-accounts
  [e2e] ✓ fund-accounts (3421ms)
  [e2e] ▶ authenticate-farmer
  [e2e] ✓ authenticate-farmer (890ms)
  [e2e] ▶ register-livestock
  [e2e] ✓ register-livestock (2100ms)
  ...

══════════════ E2E Lifecycle Report ══════════════
  ✓ fund-accounts (3421ms)
      farmerPublicKey: "GABCDE..."
      investorPublicKey: "GXYZ..."
  ✓ authenticate-farmer (890ms)
  ✓ register-livestock (2100ms)
      livestockId: "clxabc123"
      appraisedValueUSDC: 759.375
  ✓ livestock-verified (45200ms)
      txHash: "abc123..."
      horizonLink: "https://horizon-testnet.stellar.org/transactions/abc123..."
  ...
══════════════════════════════════════════════════

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Time:        ~3m 20s
```

---

## Environment Variables Reference

All E2E variables are prefixed with `E2E_` to avoid colliding with the backend's own environment.

| Variable | Default | Description |
|---|---|---|
| `E2E_API_URL` | `http://localhost:3001` | Base URL of the running backend |
| `E2E_NETWORK` | `testnet` | Stellar network: `testnet` or `mainnet` |
| `E2E_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban JSON-RPC endpoint |
| `E2E_CONTRACT_ID` | placeholder | Deployed Soroban contract ID |
| `E2E_SERVER_SECRET_KEY` | placeholder | Oracle server secret key (must match backend) |
| `E2E_DEPLOY_CONTRACT` | `false` | Deploy a fresh contract before the run |
| `E2E_ON_CHAIN_TIMEOUT_MS` | `90000` | Max wait per on-chain confirmation step |
| `E2E_VERBOSE` | `true` | Print per-step progress to stdout |
| `DATABASE_URL` | `file:./e2e.db` | SQLite path for the E2E database |
| `JWT_SECRET` | placeholder | Must match the running backend's JWT secret |

---

## Test Architecture

### File Structure

```
tests/e2e/
├── config.ts                     # Reads E2E_ env vars into a typed config object
├── lifecycle.e2e.test.ts         # Main lifecycle test (15 steps)
├── helpers/
│   ├── accounts.ts               # Friendbot-funded keypair creation
│   ├── auth.ts                   # SEP-10 challenge/response flow helper
│   ├── horizon.ts                # Horizon REST API queries for on-chain assertions
│   └── reporter.ts               # Structured failure report builder + apiCall helper
└── setup/
    ├── globalSetup.ts            # Runs once before suite: DB push, health check, optional deploy
    ├── globalTeardown.ts         # Runs once after suite: removes e2e.db
    └── jestEnvSetup.ts           # Loads .env.e2e and sets process.env defaults per worker
```

### Isolation Strategy

Each run is isolated by design:

1. **Fresh keypairs:** `createFundedAccounts()` generates a new random Stellar keypair and funds it via Friendbot on every run. No test shares wallet state.
2. **Fresh database:** `globalSetup.ts` runs `prisma db push` against `e2e.db` before each suite. `globalTeardown.ts` deletes the file afterwards.
3. **Unique animal tags:** The livestock `animalId` includes `Date.now()` to prevent duplicate-key errors on rapid re-runs.
4. **Serial execution:** `maxWorkers: 1` in `jest.e2e.config.ts` prevents parallel runs from hitting Friendbot rate limits or conflicting Soroban sequence numbers.

### Dual-Layer Assertions

Every step that involves an on-chain transaction performs two assertions:

1. **API assertion:** the backend's HTTP response contains the expected data (status, fields, values).
2. **Horizon assertion:** the `appraisalTxHash` returned by the backend is verified against Horizon to confirm the transaction was included in the ledger and marked `successful: true`.

If Horizon is unreachable (e.g., testnet maintenance) the Horizon assertion is logged as a warning rather than failing the test, since the API-level assertion already confirms the backend recorded the correct state.

### Failure Reports

When a step fails, `LifecycleReport.buildError()` produces an `E2EStepError` containing:

```json
{
  "failedStep": "register-livestock",
  "completedSteps": ["fund-accounts", "authenticate-farmer"],
  "api": {
    "method": "POST",
    "url": "http://localhost:3001/api/livestock/register",
    "requestBody": { "animalId": "E2E-CATTLE-1721091234567", ... },
    "statusCode": 422,
    "responseBody": { "error": "Animal ID already registered" }
  },
  "horizonLink": null,
  "timestamp": "2026-07-16T01:05:30.000Z"
}
```

This JSON is written to `stderr` and also captured in the CI artifact `e2e-failure-report-<run_number>`.

---

## Running in CI

The workflow is defined in [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml).

### Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `E2E_SERVER_SECRET_KEY` | Stellar secret key for the oracle server account (testnet) |
| `E2E_CONTRACT_ID` | Deployed testnet contract ID (starts with `C`) |
| `JWT_SECRET` | JWT signing secret used by the E2E backend instance |

### Optional GitHub Variables

| Variable | Default | Description |
|---|---|---|
| `E2E_ON_CHAIN_TIMEOUT_MS` | `90000` | Increase if testnet is congested |

### Trigger: Manual Deploy + Test

To deploy a fresh contract and run tests in a single workflow dispatch:

1. Go to **Actions → E2E — Credit Lifecycle → Run workflow**
2. Set **deploy-contract** to `true`
3. Click **Run workflow**

This requires `stellar-cli` to be available in the runner and the contract WASM to be pre-built. For most CI runs, leave `deploy-contract=false` and use a stable pre-deployed contract ID.

### Workflow Steps Summary

| Step | What it does |
|---|---|
| Checkout | Fetch the repository |
| Setup Node 20 | Cache npm dependencies |
| `npm ci` | Install exact locked dependencies |
| `prisma generate` | Regenerate Prisma client |
| `npm run build` | Compile TypeScript to `dist/` |
| Configure secrets | Write secrets to `$GITHUB_ENV` |
| Start backend | `node dist/server.js &` — runs in background |
| Wait for health | `curl /health` in a retry loop (30 × 2 s) |
| Run E2E tests | `npm run test:e2e` — up to 10 min timeout |
| Upload artifacts | On failure: uploads `e2e-failure-report-N` + `e2e.db` |
| Stop backend | `kill $BACKEND_PID` in `always()` step |
| Post summary | Writes run metadata to GitHub step summary |

---

## Deploying a Fresh Contract (optional)

Fresh contract deployment is used in CI to guarantee complete isolation between runs. It requires `stellar-cli`.

### Install stellar-cli

```bash
# macOS / Linux (Homebrew)
brew install stellar/tap/stellar-cli

# Direct binary download — see https://github.com/stellar/stellar-cli/releases
```

### Build the contract WASM

```bash
cd contracts/stellarkraal
cargo build --release --target wasm32-unknown-unknown
```

### Enable deployment in the E2E run

```bash
# In .env.e2e:
E2E_DEPLOY_CONTRACT=true
E2E_SERVER_SECRET_KEY=SXXX...   # account that will pay deployment fees
```

The `globalSetup.ts` script will:
1. Upload the WASM binary via `stellar contract upload`
2. Deploy an instance via `stellar contract deploy`
3. Set `E2E_CONTRACT_ID` in `process.env` for the duration of the test run

---

## Troubleshooting

### `Backend did not become ready in time`

The backend failed to start or is bound to a different port.

- Check that `npm run dev` or `node dist/server.js` is running and listening on `PORT=3001`.
- Confirm `DATABASE_URL` and `JWT_SECRET` are set correctly.
- Run `curl http://localhost:3001/health` manually.

### `Friendbot funding failed after 3 attempts`

Stellar Friendbot is occasionally rate-limited or unavailable.

- Wait 60 seconds and retry.
- Check [https://status.stellar.org](https://status.stellar.org) for testnet status.
- Increase the retry delay in `tests/e2e/helpers/accounts.ts` if you run E2E frequently.

### `Timed out waiting for livestock to reach VERIFIED`

The `mint_collateral` Soroban transaction did not confirm within `E2E_ON_CHAIN_TIMEOUT_MS`.

- Check RPC connectivity: `curl https://soroban-testnet.stellar.org` should return a response.
- Check the backend logs for `mint_collateral failed` errors.
- Confirm `E2E_CONTRACT_ID` is a valid deployed contract on testnet.
- Increase `E2E_ON_CHAIN_TIMEOUT_MS` to `120000` during testnet congestion.

### `E2EAuthError: Challenge request failed: 400`

The challenge endpoint rejected the public key.

- Confirm the freshly generated keypair is a valid Ed25519 Stellar key (starts with `G`).
- Check that Friendbot funding completed successfully before the auth step.

### `Missing required environment variable: CONTRACT_ID`

The backend started without `CONTRACT_ID` in its environment.

- Ensure your `.env` (for local runs) or GitHub Secret `E2E_CONTRACT_ID` (for CI) is set.
- The E2E `jestEnvSetup.ts` sets a placeholder, but the backend process itself also needs the variable.

---

## Adding New Lifecycle Steps

1. Add a new step name to the `LifecycleStepName` union in `tests/e2e/helpers/reporter.ts`.
2. Add a new `it()` block in `lifecycle.e2e.test.ts`, calling `report.startStep()` and `report.completeStep()`.
3. Use `apiCall()` from `reporter.ts` for all HTTP requests — it returns a `capture` object ready for `report.buildError()` if the assertion fails.
4. For on-chain assertions, use helpers from `tests/e2e/helpers/horizon.ts`.
5. Update the `SUITE_TIMEOUT_MS` constant if the total run time increases.
