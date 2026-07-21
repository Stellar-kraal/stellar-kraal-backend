import { Horizon } from '@stellar/stellar-sdk';
import { normalizeOperation } from '../../../src/monitoring/horizon/normalize';

/**
 * Captured from a live query against https://horizon-testnet.stellar.org/operations
 * (2026-07-20) to pin down Horizon's real invoke_host_function shape:
 * `parameters` is `[contractAddress, functionSymbol, ...args]` as base64 XDR ScVals.
 */
const SET_PRICE_RAW = {
  id: '15924317099413505',
  paging_token: '15924317099413505',
  transaction_successful: true,
  source_account: 'GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3',
  type: 'invoke_host_function',
  type_i: 24,
  created_at: '2026-07-20T13:56:57Z',
  transaction_hash: 'f450990af691198c64cd010aca611675cfc012094cd8f5f2308eb6bca9b42e51',
  function: 'HostFunctionTypeHostFunctionTypeInvokeContract',
  parameters: [
    { value: 'AAAAEgAAAAFWuK3fCnJ8I3roRKY2iFXwdQmbKo4oTIAu8AQ2jTY29Q==', type: 'Address' },
    { value: 'AAAADwAAAAlzZXRfcHJpY2UAAAA=', type: 'Sym' },
    { value: 'AAAAEgAAAAAAAAAACQ6ijYTtv12QL5kdVsp5tpcXyFEMAekw86jVTpUIEE4=', type: 'Address' },
    { value: 'AAAADwAAAAZFVEhVU0QAAA==', type: 'Sym' },
    { value: 'AAAACgAAAAAAAAAAAAAABFYoSXA=', type: 'I128' },
  ],
  address: '',
  salt: '',
  asset_balance_changes: null,
};

const SET_PRICE_OPERATION = SET_PRICE_RAW as unknown as Horizon.ServerApi.OperationRecord;

const PAYMENT_OPERATION = {
  id: '15924317099413505',
  type: 'payment',
  type_i: 1,
  transaction_successful: true,
  source_account: 'GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3',
  created_at: '2026-07-20T13:56:57Z',
  transaction_hash: 'f450990af691198c64cd010aca611675cfc012094cd8f5f2308eb6bca9b42e51',
  from: 'GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3',
  to: 'GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3',
  asset_type: 'native',
  amount: '10.0000000',
} as unknown as Horizon.ServerApi.OperationRecord;

describe('normalizeOperation', () => {
  it('decodes contract address, function name, and args from a live-shaped invoke_host_function record', () => {
    const result = normalizeOperation(SET_PRICE_OPERATION);

    expect(result).not.toBeNull();
    expect(result?.contractId).toBe('CBLLRLO7BJZHYI325BCKMNUIKXYHKCM3FKHCQTEAF3YAINUNGY3PLNYD');
    expect(result?.functionName).toBe('set_price');
    expect(result?.sourceAccount).toBe('GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3');
    expect(result?.txHash).toBe('f450990af691198c64cd010aca611675cfc012094cd8f5f2308eb6bca9b42e51');
    expect(result?.successful).toBe(true);
    expect(result?.ledger).toBe(3707669);
    expect(result?.args).toEqual(['GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3', 'ETHUSD', 18625350000n]);
  });

  it('returns null for non invoke_host_function operations', () => {
    expect(normalizeOperation(PAYMENT_OPERATION)).toBeNull();
  });

  it('returns null when there are fewer than 2 parameters', () => {
    const op = {
      ...SET_PRICE_RAW,
      parameters: [SET_PRICE_RAW.parameters[0]],
    } as unknown as Horizon.ServerApi.OperationRecord;

    expect(normalizeOperation(op)).toBeNull();
  });

  it('propagates transaction_successful=false for failed invocations', () => {
    const op = { ...SET_PRICE_OPERATION, transaction_successful: false } as unknown as Horizon.ServerApi.OperationRecord;
    expect(normalizeOperation(op)?.successful).toBe(false);
  });
});
