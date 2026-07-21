import { createVolumeSpikeRule, VOLUME_SPIKE_RULE_ID } from '../../../../src/monitoring/rules/volumeSpike.rule';
import { baseMonitorConfig, makeInvocation } from '../testUtils';

const config = {
  ...baseMonitorConfig,
  VOLUME_WINDOW_SECONDS: 60,
  VOLUME_BASELINE_WINDOWS: 5,
  VOLUME_SPIKE_MULTIPLIER: 3,
  VOLUME_SPIKE_MIN_COUNT: 10,
};

/** Fires `count` invocations spaced 1s apart, starting at `startEpochMs`. */
function fireBurst(rule: ReturnType<typeof createVolumeSpikeRule>, startEpochMs: number, count: number) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const occurredAt = new Date(startEpochMs + i * 1_000).toISOString();
    results.push(rule.evaluate(makeInvocation({ occurredAt })));
  }
  return results;
}

describe('volumeSpike rule', () => {
  it('does not fire with no history to compare against', () => {
    const rule = createVolumeSpikeRule(config);
    const results = fireBurst(rule, Date.parse('2026-07-20T00:00:00Z'), 20);
    expect(results.flat()).toHaveLength(0);
  });

  it('fires when a window count is a large multiple of the trailing baseline', () => {
    const rule = createVolumeSpikeRule(config);
    let t = Date.parse('2026-07-20T00:00:00Z');

    // Establish a quiet baseline: 2 ops/window for 5 windows.
    for (let w = 0; w < 5; w++) {
      fireBurst(rule, t, 2);
      t += config.VOLUME_WINDOW_SECONDS * 1_000;
    }

    // Then a spike window: 15 ops (well above baseline*multiplier=6, and above MIN_COUNT=10).
    const spikeResults = fireBurst(rule, t, 15);

    const anomalies = spikeResults.flat();
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]).toMatchObject({ ruleId: VOLUME_SPIKE_RULE_ID, severity: 'warning' });
  });

  it('does not fire below the absolute minimum count even if the multiplier is exceeded', () => {
    const rule = createVolumeSpikeRule({ ...config, VOLUME_SPIKE_MIN_COUNT: 100 });
    let t = Date.parse('2026-07-20T00:00:00Z');

    for (let w = 0; w < 5; w++) {
      fireBurst(rule, t, 2);
      t += config.VOLUME_WINDOW_SECONDS * 1_000;
    }

    const spikeResults = fireBurst(rule, t, 15);
    expect(spikeResults.flat()).toHaveLength(0);
  });

  it('does not fire when volume stays proportional to baseline', () => {
    const rule = createVolumeSpikeRule(config);
    let t = Date.parse('2026-07-20T00:00:00Z');

    for (let w = 0; w < 5; w++) {
      fireBurst(rule, t, 12);
      t += config.VOLUME_WINDOW_SECONDS * 1_000;
    }

    const steadyResults = fireBurst(rule, t, 13);
    expect(steadyResults.flat()).toHaveLength(0);
  });
});
