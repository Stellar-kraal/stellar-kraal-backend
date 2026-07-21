/**
 * Scenario 05 — Oracle Price Update Ingestion & Simultaneous Retirement Requests
 * ================================================================================
 * Models two sub-scenarios run in parallel:
 *
 *   A) oracle_updates  — PATCH /api/livestock/:id updating location/imageUrl
 *      (simulates oracle data ingestion: an admin updating appraisal metadata
 *       for many livestock records simultaneously)
 *
 *   B) loan_realtime   — GET /api/loans/:id?realtime=true
 *      (simulates retirement / repayment flow: investors polling on-chain state
 *       via the Soroban getLoanState simulation — the most expensive read path)
 *
 * Why it matters for bottleneck analysis:
 *   1. PATCH /livestock/:id under high concurrency reveals write-lock contention
 *      on the livestock table (SQLite only allows one writer at a time).
 *   2. GET /loans/:id?realtime=true calls rpc.simulateTransaction() for every
 *      request — under 50+ VUs this saturates the Soroban RPC connection pool
 *      and the submission queue (getAccount calls compete for sequence numbers).
 *   3. Running both sub-scenarios in parallel stresses the mixed read/write
 *      workload — the most realistic production pattern.
 *
 * Requires:
 *   FARMER_TOKEN   — JWT for a FARMER user who owns livestock in the DB
 *   INVESTOR_TOKEN — JWT for an INVESTOR user (optional; falls back to FARMER_TOKEN)
 *
 * Run (standalone):
 *   k6 run -e BASE_URL=http://localhost:3001 \
 *          -e FARMER_TOKEN=<jwt> \
 *          -e INVESTOR_TOKEN=<jwt> \
 *          src/tests/load/scenarios/05-oracle-price-updates.js
 */

import { sleep } from 'k6';
import {
  BASE_URL, STANDARD_THRESHOLDS, THINK_TIME_S,
  FARMER_TOKEN, INVESTOR_TOKEN, authHeaders, JSON_HEADERS,
} from '../lib/config.js';
import {
  assertResponse,
  checkDbContention,
  checkSorobanError,
  sorobanErrors,
  randomOraclePriceUpdatePayload,
  getJson,
  patchJson,
} from '../lib/helpers.js';

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Sub-scenario A: oracle metadata updates (write-heavy)
    oracle_updates: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10  },
        { duration: '60s', target: 10  },
        { duration: '20s', target: 50  },
        { duration: '60s', target: 50  },
        { duration: '20s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '15s', target: 0   },
      ],
      exec: 'oracleUpdateScenario',
      tags: { scenario: 'oracle_updates' },
    },
    // Sub-scenario B: realtime on-chain state polling (Soroban RPC heavy)
    loan_realtime: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 5   },
        { duration: '60s', target: 5   },
        { duration: '20s', target: 25  },
        { duration: '60s', target: 25  },
        { duration: '20s', target: 50  },
        { duration: '60s', target: 50  },
        { duration: '15s', target: 0   },
      ],
      exec: 'loanRealtimeScenario',
      tags: { scenario: 'loan_realtime' },
    },
  },
  thresholds: {
    ...STANDARD_THRESHOLDS,
    'http_req_duration{scenario:oracle_updates}':  [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    'http_req_duration{scenario:loan_realtime}':   [`p(95)<${__ENV.P95_THRESHOLD_MS * 2 || 4000}`],
    // Soroban errors should stay very low — RPC is an external dependency
    'soroban_errors': ['count<20'],
    'db_contention_errors': ['count<5'],
  },
};

// ─── Setup: fetch livestock & loan IDs ────────────────────────────────────────
export function setup() {
  const result = { livestockIds: [], loanIds: [] };
  const token = FARMER_TOKEN || INVESTOR_TOKEN;
  if (!token) return result;

  const headers = authHeaders(token);

  // Fetch livestock IDs for the oracle update sub-scenario
  const kraalRes = getJson(`${BASE_URL}/api/livestock/my-kraal`, null, headers);
  if (kraalRes.status === 200) {
    try {
      result.livestockIds = (kraalRes.json('livestock') || [])
        .map((l) => l.id)
        .filter(Boolean);
    } catch (_) { /* ignore */ }
  }

  // Fetch loan IDs for the realtime sub-scenario (public endpoint)
  const loansRes = getJson(`${BASE_URL}/api/loans`, { limit: 50 }, JSON_HEADERS);
  if (loansRes.status === 200) {
    try {
      result.loanIds = (loansRes.json('loans') || [])
        .map((l) => l.contractLoanId || l.id)
        .filter(Boolean);
    } catch (_) { /* ignore */ }
  }

  console.log(
    `setup: ${result.livestockIds.length} livestock IDs, ${result.loanIds.length} loan IDs`
  );
  return result;
}

// ─── Sub-scenario A: Oracle updates (PATCH /api/livestock/:id) ───────────────
export function oracleUpdateScenario(data) {
  if (!FARMER_TOKEN || data.livestockIds.length === 0) {
    sleep(1);
    return;
  }

  const livestockId = data.livestockIds[__VU % data.livestockIds.length];
  const headers     = authHeaders(FARMER_TOKEN);
  const payload     = randomOraclePriceUpdatePayload();

  const res = patchJson(`${BASE_URL}/api/livestock/${livestockId}`, payload, headers);

  checkDbContention(res);

  assertResponse(res, 'PATCH /api/livestock/:id (oracle update)', {
    'status 200, 403, or 404': (r) => [200, 403, 404].includes(r.status),
    'has body':                (r) => r.body !== null && r.body.length > 0,
  });

  sleep(THINK_TIME_S);
}

// ─── Sub-scenario B: Realtime loan state (GET /api/loans/:id?realtime=true) ───
export function loanRealtimeScenario(data) {
  // Market listing to pick a loan ID if cache is empty
  let loanIds = data.loanIds;

  if (loanIds.length === 0) {
    const listRes = getJson(`${BASE_URL}/api/loans`, { limit: 20 }, JSON_HEADERS);
    if (listRes.status === 200) {
      try {
        loanIds = (listRes.json('loans') || [])
          .map((l) => l.contractLoanId || l.id)
          .filter(Boolean);
      } catch (_) { /* ignore */ }
    }
    if (loanIds.length === 0) {
      sleep(1);
      return;
    }
  }

  const loanId = loanIds[Math.floor(Math.random() * loanIds.length)];

  // Realtime call — hits Soroban RPC
  const res = getJson(`${BASE_URL}/api/loans/${loanId}`, { realtime: 'true' }, JSON_HEADERS);

  checkSorobanError(res);
  checkDbContention(res);

  assertResponse(res, 'GET /api/loans/:id?realtime=true', {
    'status is 200 or 404':     (r) => r.status === 200 || r.status === 404,
    'no 500 server error':      (r) => r.status !== 500,
  });

  if (res.status === 200) {
    assertResponse(res, 'realtime response shape', {
      'has loan field':      (r) => r.json('loan') !== undefined,
      'has onChainState':    (r) => r.json('onChainState') !== undefined,
    });
  }

  sleep(THINK_TIME_S);
}

// ─── Default export (not used — executor specifies exec functions) ─────────────
export default function () { /* intentionally empty */ }
