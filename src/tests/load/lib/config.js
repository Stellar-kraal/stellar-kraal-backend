/**
 * src/tests/load/lib/config.js
 *
 * Shared configuration and threshold definitions for all k6 load scenarios.
 * Import this in every scenario file to keep settings DRY.
 */

// ─── Target ────────────────────────────────────────────────────────────────────
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const FARMER_TOKEN  = __ENV.FARMER_TOKEN  || '';
export const INVESTOR_TOKEN = __ENV.INVESTOR_TOKEN || '';

// ─── VU counts ────────────────────────────────────────────────────────────────
export const VUS_LOW  = parseInt(__ENV.VUS_LOW  || '10',  10);
export const VUS_MID  = parseInt(__ENV.VUS_MID  || '50',  10);
export const VUS_HIGH = parseInt(__ENV.VUS_HIGH || '100', 10);

// ─── Durations ────────────────────────────────────────────────────────────────
export const DURATION        = __ENV.DURATION        || '60s';
export const SMOKE_DURATION  = __ENV.SMOKE_DURATION  || '30s';
export const SMOKE_VUS       = parseInt(__ENV.SMOKE_VUS || '10', 10);

// ─── Thresholds ────────────────────────────────────────────────────────────────
/**
 * p95 latency ceiling in milliseconds.
 * CI smoke test fails when this is breached.
 * Documented baseline: 2 000 ms (conservative — tighten after profiling).
 */
export const P95_THRESHOLD_MS     = parseInt(__ENV.P95_THRESHOLD_MS     || '2000', 10);
export const ERROR_RATE_THRESHOLD = parseFloat(__ENV.ERROR_RATE_THRESHOLD || '0.05');

// ─── Shared threshold blocks ───────────────────────────────────────────────────
/**
 * Standard thresholds applied to every scenario.
 * Scenarios may add per-metric thresholds on top.
 */
export const STANDARD_THRESHOLDS = {
  // Overall HTTP error rate
  http_req_failed: [`rate<${ERROR_RATE_THRESHOLD}`],
  // p95 response time
  http_req_duration: [`p(95)<${P95_THRESHOLD_MS}`],
  // p99 — informational, not a CI gate by default
  'http_req_duration{expected_response:true}': [`p(99)<${P95_THRESHOLD_MS * 2}`],
};

// ─── Common headers ─────────────────────────────────────────────────────────────
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

// ─── Sleep helpers ──────────────────────────────────────────────────────────────
/** Default think-time between requests (simulates human pacing) */
export const THINK_TIME_S = 0.5;
