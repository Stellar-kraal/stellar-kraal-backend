/**
 * src/services/soroban.service.ts
 *
 * Soroban interaction service.
 *
 * Responsibilities:
 *  1. Build & submit transactions (mintCollateral / appraiseAsset)
 *  2. Simulate read-only contract calls (getLoanState)
 *  3. Poll Soroban events and sync into SQLite (event indexer)
 *
 * On-chain events tracked:
 *   - LoanCreated  → create/update Loan record
 *   - LoanRepaid   → mark loan REPAID
 *   - AssetLiquidated → mark loan LIQUIDATED
 */

import {
  SorobanRpc,
  Keypair,
  Networks,
  TransactionBuilder,
  Contract,
  xdr,
  scValToNative,
  nativeToScVal,
  Address,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { createLogger } from '../lib/logger';
import { env } from '../config/env';
import prisma from '../lib/prisma';
import { LoanStatus, VerificationStatus } from '../types/domain';

const log = createLogger('soroban');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NETWORK_PASSPHRASE: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
  standalone: Networks.STANDALONE,
};

function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASE[env.STELLAR_NETWORK] ?? Networks.TESTNET;
}

/** Lazily created RPC server instance */
let _rpcServer: SorobanRpc.Server | null = null;

function getRpc(): SorobanRpc.Server {
  if (!_rpcServer) {
    _rpcServer = new SorobanRpc.Server(env.RPC_URL, {
      allowHttp: env.NODE_ENV !== 'production',
    });
  }
  return _rpcServer;
}

// ─── Transaction Submission ───────────────────────────────────────────────────

/**
 * Build a signed Soroban transaction calling a contract function,
 * simulate it, then submit.
 *
 * @param functionName  Contract function to invoke
 * @param args          XDR ScVal arguments
 * @returns             Transaction hash
 */
export async function invokeContract(
  functionName: string,
  args: xdr.ScVal[],
): Promise<string> {
  const serverKeypair = Keypair.fromSecret(env.SERVER_SECRET_KEY);
  const rpc = getRpc();

  // Fetch the server account (for sequence number)
  const account = await rpc.getAccount(serverKeypair.publicKey());

  const contract = new Contract(env.CONTRACT_ID);

  // Fetch current ledger for ledger-bound enforcement (Surface 4 replay mitigation)
  // Transactions are only valid within a ~100-ledger window (~8 minutes at 5 s/ledger).
  // This prevents delayed or replayed transaction submission.
  const LEDGER_BOUND_WINDOW = 100;
  let minLedger: number | undefined;
  let maxLedger: number | undefined;
  try {
    const latestLedger = await rpc.getLatestLedger();
    minLedger = latestLedger.sequence;
    maxLedger = latestLedger.sequence + LEDGER_BOUND_WINDOW;
    log.debug('Applying ledger bounds', { minLedger, maxLedger, functionName });
  } catch (err) {
    log.warn('Could not fetch latest ledger for bounds; proceeding without ledger bounds', { err });
  }

  // Build the transaction
  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(30);

  // Apply ledger bounds when available (high-value replay mitigation).
  // Prevents delayed or replayed transaction submission outside the valid window.
  if (minLedger !== undefined && maxLedger !== undefined) {
    txBuilder.setLedgerbounds(minLedger, maxLedger);
  }

  const builtTx = txBuilder.build();

  // Simulate to get resource fees
  const simResult = await rpc.simulateTransaction(builtTx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Assemble (adds soroban data, bumps fee) and sign
  const preparedTx = SorobanRpc.assembleTransaction(
    builtTx,
    simResult,
  ).build();

  preparedTx.sign(serverKeypair);

  // Submit
  const sendResult = await rpc.sendTransaction(preparedTx);

  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const txHash = sendResult.hash;
  log.info('Transaction submitted', { txHash, functionName });

  // Wait for confirmation
  await waitForTransaction(txHash);

  return txHash;
}

/** Poll until the transaction is confirmed (SUCCESS) or fails. */
async function waitForTransaction(
  txHash: string,
  maxAttempts = 20,
  delayMs = 3000,
): Promise<void> {
  const rpc = getRpc();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(delayMs);

    const result = await rpc.getTransaction(txHash);

    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      log.info('Transaction confirmed', { txHash });
      return;
    }

    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${txHash}`);
    }

    // NOT_FOUND or still pending — keep polling
    log.debug('Waiting for transaction', { txHash, attempt });
  }

  throw new Error(`Transaction ${txHash} not confirmed after ${maxAttempts} attempts`);
}

// ─── Oracle Calls ─────────────────────────────────────────────────────────────

/**
 * Invoke `mint_collateral` on the Soroban contract, registering the
 * appraised livestock value on-chain.
 *
 * @param livestockId   Off-chain livestock record ID
 * @param ownerPublicKey  Stellar address of the farmer
 * @param appraisedValueUSDC  Value in USDC (will be stored as stroops-equivalent)
 */
export async function mintCollateral(
  livestockId: string,
  ownerPublicKey: string,
  appraisedValueUSDC: number,
): Promise<string> {
  log.info('Invoking mint_collateral', { livestockId, appraisedValueUSDC });

  // Convert USDC to 7-decimal fixed-point (Stellar convention)
  const valueStroops = BigInt(Math.round(appraisedValueUSDC * 1e7));

  const args: xdr.ScVal[] = [
    nativeToScVal(livestockId, { type: 'string' }),
    new Address(ownerPublicKey).toScVal(),
    nativeToScVal(valueStroops, { type: 'i128' }),
  ];

  return invokeContract('mint_collateral', args);
}

// ─── Bulk Retirement Batching ─────────────────────────────────────────────────

export type RetirementChunkStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface RetirementTarget {
  id: string;
  contractLoanId: string;
}

export interface RetirementChunkResult {
  loanIds: string[];
  contractLoanIds: string[];
  status: RetirementChunkStatus;
  txHash?: string;
  error?: string;
}

/**
 * Retire (repay/close) a batch of loans on-chain.
 *
 * Splits the batch into sequential sub-transactions of at most
 * `env.SOROBAN_MAX_OPS_PER_TX` `retire_loan` operations each, to respect
 * Soroban transaction size limits. Chunks are submitted in order; if a
 * chunk fails on-chain, remaining chunks are not submitted and are
 * reported as SKIPPED — this keeps a single failure from cascading into
 * a pile of doomed transactions while still surfacing a per-credit result
 * for every loan in the original request.
 */
export async function retireLoansOnChain(
  loans: RetirementTarget[],
  maxOpsPerChunk: number = env.SOROBAN_MAX_OPS_PER_TX,
): Promise<RetirementChunkResult[]> {
  const chunks = chunkArray(loans, maxOpsPerChunk);
  const results: RetirementChunkResult[] = [];
  let aborted = false;

  for (const chunk of chunks) {
    const loanIds = chunk.map((l) => l.id);
    const contractLoanIds = chunk.map((l) => l.contractLoanId);

    if (aborted) {
      results.push({
        loanIds,
        contractLoanIds,
        status: 'SKIPPED',
        error: 'Skipped: an earlier batch in this request failed on-chain',
      });
      continue;
    }

    try {
      const txHash = await submitRetirementChunk(contractLoanIds);
      results.push({ loanIds, contractLoanIds, status: 'SUCCESS', txHash });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Retirement batch failed on-chain', { contractLoanIds, error: message });
      results.push({ loanIds, contractLoanIds, status: 'FAILED', error: message });
      aborted = true;
    }
  }

  return results;
}

/** Build, simulate, sign and submit a single transaction batching multiple `retire_loan` calls. */
async function submitRetirementChunk(contractLoanIds: string[]): Promise<string> {
  const serverKeypair = Keypair.fromSecret(env.SERVER_SECRET_KEY);
  const rpc = getRpc();

  const account = await rpc.getAccount(serverKeypair.publicKey());
  const contract = new Contract(env.CONTRACT_ID);

  let txBuilder = new TransactionBuilder(account, {
    // Classic fee scales per operation packed into the transaction.
    fee: (Number(BASE_FEE) * contractLoanIds.length).toString(),
    networkPassphrase: getNetworkPassphrase(),
  });

  for (const contractLoanId of contractLoanIds) {
    txBuilder = txBuilder.addOperation(
      contract.call('retire_loan', nativeToScVal(contractLoanId, { type: 'string' })),
    );
  }

  const builtTx = txBuilder.setTimeout(30).build();

  const simResult = await rpc.simulateTransaction(builtTx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(builtTx, simResult).build();
  preparedTx.sign(serverKeypair);

  const sendResult = await rpc.sendTransaction(preparedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const txHash = sendResult.hash;
  log.info('Retirement batch transaction submitted', { txHash, count: contractLoanIds.length });

  await waitForTransaction(txHash);

  return txHash;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ─── Read-only Simulations ────────────────────────────────────────────────────

export interface OnChainLoanState {
  loanId: string;
  borrower: string;
  principalUSDC: number;
  interestRateBps: number;
  status: string;
  durationDays: number;
}

/**
 * Simulate a `get_loan_state` call — read-only, no fee.
 * Returns the real-time on-chain state for a given loan.
 */
export async function getLoanState(
  contractLoanId: string,
): Promise<OnChainLoanState | null> {
  const rpc = getRpc();
  const serverKeypair = Keypair.fromSecret(env.SERVER_SECRET_KEY);
  const account = await rpc.getAccount(serverKeypair.publicKey());

  const contract = new Contract(env.CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      contract.call(
        'get_loan_state',
        nativeToScVal(contractLoanId, { type: 'string' }),
      ),
    )
    .setTimeout(30)
    .build();

  const simResult = await rpc.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    log.warn('get_loan_state simulation error', { contractLoanId, error: simResult.error });
    return null;
  }

  const returnVal = simResult.result?.retval;
  if (!returnVal) return null;

  try {
    const native = scValToNative(returnVal) as Record<string, unknown>;
    return {
      loanId: contractLoanId,
      borrower: native['borrower'] as string,
      principalUSDC: Number(native['principal']) / 1e7,
      interestRateBps: Number(native['interest_rate_bps']),
      status: native['status'] as string,
      durationDays: Number(native['duration_days']),
    };
  } catch (err) {
    log.warn('Failed to decode loan state', { contractLoanId, err });
    return null;
  }
}

// ─── Event Indexer / Poller ───────────────────────────────────────────────────

/** Cursor tracking — persisted via the last synced ledger in the DB */
let currentStartLedger: number = env.START_LEDGER;
let pollerHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the Soroban event polling loop.
 * Runs every POLL_INTERVAL_MS milliseconds.
 */
export function startEventPoller(): void {
  if (pollerHandle) return; // already running

  log.info('Starting Soroban event poller', {
    intervalMs: env.POLL_INTERVAL_MS,
    startLedger: currentStartLedger,
  });

  pollerHandle = setInterval(() => {
    pollEvents().catch((err) => {
      log.error('Event poll error', { err });
    });
  }, env.POLL_INTERVAL_MS);
}

export function stopEventPoller(): void {
  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
    log.info('Soroban event poller stopped');
  }
}

/**
 * Fetch Soroban events from the RPC since the last polled ledger,
 * filter for our contract, and sync to the DB.
 */
async function pollEvents(): Promise<void> {
  const rpc = getRpc();

  const response = await rpc.getEvents({
    startLedger: currentStartLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [env.CONTRACT_ID],
      },
    ],
    limit: 100,
  });

  if (response.events.length === 0) return;

  log.debug('Fetched Soroban events', { count: response.events.length });

  for (const event of response.events) {
    await processEvent(event);
    // Advance cursor past this event's ledger
    currentStartLedger = Math.max(currentStartLedger, event.ledger + 1);
  }
}

type SorobanEvent = SorobanRpc.Api.EventResponse;

async function processEvent(event: SorobanEvent): Promise<void> {
  if (!event.topic || event.topic.length === 0) return;

  // The first topic is the event name by Soroban convention
  let eventName: string;
  try {
    eventName = scValToNative(event.topic[0]!) as string;
  } catch {
    return;
  }

  log.info('Processing on-chain event', { eventName, ledger: event.ledger });

  switch (eventName) {
    case 'LoanCreated':
      await handleLoanCreated(event);
      break;
    case 'LoanRepaid':
      await handleLoanStatusChange(event, 'REPAID');
      break;
    case 'AssetLiquidated':
      await handleLoanStatusChange(event, 'LIQUIDATED');
      break;
    default:
      log.debug('Unknown event, skipping', { eventName });
  }
}

async function handleLoanCreated(event: SorobanEvent): Promise<void> {
  try {
    const data = scValToNative(event.value) as Record<string, unknown>;

    const contractLoanId = String(data['loan_id']);
    const borrowerKey = String(data['borrower']);
    const principal = Number(data['principal']) / 1e7;
    const interestRateBps = Number(data['interest_rate_bps']);
    const durationDays = Number(data['duration_days']);
    const livestockId = String(data['collateral_id']);

    // Surface 5 replay mitigation: skip events that are not newer than the last
    // processed event ledger for this loan. Prevents replayed events from
    // rolling back terminal states (e.g. LIQUIDATED → ACTIVE).
    const existingLoan = await prisma.loan.findUnique({ where: { contractLoanId } });
    if (existingLoan && existingLoan.lastEventLedger !== null &&
        event.ledger <= existingLoan.lastEventLedger) {
      log.debug('Skipping replayed LoanCreated event (ledger not newer)', {
        contractLoanId,
        eventLedger: event.ledger,
        lastEventLedger: existingLoan.lastEventLedger,
      });
      return;
    }

    // Do not allow LoanCreated to override a terminal status
    if (existingLoan && ['REPAID', 'LIQUIDATED', 'DEFAULTED'].includes(existingLoan.status)) {
      log.debug('Skipping LoanCreated: loan already in terminal state', {
        contractLoanId,
        status: existingLoan.status,
      });
      return;
    }

    // Find the borrower user (they must already be registered)
    const borrower = await prisma.user.findUnique({
      where: { publicKey: borrowerKey },
    });
    if (!borrower) {
      log.warn('LoanCreated event: borrower not found', { borrowerKey });
      return;
    }

    // Find the livestock record
    const livestock = await prisma.livestock.findUnique({
      where: { animalId: livestockId },
    });
    if (!livestock) {
      log.warn('LoanCreated event: livestock not found', { livestockId });
      return;
    }

    await prisma.loan.upsert({
      where: { contractLoanId },
      create: {
        contractLoanId,
        borrowerId: borrower.id,
        livestockId: livestock.id,
        principalUSDC: principal,
        interestRateBps,
        durationDays,
        status: LoanStatus.ACTIVE,
        createdOnChainAt: new Date(),
        lastSyncedAt: new Date(),
        lastEventLedger: event.ledger,
      },
      update: {
        status: LoanStatus.ACTIVE,
        lastSyncedAt: new Date(),
        lastEventLedger: event.ledger,
      },
    });

    log.info('Loan indexed', { contractLoanId });
  } catch (err) {
    log.error('handleLoanCreated failed', { err });
  }
}

async function handleLoanStatusChange(
  event: SorobanEvent,
  status: 'REPAID' | 'LIQUIDATED',
): Promise<void> {
  try {
    const data = scValToNative(event.value) as Record<string, unknown>;
    const contractLoanId = String(data['loan_id']);

    // Surface 5 replay mitigation: discard events with ledger ≤ lastEventLedger
    const existingLoan = await prisma.loan.findUnique({ where: { contractLoanId } });
    if (existingLoan && existingLoan.lastEventLedger !== null &&
        event.ledger <= existingLoan.lastEventLedger) {
      log.debug('Skipping replayed status-change event (ledger not newer)', {
        contractLoanId,
        eventLedger: event.ledger,
        lastEventLedger: existingLoan.lastEventLedger,
        status,
      });
      return;
    }

    const updateData: Record<string, unknown> = {
      status: status === 'REPAID' ? LoanStatus.REPAID : LoanStatus.LIQUIDATED,
      lastSyncedAt: new Date(),
      lastEventLedger: event.ledger,
    };

    if (status === 'REPAID') updateData['repaidAt'] = new Date();
    if (status === 'LIQUIDATED') {
      updateData['liquidatedAt'] = new Date();

      // Mark collateral as available again if liquidated
      const loan = await prisma.loan.findUnique({
        where: { contractLoanId },
        include: { livestock: true },
      });
      if (loan?.livestock) {
        await prisma.livestock.update({
          where: { id: loan.livestock.id },
          data: { verificationStatus: VerificationStatus.VERIFIED },
        });
      }
    }

    await prisma.loan.update({
      where: { contractLoanId },
      data: updateData,
    });

    log.info(`Loan status updated to ${status}`, { contractLoanId });
  } catch (err) {
    log.error('handleLoanStatusChange failed', { err, status });
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
