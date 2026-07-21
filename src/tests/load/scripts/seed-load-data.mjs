#!/usr/bin/env node
/**
 * src/tests/load/scripts/seed-load-data.mjs
 *
 * Seeds the database with test data required for load testing:
 *   - 1 FARMER user + 1 INVESTOR user (with stable IDs)
 *   - N VERIFIED livestock records owned by the farmer
 *   - N ACTIVE loan records backed by those livestock
 *
 * This decouples load test setup from scenario execution — k6 VUs never
 * need to create their own data from scratch in most scenarios.
 *
 * Usage:
 *   node src/tests/load/scripts/seed-load-data.mjs [--livestock=50] [--loans=20]
 *
 * Options:
 *   --livestock=<n>   Number of livestock records to create (default: 50)
 *   --loans=<n>       Number of active loan records to create (default: 20)
 *   --clean           Delete existing load test data before seeding
 *
 * Prerequisites:
 *   DATABASE_URL must point to the target database.
 *   Run: npx prisma migrate deploy (or db:migrate) first.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// Load environment
for (const name of ['.env.load', '.env.test', '.env']) {
  try {
    const envFile = readFileSync(join(projectRoot, name), 'utf8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  } catch { /* not found */ }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, val] = a.slice(2).split('=');
      return [key, val ?? true];
    }),
);

const NUM_LIVESTOCK = parseInt(args.livestock || '50', 10);
const NUM_LOANS     = parseInt(args.loans     || '20', 10);
const CLEAN         = !!args.clean;

// Stable IDs so generate-tokens.mjs stays in sync
const FARMER_ID    = 'load-test-farmer-001';
const INVESTOR_ID  = 'load-test-investor-001';
const FARMER_KEY   = 'GLOAD1FARMERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const INVESTOR_KEY = 'GLOAD2INVESTORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const ANIMAL_TYPES    = ['CATTLE', 'GOAT', 'SHEEP', 'PIG', 'DONKEY'];
const HEALTH_STATUSES = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'];
const BREEDS          = { CATTLE: 'angus', GOAT: 'boer', SHEEP: 'dorper', PIG: 'large white', DONKEY: 'local' };

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

async function main() {
  console.log('─── StellarKraal Load Test Data Seeder ─────────────────────────');

  // ── Clean existing load test data ─────────────────────────────────────────
  if (CLEAN) {
    console.log('Cleaning existing load test data…');
    await prisma.loan.deleteMany({
      where: { borrowerId: { in: [FARMER_ID, INVESTOR_ID] } },
    });
    await prisma.livestock.deleteMany({ where: { ownerId: FARMER_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [FARMER_ID, INVESTOR_ID] } } });
    console.log('  ✓ Cleaned');
  }

  // ── Upsert farmer user ────────────────────────────────────────────────────
  const farmer = await prisma.user.upsert({
    where: { id: FARMER_ID },
    create: {
      id: FARMER_ID,
      publicKey: FARMER_KEY,
      role: 'FARMER',
      displayName: 'Load Test Farmer',
    },
    update: {},
  });
  console.log(`  ✓ Farmer user: ${farmer.id}`);

  // ── Upsert investor user ──────────────────────────────────────────────────
  const investor = await prisma.user.upsert({
    where: { id: INVESTOR_ID },
    create: {
      id: INVESTOR_ID,
      publicKey: INVESTOR_KEY,
      role: 'INVESTOR',
      displayName: 'Load Test Investor',
    },
    update: {},
  });
  console.log(`  ✓ Investor user: ${investor.id}`);

  // ── Create livestock records ──────────────────────────────────────────────
  console.log(`Creating ${NUM_LIVESTOCK} livestock records…`);
  const createdLivestock = [];

  for (let i = 0; i < NUM_LIVESTOCK; i++) {
    const type   = ANIMAL_TYPES[i % ANIMAL_TYPES.length];
    const health = HEALTH_STATUSES[i % HEALTH_STATUSES.length];
    const weight = rand(80, 550);

    const livestock = await prisma.livestock.upsert({
      where: { animalId: `LOAD-${i.toString().padStart(4, '0')}` },
      create: {
        animalId:          `LOAD-${i.toString().padStart(4, '0')}`,
        ownerId:           FARMER_ID,
        metadata:          JSON.stringify({
          type,
          breed:        BREEDS[type],
          weightKg:     weight,
          ageMonths:    rand(12, 72),
          healthStatus: health,
          location:     `Load Test Farm ${i % 5}, ZA`,
        }),
        appraisedValueUSDC: weight * 2.5 * 0.70,
        verificationStatus: 'VERIFIED',
        appraisalTxHash:    `load-test-tx-${i}`,
      },
      update: {},
    });
    createdLivestock.push(livestock);
  }
  console.log(`  ✓ ${createdLivestock.length} livestock records`);

  // ── Create active loan records ─────────────────────────────────────────────
  console.log(`Creating ${NUM_LOANS} active loan records…`);
  let loansCreated = 0;

  for (let i = 0; i < Math.min(NUM_LOANS, createdLivestock.length); i++) {
    const livestock = createdLivestock[i];
    const principal = parseFloat(((livestock.appraisedValueUSDC || 500) * 0.7).toFixed(2));

    await prisma.loan.upsert({
      where: { contractLoanId: `LOAD-LOAN-${i.toString().padStart(4, '0')}` },
      create: {
        contractLoanId:  `LOAD-LOAN-${i.toString().padStart(4, '0')}`,
        borrowerId:      FARMER_ID,
        livestockId:     livestock.id,
        principalUSDC:   principal,
        interestRateBps: 500,
        durationDays:    90,
        status:          'ACTIVE',
        createdOnChainAt: new Date(),
      },
      update: {},
    });
    loansCreated++;
  }
  console.log(`  ✓ ${loansCreated} loan records`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n─── Seed complete ───────────────────────────────────────────────');
  console.log(`Farmer ID:    ${FARMER_ID}`);
  console.log(`Investor ID:  ${INVESTOR_ID}`);
  console.log(`Livestock:    ${createdLivestock.length}`);
  console.log(`Loans:        ${loansCreated}`);
  console.log('\nNext step: generate tokens with:');
  console.log('  node src/tests/load/scripts/generate-tokens.mjs\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
