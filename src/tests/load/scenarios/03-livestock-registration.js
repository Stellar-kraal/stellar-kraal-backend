/**
 * Scenario 03 — Livestock Registration (Appraisal Oracle Under Load)
 * ===================================================================
 * Models: farmers concurrently registering livestock assets.
 *
 * Endpoints exercised:
 *   POST /api/livestock/register       (auth required, triggers appraisal oracle)
 *   GET  /api/livestock/my-kraal       (auth required, reads own livestock)
 *   GET  /api/livestock/:id            (auth required, single record lookup)
 *   PATCH /api/livestock/:id           (auth required, metadata update)
 *
 * Why it matters for bottleneck analysis:
 *   1. POST /register has the most expensive path:
 *      JWT verify → duplicate-check DB read → appraisal oracle (async) →
 *      DB write → fire-and-forget Soroban mintCollateral.
 *   2. The duplicate-check on animalId uses a unique index — under concurrent
 *      inserts this exposes SQLite write-lock contention.
 *   3. The appraisal oracle calls two oracle adapters (allSettled) — measures
 *      whether promise fanout adds latency at scale.
 *   4. The fire-and-forget mintCollateral saturates the Soroban submission
 *      queue if many VUs register simultaneously.
 *
 * Requires: FARMER_TOKEN env var set to a valid JWT for a FARMER user.
 *
 * Run (standalone):
 *   k6 run -e BASE_URL=http://localhost:3001 \
 *          -e FARMER_TOKEN=<jwt> \
 *          src/tests/load/scenarios/03-livestock-registration.js
 */

import { sleep } from 'k6';
import {
  BASE_URL, STANDARD_THRESHOLDS, THINK_TIME_S,
  FARMER_TOKEN, authHeaders,
} from '../lib/config.js';
import {
  assertResponse,
  appraisalLatency,
  checkDbContention,
  checkSorobanError,
  randomLivestockPayload,
  postJson,
  getJson,
  patchJson,
} from '../lib/helpers.js';

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    livestock_registration: {
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
      tags: { scenario: 'livestock_registration' },
    },
  },
  thresholds: {
    ...STANDARD_THRESHOLDS,
    'appraisal_duration_ms': [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    'http_req_duration{scenario:livestock_registration}': [`p(95)<${__ENV.P95_THRESHOLD_MS || 2000}`],
    'db_contention_errors': ['count<5'],  // small allowance for SQLite busy retries
  },
};

// ─── Default scenario ─────────────────────────────────────────────────────────
export default function () {
  if (!FARMER_TOKEN) {
    // Graceful skip if no token — scenario will log errors but not crash
    sleep(1);
    return;
  }

  const headers = authHeaders(FARMER_TOKEN);

  // ── 1. Register a new livestock asset ─────────────────────────────────────
  const payload = randomLivestockPayload();

  const regStart = Date.now();
  const regRes = postJson(`${BASE_URL}/api/livestock/register`, payload, headers);
  appraisalLatency.add(Date.now() - regStart);

  checkDbContention(regRes);
  checkSorobanError(regRes);

  // Allow 201 (success) and 409 (duplicate animalId — expected under high concurrency)
  const regOk = assertResponse(regRes, 'POST /api/livestock/register', {
    'status is 201 or 409':    (r) => r.status === 201 || r.status === 409,
    'has livestock or error':  (r) => r.json('livestock') !== undefined || r.json('error') !== undefined,
  });

  let livestockId = null;
  if (regOk && regRes.status === 201) {
    try {
      livestockId = regRes.json('livestock.id');
    } catch (_) { /* ignore */ }
  }

  sleep(THINK_TIME_S);

  // ── 2. Fetch the farmer's kraal (list view) ────────────────────────────────
  const kraalRes = getJson(`${BASE_URL}/api/livestock/my-kraal`, null, headers);

  checkDbContention(kraalRes);

  assertResponse(kraalRes, 'GET /api/livestock/my-kraal', {
    'status is 200':    (r) => r.status === 200,
    'has count field':  (r) => typeof r.json('count') === 'number',
    'livestock array':  (r) => Array.isArray(r.json('livestock')),
  });

  sleep(THINK_TIME_S * 0.5);

  // ── 3. Fetch single livestock record ──────────────────────────────────────
  if (livestockId) {
    const singleRes = getJson(`${BASE_URL}/api/livestock/${livestockId}`, null, headers);

    checkDbContention(singleRes);

    assertResponse(singleRes, 'GET /api/livestock/:id', {
      'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    });

    sleep(THINK_TIME_S * 0.5);

    // ── 4. Update metadata (owner update path) ─────────────────────────────
    const updateRes = patchJson(
      `${BASE_URL}/api/livestock/${livestockId}`,
      { location: `Load Test Region ${__VU}` },
      headers,
    );

    checkDbContention(updateRes);

    assertResponse(updateRes, 'PATCH /api/livestock/:id', {
      'status is 200 or 403 or 404': (r) => [200, 403, 404].includes(r.status),
    });

    sleep(THINK_TIME_S * 0.5);
  }
}
