/**
 * src/monitoring/horizon/normalize.ts
 *
 * Decodes a raw Horizon `invoke_host_function` operation record into a
 * NormalizedInvocation the anomaly rules can work with.
 *
 * Horizon flattens the XDR `InvokeContractArgs` into a `parameters` array
 * of base64-encoded ScVals: `[contractAddress, functionNameSymbol, ...args]`
 * (verified against a live testnet Horizon response — see
 * `tests/unit/monitoring/normalize.test.ts` for the captured fixture).
 */

import { Horizon, xdr, scValToNative } from '@stellar/stellar-sdk';
import { createLogger } from '../logger';
import { NormalizedInvocation } from '../types';

const log = createLogger('horizon-normalize');

function decodeScVal(base64Value: string): unknown {
  const scVal = xdr.ScVal.fromXDR(base64Value, 'base64');
  return scValToNative(scVal);
}

/**
 * Horizon operation `id` is a TOID: the top 32 bits are the ledger
 * sequence. See https://developers.stellar.org/docs/data/horizon/api-reference/resources/operations
 */
function ledgerFromOperationId(id: string): number {
  return Number(BigInt(id) >> 32n);
}

/**
 * @returns null if the operation isn't an invoke_host_function call, or its
 * parameters couldn't be decoded into a [contract, function, ...args] shape.
 */
export function normalizeOperation(op: Horizon.ServerApi.OperationRecord): NormalizedInvocation | null {
  if (op.type !== Horizon.HorizonApi.OperationResponseType.invokeHostFunction) return null;

  const params = op.parameters ?? [];
  if (params.length < 2) {
    log.debug('invoke_host_function op with too few parameters, skipping', { opId: op.id });
    return null;
  }

  let contractId: string | null = null;
  let functionName: string | null = null;
  const args: unknown[] = [];

  try {
    const contractValue = decodeScVal(params[0]!.value);
    contractId = typeof contractValue === 'string' ? contractValue : String(contractValue);
  } catch (err) {
    log.warn('Failed to decode contract address parameter', { opId: op.id, err });
  }

  try {
    const fnValue = decodeScVal(params[1]!.value);
    functionName = typeof fnValue === 'string' ? fnValue : null;
  } catch (err) {
    log.warn('Failed to decode function name parameter', { opId: op.id, err });
  }

  for (const param of params.slice(2)) {
    try {
      args.push(decodeScVal(param.value));
    } catch (err) {
      log.debug('Failed to decode invocation argument, skipping it', { opId: op.id, err });
    }
  }

  if (!contractId) return null;

  return {
    operationId: op.id,
    contractId,
    txHash: op.transaction_hash,
    ledger: ledgerFromOperationId(op.id),
    occurredAt: op.created_at,
    sourceAccount: op.source_account,
    functionName,
    args,
    successful: op.transaction_successful,
  };
}
