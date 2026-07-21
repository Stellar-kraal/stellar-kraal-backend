/**
 * src/soroban.ts
 *
 * Soroban RPC client for the bridge's one on-chain responsibility:
 * submitting a price via the contract's `submit_price(oracle, price)`
 * entry point (contracts/stellarkraal/src/lib.rs).
 *
 * When config.dryRun is true (the default), submitPrice() never touches
 * the network — it logs what it would have submitted. This keeps the DR
 * drill, CI, and local dev fully self-contained with mock secrets and no
 * funded testnet account, rather than repeating the live-secrets problem
 * documented in issue #9 (E2E workflow).
 */

import {
  SorobanRpc,
  Keypair,
  Networks,
  TransactionBuilder,
  Contract,
  Address,
  nativeToScVal,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { logger } from './logger';

const NETWORK_PASSPHRASE: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
  standalone: Networks.STANDALONE,
};

export interface SubmitPriceOptions {
  rpcUrl: string;
  network: string;
  contractId: string;
  signingSecret: string;
  price: number;
  dryRun: boolean;
}

export interface SubmitPriceResult {
  dryRun: boolean;
  txHash: string | null;
  price: number;
}

export async function submitPrice(opts: SubmitPriceOptions): Promise<SubmitPriceResult> {
  const oracleKeypair = Keypair.fromSecret(opts.signingSecret);
  const priceStroops = BigInt(Math.round(opts.price * 1e7));

  if (opts.dryRun) {
    logger.info('DRY_RUN: would submit price', {
      oracle: oracleKeypair.publicKey(),
      contractId: opts.contractId,
      price: opts.price,
    });
    return { dryRun: true, txHash: null, price: opts.price };
  }

  const rpc = new SorobanRpc.Server(opts.rpcUrl, { allowHttp: false });
  const account = await rpc.getAccount(oracleKeypair.publicKey());
  const contract = new Contract(opts.contractId);
  const networkPassphrase = NETWORK_PASSPHRASE[opts.network] ?? Networks.TESTNET;

  const builtTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(
      contract.call(
        'submit_price',
        new Address(oracleKeypair.publicKey()).toScVal(),
        nativeToScVal(priceStroops, { type: 'i128' }),
      ),
    )
    .setTimeout(30)
    .build();

  const simResult = await rpc.simulateTransaction(builtTx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`submit_price simulation failed: ${simResult.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(builtTx, simResult).build();
  prepared.sign(oracleKeypair);

  const sendResult = await rpc.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`submit_price transaction failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  logger.info('Price submitted on-chain', { txHash: sendResult.hash, price: opts.price });
  return { dryRun: false, txHash: sendResult.hash, price: opts.price };
}
