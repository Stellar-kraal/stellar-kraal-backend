# StellarKraal Load Test Suite

k6-based load testing suite benchmarking the backend API under realistic marketplace load.

## Quick start

```bash
# 1. Install k6 — https://k6.io/docs/get-started/installation/

# 2. Start the backend
npm run dev

# 3. Seed test data (first time only)
node src/tests/load/scripts/seed-load-data.mjs --livestock=50 --loans=20

# 4. Generate JWT tokens
node src/tests/load/scripts/generate-tokens.mjs
#    Copy the printed FARMER_TOKEN / INVESTOR_TOKEN into .env.load

# 5. Run the smoke test
k6 run --env-file .env.load src/tests/load/smoke/ci-smoke.js

# 6. Run the full mixed baseline
k6 run --env-file .env.load src/tests/load/scenarios/06-mixed-marketplace-load.js
```

## Files

```
src/tests/load/
├── k6.env.example          # Copy to .env.load and fill in values
├── lib/
│   ├── config.js           # Shared env vars, thresholds, headers
│   └── helpers.js          # Assertions, custom metrics, data generators
├── scenarios/
│   ├── 01-health-and-auth.js          # Health + SEP-10 challenge
│   ├── 02-credit-listings.js          # Market browse + pagination
│   ├── 03-livestock-registration.js   # Register + appraisal oracle
│   ├── 04-loan-requests.js            # Bulk loan submissions
│   ├── 05-oracle-price-updates.js     # Oracle PATCH + realtime Soroban reads (parallel)
│   └── 06-mixed-marketplace-load.js   # Full baseline (all patterns combined)
├── smoke/
│   └── ci-smoke.js         # 10 VUs / 30 s — PR gate
└── scripts/
    ├── generate-tokens.mjs  # Generate long-lived JWTs for load tests
    └── seed-load-data.mjs   # Seed DB with verified livestock + active loans
```

## Environment variables

See `k6.env.example` for the full list. The most important:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3001` | Target API URL |
| `FARMER_TOKEN` | — | JWT for a FARMER user |
| `INVESTOR_TOKEN` | — | JWT for an INVESTOR user |
| `P95_THRESHOLD_MS` | `2000` | p95 latency gate (ms) |
| `SMOKE_VUS` | `10` | VUs for CI smoke test |
| `SMOKE_DURATION` | `30s` | Duration for CI smoke test |

## CI integration

The smoke test runs automatically on every PR via `.github/workflows/load-test.yml`.
The full baseline can be triggered manually via `workflow_dispatch`.

See [docs/testing/load-test-baseline.md](../../../docs/testing/load-test-baseline.md) for the full baseline report.
