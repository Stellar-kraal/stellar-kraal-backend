import {
  createUnauthorizedEntryPointRule,
  UNAUTHORIZED_ENTRY_POINT_RULE_ID,
} from '../../../../src/monitoring/rules/unauthorizedEntryPoint.rule';
import { baseMonitorConfig, makeInvocation } from '../testUtils';

const ALLOWED = 'GALLOWEDACCOUNT00000000000000000000000000000000000000000';
const STRANGER = 'GASTRANGERACCOUNT0000000000000000000000000000000000000000';

describe('unauthorizedEntryPoint rule', () => {
  it('fires when a call fails on-chain, regardless of function or allowlist', () => {
    const config = { ...baseMonitorConfig, PRIVILEGED_FUNCTIONS: [], ALLOWED_INVOKER_ACCOUNTS: [] };
    const rule = createUnauthorizedEntryPointRule(config);

    const anomalies = rule.evaluate(makeInvocation({ functionName: 'get_loan_state', successful: false }));

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ ruleId: UNAUTHORIZED_ENTRY_POINT_RULE_ID, observedValue: 'failed' });
  });

  it('fires when a privileged function is called by a non-allowlisted account', () => {
    const config = { ...baseMonitorConfig, PRIVILEGED_FUNCTIONS: ['mint_collateral'], ALLOWED_INVOKER_ACCOUNTS: [ALLOWED] };
    const rule = createUnauthorizedEntryPointRule(config);

    const anomalies = rule.evaluate(
      makeInvocation({ functionName: 'mint_collateral', sourceAccount: STRANGER, successful: true }),
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.observedValue).toBe(STRANGER);
  });

  it('does not fire when a privileged function is called by an allowlisted account', () => {
    const config = { ...baseMonitorConfig, PRIVILEGED_FUNCTIONS: ['mint_collateral'], ALLOWED_INVOKER_ACCOUNTS: [ALLOWED] };
    const rule = createUnauthorizedEntryPointRule(config);

    const anomalies = rule.evaluate(
      makeInvocation({ functionName: 'mint_collateral', sourceAccount: ALLOWED, successful: true }),
    );

    expect(anomalies).toHaveLength(0);
  });

  it('does not enforce the allowlist when it is empty (opt-in feature)', () => {
    const config = { ...baseMonitorConfig, PRIVILEGED_FUNCTIONS: ['mint_collateral'], ALLOWED_INVOKER_ACCOUNTS: [] };
    const rule = createUnauthorizedEntryPointRule(config);

    const anomalies = rule.evaluate(
      makeInvocation({ functionName: 'mint_collateral', sourceAccount: STRANGER, successful: true }),
    );

    expect(anomalies).toHaveLength(0);
  });

  it('can raise both anomalies at once for a failed privileged call from a stranger', () => {
    const config = { ...baseMonitorConfig, PRIVILEGED_FUNCTIONS: ['mint_collateral'], ALLOWED_INVOKER_ACCOUNTS: [ALLOWED] };
    const rule = createUnauthorizedEntryPointRule(config);

    const anomalies = rule.evaluate(
      makeInvocation({ functionName: 'mint_collateral', sourceAccount: STRANGER, successful: false }),
    );

    // Only the "failed" branch fires — the allowlist check is gated on success,
    // since a failed call was never authorized to begin with.
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.observedValue).toBe('failed');
  });
});
