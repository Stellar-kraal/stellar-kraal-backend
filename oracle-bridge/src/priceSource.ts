/**
 * src/priceSource.ts
 *
 * Deliberately minimal price generator. Producing a realistic livestock
 * appraisal is the concern of the backend's appraisal service
 * (src/services/appraisal.service.ts) and out of scope for this DR-focused
 * bridge — this just needs *something* bounded and deterministic-ish to
 * submit periodically so the submission loop, backup cursor, and DR drill
 * have real behavior to exercise.
 */

const BASE_PRICE = 500;
const JITTER = 15;

export function getNextPrice(): number {
  const jitter = (Math.random() * 2 - 1) * JITTER;
  return Math.round((BASE_PRICE + jitter) * 100) / 100;
}
