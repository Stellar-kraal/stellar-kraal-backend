/**
 * Scenario 06 — Mixed Marketplace Load (Full Baseline Run)
 * ==========================================================
 * Combines all traffic patterns into a single ramped run to produce the
 * comprehensive baseline report numbers (p50/p95/p99 at 10/50/100 VUs).
 *
 * Traffic mix (approximate):
 *   40% — GET /api/loans (market browse)                   → DB read + JOIN
 *   20% — GET /api/livestock/my-kraal                      → DB read
 *   15% — POST /api/livestock/register                     → appraisal + write
 *   10% — POST /api/loans/request                          → 3 DB reads + validate
 *   10% — GET /api/loans/:id?realtime=true                 → DB read + Soroban RPC
 *    5% — PATCH /api/livestock/:id                         → DB write
 *
 * This mirrors a realistic production workload where reads dominate but writes
 * and Soroban calls generate contention spikes.
 *
 * Run (standalone — full baseline):
 *   k6 run -e BASE_URL=http://localhost:3001 \
 *          -e FARMER_TOKEN=<jwt> \
 *          -e INVESTOR_TOKEN=<jwt> \
 *          src/tests/load/scenarios/06-mixed-marketplace-load.js
 *
 * Run (smoke — 10 VUs, 30 s):
 *   k6 run -e BASE_URL=http://localhost:3001 \
 *          -e FARMER_TOKEN=<jwt> \
 *          -e SMOKE=true \
 *          src/tests/load/scenarios/06-mixed-marketplace-load.js
 */

import { sleep } from 'k6';
import {
  BASE_URL, STANDARD_THRESHOLDS, THINK_TIME_S,
  FARMER_TOKEN, INVESTOR_TOKEN, authHeaders, JSON_HEADERS,
  SMOKE_VUS, SMOKE_DURATION,
} from '../lib/config.js';
import {
  assertResponse,
  checkDbContention,
  checkSorobanError,
  randomLivestockPayload,
  randomOraclePriceUpdatePayload,
  postJson,
  getJson,
  patchJson,
} from '../lib/helpers.js';

// ─── Smoke vs full run ────────────────────────────────────────────────────────
const IS_SMOKE = (__ENV.SMOKE || '').toLowerCase() === 'true';

const stages = IS_SMOKE
  ? [
      { duration: '10s', target: SMOKE_VUS },
      { duration: SMOKE_DURATION, target: SMOKE_VUS },
      { duration: '5s',  target: 0 },
    ]
  : [
      // Warm-up
      { duration: '30s', target: 10  },
      // 10 VU baseline
      { duration: '60s', target: 10  },
      // Ramp to 50
      { duration: '30s', target: 50  },
      // 50 VU baseline
      { duration: '60s', target: 50  },
      // Ramp to 100
      { duration: '30s', target: 100 },
      // 100 VU baseline
      { duration: '120s', target: 100 },
      // Cool-down
      { duration: '30s', target: 0   },
    ];

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    mixed_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      tags: { scenario: 'mixed_load' },
    },
  },
  thresholds: {
    ...STANDARD_THRESHOLDS,
    // CI smoke gate — p95 must stay under the documented threshold
    [`http_req_duration{scenario:mixed_load}`]: [
      `p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`,
    ],
    'db_contention_errors': ['count<10'],
    'soroban_errors': ['count<30'],
  },
};

// ─── Setup ────────────────────────────────────────────────────────────────────
export function setup() {
  const result = { livestockIds: [], loanIds: [] };
  const token = FARMER_TOKEN || INVESTOR_TOKEN;

  if (token) {
    const kraalRes = getJson(`${BASE_URL}/api/livestock/my-kraal`, null, authHeaders(token));
    if (kraalRes.status === 200) {
      try {
        result.livestockIds = (kraalRes.json('livestock') || [])
          .filter((l) => l.verificationStatus === 'VERIFIED')
          .map((l) => l.id)
          .filter(Boolean);
      } catch (_) { /* ignore */ }
    }
  }

  const loansRes = getJson(`${BASE_URL}/api/loans`, { limit: 50 }, JSON_HEADERS);
  if (loansRes.status === 200) {
    try {
      result.loanIds = (loansRes.json('loans') || [])
        .map((l) => l.contractLoanId || l.id)
        .filter(Boolean);
    } catch (_) { /* ignore */ }
  }

  return result;
}

// ─── Mixed workload dispatcher ────────────────────────────────────────────────
export default function (data) {
  const roll = Math.random();

  if (roll < 0.40) {
    // 40%: Market browse
    scenarioMarketBrowse();
  } else if (roll < 0.60) {
    // 20%: My kraal listing
    scenarioMyKraal();
  } else if (roll < 0.75) {
    // 15%: Livestock registration
    scenarioRegisterLivestock();
  } else if (roll < 0.85) {
    // 10%: Loan request
    scenarioLoanRequest(data.livestockIds);
  } else if (roll < 0.95) {
    // 10%: Realtime loan state
    scenarioRealtimeLoan(data.loanIds);
  } else {
    // 5%: Oracle metadata update
    scenarioOracleUpdate(data.livestockIds);
  }
}

// ─── Sub-functions ────────────────────────────────────────────────────────────

function scenarioMarketBrowse() {
  const page  = Math.floor(1 + Math.random() * 3);
  const limit = [10, 20, 50][Math.floor(Math.random() * 3)];

  const res = getJson(`${BASE_URL}/api/loans`, { page, limit }, JSON_HEADERS);
  checkDbContention(res);

  assertResponse(res, 'GET /api/loans', {
    'status is 200':   (r) => r.status === 200,
    'loans is array':  (r) => Array.isArray(r.json('loans')),
  });

  sleep(THINK_TIME_S);
}

function scenarioMyKraal() {
  if (!FARMER_TOKEN) { sleep(THINK_TIME_S); return; }

  const res = getJson(`${BASE_URL}/api/livestock/my-kraal`, null, authHeaders(FARMER_TOKEN));
  checkDbContention(res);

  assertResponse(res, 'GET /api/livestock/my-kraal', {
    'status is 200':  (r) => r.status === 200,
    'has count':      (r) => typeof r.json('count') === 'number',
  });

  sleep(THINK_TIME_S);
}

function scenarioRegisterLivestock() {
  if (!FARMER_TOKEN) { sleep(THINK_TIME_S); return; }

  const res = postJson(
    `${BASE_URL}/api/livestock/register`,
    randomLivestockPayload(),
    authHeaders(FARMER_TOKEN),
  );
  checkDbContention(res);
  checkSorobanError(res);

  assertResponse(res, 'POST /api/livestock/register', {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
  });

  sleep(THINK_TIME_S);
}

function scenarioLoanRequest(livestockIds) {
  if (!FARMER_TOKEN || !livestockIds || livestockIds.length === 0) {
    sleep(THINK_TIME_S);
    return;
  }

  const livestockId  = livestockIds[Math.floor(Math.random() * livestockIds.length)];
  const principalUSDC = parseFloat((300 + Math.random() * 600).toFixed(2));

  const res = postJson(
    `${BASE_URL}/api/loans/request`,
    { livestockId, principalUSDC, durationDays: 90 },
    authHeaders(FARMER_TOKEN),
  );
  checkDbContention(res);

  assertResponse(res, 'POST /api/loans/request', {
    'valid response code': (r) => [200, 403, 404, 409, 422].includes(r.status),
  });

  sleep(THINK_TIME_S);
}

function scenarioRealtimeLoan(loanIds) {
  if (!loanIds || loanIds.length === 0) { sleep(THINK_TIME_S); return; }

  const loanId = loanIds[Math.floor(Math.random() * loanIds.length)];
  const res    = getJson(`${BASE_URL}/api/loans/${loanId}`, { realtime: 'true' }, JSON_HEADERS);

  checkSorobanError(res);
  checkDbContention(res);

  assertResponse(res, 'GET /api/loans/:id?realtime=true', {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'no 500':               (r) => r.status !== 500,
  });

  sleep(THINK_TIME_S);
}

function scenarioOracleUpdate(livestockIds) {
  if (!FARMER_TOKEN || !livestockIds || livestockIds.length === 0) {
    sleep(THINK_TIME_S);
    return;
  }

  const livestockId = livestockIds[__VU % livestockIds.length];
  const res = patchJson(
    `${BASE_URL}/api/livestock/${livestockId}`,
    randomOraclePriceUpdatePayload(),
    authHeaders(FARMER_TOKEN),
  );
  checkDbContention(res);

  assertResponse(res, 'PATCH /api/livestock/:id', {
    'status 200, 403, or 404': (r) => [200, 403, 404].includes(r.status),
  });

  sleep(THINK_TIME_S);
}
