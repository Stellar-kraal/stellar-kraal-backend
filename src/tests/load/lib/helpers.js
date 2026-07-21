/**
 * src/tests/load/lib/helpers.js
 *
 * Shared utility functions for k6 load test scenarios.
 */

import { check, fail } from 'k6';
import http from 'k6/http';
import { Trend, Counter, Rate } from 'k6/metrics';

// ─── Custom metrics ─────────────────────────────────────────────────────────────
/** Track appraisal oracle latency separately so it surfaces clearly in reports */
export const appraisalLatency   = new Trend('appraisal_duration_ms',   true);
export const loanRequestLatency = new Trend('loan_request_duration_ms', true);
export const marketQueryLatency = new Trend('market_query_duration_ms', true);
export const authLatency        = new Trend('auth_duration_ms',         true);
export const idempotencyHits    = new Counter('idempotency_cache_hits');
export const sorobanErrors      = new Counter('soroban_errors');
export const dbContentionErrors = new Counter('db_contention_errors');

// ─── Assertion helpers ──────────────────────────────────────────────────────────

/**
 * Assert an HTTP response against expected conditions.
 * Logs the URL and response body on failure to ease diagnosis.
 *
 * @param {object} res       - k6 Response object
 * @param {string} label     - Human-readable label for check names
 * @param {object} checks    - Map of check-name → boolean
 * @param {boolean} failFast - If true, call fail() on first failed check
 */
export function assertResponse(res, label, checks, failFast = false) {
  const results = check(res, checks);
  if (!results && failFast) {
    fail(`${label} failed: status=${res.status} body=${res.body?.slice(0, 200)}`);
  }
  return results;
}

/**
 * Check if the response indicates a database contention error (SQLite busy / locked).
 * Increments the dbContentionErrors counter when detected.
 */
export function checkDbContention(res) {
  const body = res.body || '';
  const isContention =
    res.status === 500 &&
    (body.includes('SQLITE_BUSY') ||
     body.includes('database is locked') ||
     body.includes('P2034'));

  if (isContention) {
    dbContentionErrors.add(1);
  }
  return isContention;
}

/**
 * Check if a response indicates a Soroban / RPC error.
 */
export function checkSorobanError(res) {
  const body = res.body || '';
  const isSoroban =
    res.status >= 500 &&
    (body.includes('Simulation failed') ||
     body.includes('Transaction submission failed') ||
     body.includes('rpc') ||
     body.includes('soroban'));

  if (isSoroban) {
    sorobanErrors.add(1);
  }
  return isSoroban;
}

// ─── Data generators ─────────────────────────────────────────────────────────────

const ANIMAL_TYPES  = ['CATTLE', 'GOAT', 'SHEEP', 'PIG', 'DONKEY'];
const BREEDS = {
  CATTLE: ['angus', 'brahman', 'hereford', 'local'],
  GOAT:   ['boer', 'kalahari', 'local'],
  SHEEP:  ['dorper', 'merino', 'local'],
  PIG:    ['large white', 'local'],
  DONKEY: ['local'],
};
const HEALTH_STATUSES = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'];

/**
 * Generate a random livestock registration payload.
 * Uses __VU and __ITER to ensure uniqueness across VUs and iterations.
 */
export function randomLivestockPayload() {
  const type   = ANIMAL_TYPES[Math.floor(Math.random() * ANIMAL_TYPES.length)];
  const breeds = BREEDS[type];
  const breed  = breeds[Math.floor(Math.random() * breeds.length)];

  return {
    animalId:     `LOAD-${__VU}-${__ITER}-${Date.now()}`,
    type,
    breed,
    weightKg:     Math.floor(50 + Math.random() * 500),
    ageMonths:    Math.floor(6  + Math.random() * 60),
    healthStatus: HEALTH_STATUSES[Math.floor(Math.random() * HEALTH_STATUSES.length)],
    location:     'Load Test Farm, ZA',
  };
}

/**
 * Generate oracle price update payload (simulates an admin pushing a price feed).
 * Maps to PATCH /api/livestock/:id with location/imageUrl overrides.
 */
export function randomOraclePriceUpdatePayload() {
  return {
    location:  `Region-${Math.floor(Math.random() * 10)}, ZA`,
    imageUrl:  `https://cdn.example.com/load-test/${__VU}-${__ITER}.jpg`,
  };
}

// ─── HTTP wrappers ────────────────────────────────────────────────────────────────

/**
 * POST JSON helper — returns the k6 Response.
 */
export function postJson(url, payload, headers) {
  return http.post(url, JSON.stringify(payload), { headers });
}

/**
 * GET helper with optional query params.
 */
export function getJson(url, params, headers) {
  return http.get(
    params ? `${url}?${new URLSearchParams(params).toString()}` : url,
    { headers },
  );
}

/**
 * PATCH JSON helper.
 */
export function patchJson(url, payload, headers) {
  return http.patch(url, JSON.stringify(payload), { headers });
}
