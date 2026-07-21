/**
 * src/tests/load/smoke/ci-smoke.js
 *
 * CI Smoke Load Test — 10 VUs, 30 seconds
 * =========================================
 * This is the required check that runs on every PR.
 * It fails if p95 latency exceeds P95_THRESHOLD_MS (default: 2 000 ms).
 *
 * The test exercises all critical paths in the same 30-second window:
 *   - GET /health
 *   - GET /api/auth/challenge
 *   - GET /api/loans              (market listing)
 *   - GET /api/livestock/my-kraal (auth required)
 *   - POST /api/livestock/register (auth required)
 *   - POST /api/loans/request     (auth required)
 *
 * Exit codes:
 *   0 — all thresholds passed
 *   1 — one or more thresholds failed (k6 default)
 *
 * Run locally:
 *   k6 run -e BASE_URL=http://localhost:3001 \
 *          -e FARMER_TOKEN=<jwt> \
 *          src/tests/load/smoke/ci-smoke.js
 *
 * In CI (see .github/workflows/load-test.yml):
 *   k6 run --out json=load-results/smoke.json \
 *          -e BASE_URL=${{ env.API_URL }} \
 *          -e FARMER_TOKEN=${{ secrets.LOAD_FARMER_TOKEN }} \
 *          src/tests/load/smoke/ci-smoke.js
 */

import { sleep } from 'k6';
import {
  BASE_URL,
  FARMER_TOKEN,
  SMOKE_VUS,
  SMOKE_DURATION,
  P95_THRESHOLD_MS,
  ERROR_RATE_THRESHOLD,
  authHeaders,
  JSON_HEADERS,
  THINK_TIME_S,
} from '../lib/config.js';
import {
  assertResponse,
  checkDbContention,
  randomLivestockPayload,
  getJson,
  postJson,
} from '../lib/helpers.js';

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s',         target: SMOKE_VUS },
        { duration: SMOKE_DURATION, target: SMOKE_VUS },
        { duration: '5s',          target: 0 },
      ],
      tags: { scenario: 'smoke' },
    },
  },
  thresholds: {
    // ── CI gate — these must pass for the PR check to go green ──────────────
    'http_req_failed':                       [`rate<${ERROR_RATE_THRESHOLD}`],
    'http_req_duration':                     [`p(95)<${P95_THRESHOLD_MS}`],
    'http_req_duration{scenario:smoke}':     [`p(95)<${P95_THRESHOLD_MS}`],
    // p99 is informational in CI but hard limit at 2× the p95 threshold
    'http_req_duration{expected_response:true}': [`p(99)<${P95_THRESHOLD_MS * 2}`],
    // DB contention must be zero in a smoke run
    'db_contention_errors': ['count<1'],
  },
};

// ─── Default scenario ─────────────────────────────────────────────────────────
export default function () {
  const vuGroup = __VU % 4;  // 4 VU groups → different traffic patterns

  switch (vuGroup) {
    case 0:
      // Health + challenge (lightweight probe)
      smokeHealthAndChallenge();
      break;
    case 1:
      // Market listing (public, read-heavy)
      smokeMarketListing();
      break;
    case 2:
      // Authenticated reads (my-kraal)
      smokeAuthenticatedRead();
      break;
    case 3:
    default:
      // Write paths (register + loan request)
      smokeWritePaths();
      break;
  }
}

// ─── Sub-functions ────────────────────────────────────────────────────────────

function smokeHealthAndChallenge() {
  const healthRes = getJson(`${BASE_URL}/health`, null, JSON_HEADERS);
  assertResponse(healthRes, 'smoke: GET /health', {
    'status 200': (r) => r.status === 200,
  });
  sleep(THINK_TIME_S * 0.5);

  const challengeRes = getJson(
    `${BASE_URL}/api/auth/challenge`,
    { publicKey: 'GBQN4LHVFMSGXM43AKY4MVUSDLCKHAQSHHSLDSLVHVNRSYCRPHIMVKGE' },
    JSON_HEADERS,
  );
  assertResponse(challengeRes, 'smoke: GET /api/auth/challenge', {
    'status 200': (r) => r.status === 200,
    'has transaction': (r) => typeof r.json('transaction') === 'string',
  });
  sleep(THINK_TIME_S);
}

function smokeMarketListing() {
  const res = getJson(`${BASE_URL}/api/loans`, { page: 1, limit: 20 }, JSON_HEADERS);
  checkDbContention(res);
  assertResponse(res, 'smoke: GET /api/loans', {
    'status 200': (r) => r.status === 200,
    'has total':  (r) => typeof r.json('total') === 'number',
  });
  sleep(THINK_TIME_S);
}

function smokeAuthenticatedRead() {
  if (!FARMER_TOKEN) { sleep(THINK_TIME_S); return; }

  const res = getJson(`${BASE_URL}/api/livestock/my-kraal`, null, authHeaders(FARMER_TOKEN));
  checkDbContention(res);
  assertResponse(res, 'smoke: GET /api/livestock/my-kraal', {
    'status 200': (r) => r.status === 200,
    'has count':  (r) => typeof r.json('count') === 'number',
  });
  sleep(THINK_TIME_S);
}

function smokeWritePaths() {
  if (!FARMER_TOKEN) { sleep(THINK_TIME_S); return; }

  const headers = authHeaders(FARMER_TOKEN);

  // Register livestock
  const regRes = postJson(
    `${BASE_URL}/api/livestock/register`,
    randomLivestockPayload(),
    headers,
  );
  checkDbContention(regRes);
  assertResponse(regRes, 'smoke: POST /api/livestock/register', {
    'status 201 or 409': (r) => r.status === 201 || r.status === 409,
  });
  sleep(THINK_TIME_S * 0.5);

  // Loan request against synthetic livestock ID (likely 404 — measures validation path)
  const loanRes = postJson(
    `${BASE_URL}/api/loans/request`,
    { livestockId: 'smoke-test-id', principalUSDC: 100, durationDays: 30 },
    headers,
  );
  // 404 is expected and correct here — we're measuring the validation chain latency
  assertResponse(loanRes, 'smoke: POST /api/loans/request', {
    'status is not 500': (r) => r.status !== 500,
    'has body':          (r) => r.body !== null && r.body.length > 0,
  });
  sleep(THINK_TIME_S);
}
