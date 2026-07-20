import { createLargeValueRule, LARGE_VALUE_RULE_ID } from '../../../../src/monitoring/rules/largeValue.rule';
import { baseMonitorConfig, makeInvocation } from '../testUtils';

describe('largeValue rule', () => {
  const config = { ...baseMonitorConfig, LARGE_VALUE_FUNCTIONS: ['mint_collateral'], LARGE_VALUE_THRESHOLD: 50_000 };

  it('fires when a watched function moves a value above the threshold', () => {
    const rule = createLargeValueRule(config);
    const invocation = makeInvocation({ functionName: 'mint_collateral', args: [123_456] });

    const anomalies = rule.evaluate(invocation);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      ruleId: LARGE_VALUE_RULE_ID,
      severity: 'critical',
      observedValue: '123456',
      thresholdValue: '50000',
    });
  });

  it('normalizes bigint (i128) args using the 7-decimal fixed-point convention', () => {
    const rule = createLargeValueRule(config);
    // 600000 * 1e7, matching how mint_collateral encodes USDC on-chain
    const invocation = makeInvocation({ functionName: 'mint_collateral', args: [600_000_0000000n] });

    const anomalies = rule.evaluate(invocation);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.observedValue).toBe('600000');
  });

  it('does not fire under the threshold', () => {
    const rule = createLargeValueRule(config);
    const invocation = makeInvocation({ functionName: 'mint_collateral', args: [1_000] });
    expect(rule.evaluate(invocation)).toHaveLength(0);
  });

  it('ignores functions outside the watch list', () => {
    const rule = createLargeValueRule(config);
    const invocation = makeInvocation({ functionName: 'get_loan_state', args: [999_999] });
    expect(rule.evaluate(invocation)).toHaveLength(0);
  });

  it('ignores failed invocations', () => {
    const rule = createLargeValueRule(config);
    const invocation = makeInvocation({ functionName: 'mint_collateral', args: [999_999], successful: false });
    expect(rule.evaluate(invocation)).toHaveLength(0);
  });
});
