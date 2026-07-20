import { createOracleDeviationRule, ORACLE_DEVIATION_RULE_ID } from '../../../../src/monitoring/rules/oracleDeviation.rule';
import { baseMonitorConfig, makeInvocation } from '../testUtils';

describe('oracleDeviation rule', () => {
  const config = {
    ...baseMonitorConfig,
    ORACLE_PRICE_FUNCTIONS: ['set_price'],
    ORACLE_DEVIATION_THRESHOLD_PCT: 20,
    ORACLE_DEVIATION_MIN_SAMPLES: 3,
  };

  it('does not fire before the minimum sample count is reached', () => {
    const rule = createOracleDeviationRule(config);
    const prices = [100, 100, 1000]; // huge jump on only the 3rd sample (2 samples of history)

    const results = prices.map((p) => rule.evaluate(makeInvocation({ functionName: 'set_price', args: [p] })));

    expect(results.flat()).toHaveLength(0);
  });

  it('fires when a new value deviates beyond the threshold from the rolling baseline', () => {
    const rule = createOracleDeviationRule(config);
    const stable = [100, 101, 99, 100];
    for (const p of stable) {
      rule.evaluate(makeInvocation({ functionName: 'set_price', args: [p] }));
    }

    const anomalies = rule.evaluate(makeInvocation({ functionName: 'set_price', args: [500] }));

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ ruleId: ORACLE_DEVIATION_RULE_ID, severity: 'critical' });
  });

  it('does not fire for values within the threshold', () => {
    const rule = createOracleDeviationRule(config);
    const stable = [100, 101, 99, 100];
    for (const p of stable) {
      rule.evaluate(makeInvocation({ functionName: 'set_price', args: [p] }));
    }

    const anomalies = rule.evaluate(makeInvocation({ functionName: 'set_price', args: [105] }));
    expect(anomalies).toHaveLength(0);
  });

  it('tracks separate baselines per function', () => {
    const rule = createOracleDeviationRule({ ...config, ORACLE_PRICE_FUNCTIONS: ['set_price', 'mint_collateral'] });
    for (const p of [100, 100, 100]) {
      rule.evaluate(makeInvocation({ functionName: 'set_price', args: [p] }));
    }
    // mint_collateral runs on a completely different scale; its own stable
    // baseline shouldn't be judged against set_price's baseline of 100.
    for (const v of [50_000, 50_100, 49_900]) {
      rule.evaluate(makeInvocation({ functionName: 'mint_collateral', args: [v] }));
    }
    const anomalies = rule.evaluate(makeInvocation({ functionName: 'mint_collateral', args: [50_050] }));
    expect(anomalies).toHaveLength(0);
  });
});
