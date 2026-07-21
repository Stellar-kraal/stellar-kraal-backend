#!/usr/bin/env node
/**
 * src/tests/load/scripts/generate-tokens.mjs
 *
 * Generates long-lived JWTs for load test use.
 *
 * Prerequisites:
 *   1. Backend is NOT required — this script calls the auth service directly.
 *   2. You need a .env or .env.load file with JWT_SECRET defined.
 *
 * Usage:
 *   node src/tests/load/scripts/generate-tokens.mjs
 *
 * Output (copy into .env.load):
 *   FARMER_TOKEN=<jwt>
 *   INVESTOR_TOKEN=<jwt>
 *
 * The tokens are issued for synthetic users that must exist in the database.
 * If running against a real instance, use the /api/auth/challenge flow instead
 * (see src/tests/load/scripts/auth-via-sep10.mjs).
 *
 * WARNING: Do not use production JWT_SECRET values here.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

// Load env from project root
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// Try .env.load first, then fall back to .env.test
let envFile;
for (const name of ['.env.load', '.env.test', '.env.example']) {
  try {
    envFile = readFileSync(join(projectRoot, name), 'utf8');
    break;
  } catch { /* not found */ }
}

if (envFile) {
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const jwt = require('jsonwebtoken');

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET || JWT_SECRET.includes('change_in_production')) {
  console.error('ERROR: JWT_SECRET is not set or is the default placeholder.');
  console.error('Set JWT_SECRET in .env.load before generating tokens.');
  process.exit(1);
}

/**
 * Synthetic user IDs — these must match real records in the DB
 * when the load test is run against a live server.
 * Update FARMER_USER_ID / INVESTOR_USER_ID to real cuid values from your DB.
 *
 * Alternatively, override via env vars:
 *   LOAD_FARMER_ID=cl... node generate-tokens.mjs
 */
const FARMER_USER_ID   = process.env.LOAD_FARMER_ID   || 'load-test-farmer-001';
const INVESTOR_USER_ID = process.env.LOAD_INVESTOR_ID || 'load-test-investor-001';
const FARMER_KEY       = process.env.LOAD_FARMER_KEY   || 'GLOAD1FARMERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const INVESTOR_KEY     = process.env.LOAD_INVESTOR_KEY || 'GLOAD2INVESTORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

function issueToken(sub, publicKey, role) {
  return jwt.sign(
    { sub, publicKey, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' },
  );
}

const farmerToken   = issueToken(FARMER_USER_ID,   FARMER_KEY,   'FARMER');
const investorToken = issueToken(INVESTOR_USER_ID,  INVESTOR_KEY, 'INVESTOR');

console.log('\n# ─── Load Test Tokens ─────────────────────────────────────────');
console.log('# Add the following to .env.load (or export as env vars):');
console.log('#');
console.log(`FARMER_TOKEN=${farmerToken}`);
console.log(`INVESTOR_TOKEN=${investorToken}`);
console.log('#');
console.log('# Token metadata:');
console.log(`#   FARMER   sub=${FARMER_USER_ID}  key=${FARMER_KEY.slice(0, 12)}...`);
console.log(`#   INVESTOR sub=${INVESTOR_USER_ID} key=${INVESTOR_KEY.slice(0, 12)}...`);
console.log('#');
console.log('# IMPORTANT: Ensure these user IDs exist in your database before running load tests.');
console.log('# ─────────────────────────────────────────────────────────────────\n');
