import { AlertDeduplicator } from '../../../src/monitoring/alerting/dedup';

describe('AlertDeduplicator', () => {
  it('allows the first alert for a key', () => {
    const dedup = new AlertDeduplicator(60_000);
    expect(dedup.shouldAlert('rule:a', 1_000)).toBe(true);
  });

  it('suppresses a repeat within the cooldown window', () => {
    const dedup = new AlertDeduplicator(60_000);
    dedup.shouldAlert('rule:a', 1_000);
    expect(dedup.shouldAlert('rule:a', 1_000 + 30_000)).toBe(false);
  });

  it('allows a repeat once the cooldown has elapsed', () => {
    const dedup = new AlertDeduplicator(60_000);
    dedup.shouldAlert('rule:a', 1_000);
    expect(dedup.shouldAlert('rule:a', 1_000 + 60_000)).toBe(true);
  });

  it('tracks distinct keys independently', () => {
    const dedup = new AlertDeduplicator(60_000);
    dedup.shouldAlert('rule:a', 1_000);
    expect(dedup.shouldAlert('rule:b', 1_000)).toBe(true);
  });
});
