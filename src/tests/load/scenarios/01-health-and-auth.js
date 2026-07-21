/**
 * Scenario 01 — Health Check & Authentication (SEP-10 Challenge/Response)
 * =========================================================================
 * Models: unauthenticated clients pinging /health, and new users requesting
 * a SEP-10 challenge (GET /api/auth/challenge).
 *
 * This is the lightest scenario and establishes the baseline for raw API
 * overhead — no DB writes, no oracle, no Soroban.
 *
 * Why it matters for bottleneck analysis:
 *   - If /health is slow under load → Express middleware stack or rate-limiter
 *     overhead is the problem.
 *   - If /api/auth/challenge is slow → in-memory nonce map contention or
 *     Stellar keypair validation is the bottleneck.
 *
 * Stages:
 *   Ramp 0→10 VUs over 15 s → sustain 60 s → ramp down 10 s
 *
 * Run (standalone):
 *   k6 run -e BASE_URL=http://localhost:3001 src/tests/load/scenarios/01-health-and-auth.js
 */

import { sleep } from 'k6';
import { BASE_URL, STANDARD_THRESHOLDS, THINK_TIME_S, JSON_HEADERS } from '../lib/config.js';
import { assertResponse, authLatency, getJson } from '../lib/helpers.js';

// ─── k6 options ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    health_check: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10  },
        { duration: '60s', target: 10  },
        { duration: '10s', target: 0   },
      ],
      tags: { scenario: 'health_check' },
    },
    auth_challenge: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10  },
        { duration: '60s', target: 10  },
        { duration: '10s', target: 0   },
      ],
      tags: { scenario: 'auth_challenge' },
      exec: 'authChallengeScenario',
    },
  },
  thresholds: {
    ...STANDARD_THRESHOLDS,
    // Health check should always be fast
    'http_req_duration{scenario:health_check}': ['p(95)<200'],
    // Challenge involves keypair validation — allow a bit more headroom
    'http_req_duration{scenario:auth_challenge}': ['p(95)<500'],
    'auth_duration_ms': ['p(95)<500'],
  },
};

// ─── Scenario: /health ────────────────────────────────────────────────────────
export default function () {
  const res = getJson(`${BASE_URL}/health`, null, JSON_HEADERS);

  assertResponse(res, 'GET /health', {
    'status is 200':           (r) => r.status === 200,
    'body has status ok':      (r) => r.json('status') === 'ok',
    'body has timestamp':      (r) => typeof r.json('timestamp') === 'string',
  });

  sleep(THINK_TIME_S);
}

// ─── Scenario: GET /api/auth/challenge ────────────────────────────────────────
// Uses a synthetic public key — we're not actually signing, just measuring
// the challenge-build time (nonce generation + XDR build).
const SAMPLE_KEYS = [
  'GBQN4LHVFMSGXM43AKY4MVUSDLCKHAQSHHSLDSLVHVNRSYCRPHIMVKGE',
  'GDHQXILZQOTLSQY4IYUQVZTLQNWMPZQWEGKHBTKWZZJCVQF5XKE5TFX6',
  'GC5UEGHV6JSM4RPJN2DPYV7HVKBIDKNFNXETM5ZC2PFGQFJ7KXQAHVLQ',
  'GASYMAQZ6EOOWJ7BGGE6JSVQHOMDBPJMJXQR3LCQNBHNBMJVZAXBMZJB',
  'GD6MQOQJLPWFMRQY5ZXEFVJVCLX5NPUIPYWC6QAKBQNZQNCUMUTJWJ2X',
];

export function authChallengeScenario() {
  const publicKey = SAMPLE_KEYS[__VU % SAMPLE_KEYS.length];

  const start = Date.now();
  const res = getJson(
    `${BASE_URL}/api/auth/challenge`,
    { publicKey },
    JSON_HEADERS,
  );
  authLatency.add(Date.now() - start);

  assertResponse(res, 'GET /api/auth/challenge', {
    'status is 200':            (r) => r.status === 200,
    'body has transaction':     (r) => typeof r.json('transaction') === 'string',
    'transaction is non-empty': (r) => (r.json('transaction') || '').length > 0,
  });

  sleep(THINK_TIME_S);
}
