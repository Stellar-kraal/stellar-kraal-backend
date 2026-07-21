/**
 * Scenario 02 — Concurrent Credit Listings (Market View)
 * ========================================================
 * Models: investors browsing the active loan market, paginating through
 * listings, and fetching individual loan details.
 *
 * Endpoints exercised:
 *   GET /api/loans                    (public, paginated)
 *   GET /api/loans/:id                (public, by contractLoanId)
 *   GET /api/loans/:id?realtime=true  (triggers Soroban getLoanState simulation)
 *
 * Why it matters:
 *   - The market listing runs a compound Prisma query (JOIN users+livestock)
 *     with a COUNT. Under concurrent load this is the prime DB contention point.
 *   - The ?realtime=true variant adds a Soroban RPC call in the hot path —
 *     reveals Soroban submission queue saturation when VUs are high.
 *   - SQLite WAL mode allows concurrent readers but may lock under mixed
 *     read/write load from other scenarios.
 *
 * Stages (3-level baseline: 10 → 50 → 100 VUs):
 *   Ramp to 10  VUs (warm-up)
 *   Sustain 10  VUs for 60 s
 *   Ramp to 50  VUs
 *   Sustain 50  VUs for 60 s
 *   Ramp to 100 VUs
 *   Sustain 100 VUs for 60 s
 *   Ramp down
 *
 * Run (standalone):
 *   k6 run -e BASE_URL=http://localhost:3001 -e FARMER_TOKEN=<jwt> \
 *          src/tests/load/scenarios/02-credit-listings.js
 */

import { sleep } from 'k6';
import { BASE_URL, STANDARD_THRESHOLDS, THINK_TIME_S, JSON_HEADERS, authHeaders, FARMER_TOKEN } from '../lib/config.js';
import { assertResponse, marketQueryLatency, checkDbContention, checkSorobanError, getJson } from '../lib/helpers.js';

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    credit_listings: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10  },
        { duration: '60s', target: 10  },
        { duration: '20s', target: 50  },
        { duration: '60s', target: 50  },
        { duration: '20s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '20s', target: 0   },
      ],
      tags: { scenario: 'credit_listings' },
    },
  },
  thresholds: {
    ...STANDARD_THRESHOLDS,
    'market_query_duration_ms': [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    'http_req_duration{scenario:credit_listings}': [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    // DB contention counter — any value > 0 is a red flag
    'db_contention_errors': ['count<1'],
  },
};

// ─── Cached loan IDs for detail lookups ───────────────────────────────────────
// Each VU fetches the first page and picks random IDs from the result set.
let cachedLoanIds = [];

// ─── Default scenario ─────────────────────────────────────────────────────────
export default function () {
  // ── 1. Paginated market listing ────────────────────────────────────────────
  const page  = Math.floor(1 + Math.random() * 3);   // pages 1–3
  const limit = [10, 20, 50][__VU % 3];               // vary page sizes

  const start = Date.now();
  const listRes = getJson(
    `${BASE_URL}/api/loans`,
    { page, limit },
    JSON_HEADERS,
  );
  marketQueryLatency.add(Date.now() - start);

  checkDbContention(listRes);

  assertResponse(listRes, 'GET /api/loans', {
    'status is 200':             (r) => r.status === 200,
    'has pagination envelope':   (r) => typeof r.json('page') === 'number',
    'loans is array':            (r) => Array.isArray(r.json('loans')),
    'total is number':           (r) => typeof r.json('total') === 'number',
  });

  // Cache loan IDs for detail lookups
  try {
    const loans = listRes.json('loans') || [];
    if (loans.length > 0) {
      cachedLoanIds = loans.map((l) => l.id || l.contractLoanId).filter(Boolean);
    }
  } catch (_) { /* ignore parse errors */ }

  sleep(THINK_TIME_S);

  // ── 2. Individual loan detail ──────────────────────────────────────────────
  if (cachedLoanIds.length > 0) {
    const loanId = cachedLoanIds[Math.floor(Math.random() * cachedLoanIds.length)];

    // Alternate between DB-only and realtime (Soroban simulation) lookups
    // ~80% DB-only (fast), ~20% realtime (reveals Soroban queue saturation)
    const realtime = Math.random() < 0.2;

    const detailRes = getJson(
      `${BASE_URL}/api/loans/${loanId}`,
      realtime ? { realtime: 'true' } : null,
      JSON_HEADERS,
    );

    checkDbContention(detailRes);
    checkSorobanError(detailRes);

    assertResponse(detailRes, `GET /api/loans/:id${realtime ? '?realtime' : ''}`, {
      'status is 200 or 404':  (r) => r.status === 200 || r.status === 404,
      'has loan or error':     (r) => r.json('loan') !== undefined || r.json('error') !== undefined,
    });

    sleep(THINK_TIME_S);
  }

  // ── 3. Authenticated investor: my loans ────────────────────────────────────
  if (FARMER_TOKEN) {
    const myLoansRes = getJson(
      `${BASE_URL}/api/loans/my`,
      null,
      authHeaders(FARMER_TOKEN),
    );

    assertResponse(myLoansRes, 'GET /api/loans/my', {
      'status is 200': (r) => r.status === 200,
      'has count':     (r) => typeof r.json('count') === 'number',
    });

    sleep(THINK_TIME_S * 0.5);
  }
}
