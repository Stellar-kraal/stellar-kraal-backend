/**
 * Scenario 04 — Bulk Loan Request Submissions
 * =============================================
 * Models: farmers simultaneously requesting loans against their verified
 * livestock collateral. This is the most write-heavy scenario because the
 * loan request handler runs 3 serial DB reads before responding.
 *
 * Endpoints exercised:
 *   POST /api/loans/request     (auth required, 3 DB reads + validation)
 *   GET  /api/loans/my          (auth required, borrower's own loans)
 *   GET  /api/loans             (public, market listing)
 *
 * Why it matters for bottleneck analysis:
 *   1. POST /loans/request has a serial chain:
 *        findUnique(livestock) → findFirst(activeLoan) → validate → respond
 *      Under 50–100 VUs, these serial reads create a queue on the SQLite
 *      write-ahead log — this scenario is specifically designed to expose that.
 *   2. 409 "active loan already exists" responses are expected when the same
 *      livestockId is reused — they are counted separately so they don't
 *      inflate the error rate.
 *   3. The scenario seeds livestock IDs in `setup()` so it doesn't depend on
 *      previous scenario runs. When FARMER_TOKEN is not set it degrades
 *      gracefully to only reading the market view.
 *
 * Requires: FARMER_TOKEN env var, and the token's user must have at least one
 *           VERIFIED livestock asset in the database.
 *
 * Run (standalone):
 *   k6 run -e BASE_URL=http://localhost:3001 \
 *          -e FARMER_TOKEN=<jwt> \
 *          src/tests/load/scenarios/04-loan-requests.js
 */

import { sleep, check, fail } from 'k6';
import { Counter } from 'k6/metrics';
import {
  BASE_URL, STANDARD_THRESHOLDS, THINK_TIME_S,
  FARMER_TOKEN, authHeaders, JSON_HEADERS,
} from '../lib/config.js';
import {
  assertResponse,
  loanRequestLatency,
  checkDbContention,
  postJson,
  getJson,
} from '../lib/helpers.js';

const conflictResponses = new Counter('loan_conflict_409');
const loanValidationErrors = new Counter('loan_validation_errors');

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    loan_requests: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10  },
        { duration: '60s', target: 10  },
        { duration: '20s', target: 50  },
        { duration: '60s', target: 50  },
        { duration: '20s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '20s', target: 0   },
      ],
      tags: { scenario: 'loan_requests' },
    },
  },
  thresholds: {
    ...STANDARD_THRESHOLDS,
    'loan_request_duration_ms': [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    'http_req_duration{scenario:loan_requests}': [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    // 409s are expected under high concurrency — not counted as failures
    'loan_conflict_409': ['count>=0'],
    'db_contention_errors': ['count<5'],
  },
};

// ─── Setup: probe for available livestock IDs ─────────────────────────────────
// Runs once before VUs start. Fetches verified livestock from the kraal.
export function setup() {
  if (!FARMER_TOKEN) return { livestockIds: [] };

  const headers = authHeaders(FARMER_TOKEN);

  // GET /api/livestock/my-kraal returns all of the farmer's livestock
  const res = getJson(`${BASE_URL}/api/livestock/my-kraal`, null, headers);

  if (res.status !== 200) {
    console.warn(`setup: GET /api/livestock/my-kraal returned ${res.status} — loan scenarios will use empty set`);
    return { livestockIds: [] };
  }

  let ids = [];
  try {
    const livestock = res.json('livestock') || [];
    // Only use VERIFIED assets (required by the loan endpoint)
    ids = livestock
      .filter((l) => l.verificationStatus === 'VERIFIED')
      .map((l) => l.id);
  } catch (e) {
    console.warn('setup: failed to parse livestock response', e.message);
  }

  console.log(`setup: found ${ids.length} verified livestock IDs for loan scenarios`);
  return { livestockIds: ids };
}

// ─── Default scenario ─────────────────────────────────────────────────────────
export default function (data) {
  // ── 1. Market view (always runs — no auth required) ───────────────────────
  const marketRes = getJson(`${BASE_URL}/api/loans`, { page: 1, limit: 20 }, JSON_HEADERS);

  checkDbContention(marketRes);

  assertResponse(marketRes, 'GET /api/loans (market)', {
    'status is 200':          (r) => r.status === 200,
    'has pagination envelope': (r) => typeof r.json('total') === 'number',
  });

  sleep(THINK_TIME_S * 0.5);

  // ── 2. Loan request (only if we have a token and verified livestock) ───────
  if (!FARMER_TOKEN || !data.livestockIds || data.livestockIds.length === 0) {
    sleep(THINK_TIME_S);
    return;
  }

  const headers = authHeaders(FARMER_TOKEN);

  // Pick a random livestock ID — multiple VUs may pick the same one,
  // deliberately stressing the duplicate-active-loan check
  const livestockId = data.livestockIds[Math.floor(Math.random() * data.livestockIds.length)];

  // Vary the principal (50–90% of a typical 1000 USDC collateral)
  const principalUSDC  = parseFloat((500 + Math.random() * 400).toFixed(2));
  const durationDays   = [30, 60, 90, 180][Math.floor(Math.random() * 4)];

  const reqStart = Date.now();
  const loanRes = postJson(
    `${BASE_URL}/api/loans/request`,
    { livestockId, principalUSDC, durationDays },
    headers,
  );
  loanRequestLatency.add(Date.now() - reqStart);

  checkDbContention(loanRes);

  // 200 = validated OK, 409 = active loan already exists (expected under load),
  // 422 = validation failed (principal > collateral), 403 = not owner
  if (loanRes.status === 409) {
    conflictResponses.add(1);
  } else if (loanRes.status === 422) {
    loanValidationErrors.add(1);
  }

  assertResponse(loanRes, 'POST /api/loans/request', {
    'status is 200, 409, 422, or 403': (r) => [200, 409, 422, 403].includes(r.status),
    'has body':                         (r) => r.body !== null && r.body.length > 0,
  });

  sleep(THINK_TIME_S);

  // ── 3. Borrower view of own loans ─────────────────────────────────────────
  const myLoansRes = getJson(`${BASE_URL}/api/loans/my`, null, headers);

  checkDbContention(myLoansRes);

  assertResponse(myLoansRes, 'GET /api/loans/my', {
    'status is 200': (r) => r.status === 200,
    'has count':     (r) => typeof r.json('count') === 'number',
  });

  sleep(THINK_TIME_S * 0.5);
}
