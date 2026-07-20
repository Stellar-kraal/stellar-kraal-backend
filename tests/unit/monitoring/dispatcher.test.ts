jest.mock('../../../src/monitoring/alerting/webhook', () => ({
  sendAlert: jest.fn().mockResolvedValue(undefined),
}));

import { createDispatcher } from '../../../src/monitoring/alerting/dispatcher';
import { sendAlert } from '../../../src/monitoring/alerting/webhook';
import { AlertDeduplicator } from '../../../src/monitoring/alerting/dedup';
import { Anomaly, AnomalyRule } from '../../../src/monitoring/types';
import { makeInvocation } from './testUtils';

function fakeRule(id: string, anomaly: Anomaly | null): AnomalyRule {
  return { id, evaluate: () => (anomaly ? [anomaly] : []) };
}

function fakeAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return {
    ruleId: 'fake-rule',
    severity: 'warning',
    contractId: 'C123',
    txHash: 'tx1',
    ledger: 1,
    functionName: 'do_thing',
    sourceAccount: 'GABC',
    observedValue: '1',
    thresholdValue: '0',
    message: 'test',
    dedupKey: 'fake-rule:C123',
    occurredAt: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

describe('createDispatcher', () => {
  beforeEach(() => {
    (sendAlert as jest.Mock).mockClear();
  });

  it('dispatches an anomaly raised by a rule', async () => {
    const dedup = new AlertDeduplicator(60_000);
    const anomaly = fakeAnomaly();
    const handle = createDispatcher([fakeRule('r1', anomaly)], dedup);

    await handle(makeInvocation());

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith(anomaly);
  });

  it('suppresses a duplicate anomaly within the cooldown window', async () => {
    const dedup = new AlertDeduplicator(60_000);
    const anomaly = fakeAnomaly();
    const handle = createDispatcher([fakeRule('r1', anomaly)], dedup);

    await handle(makeInvocation());
    await handle(makeInvocation());

    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  it('continues evaluating remaining rules if one rule throws', async () => {
    const dedup = new AlertDeduplicator(60_000);
    const anomaly = fakeAnomaly({ dedupKey: 'ok-rule:C123' });
    const throwingRule: AnomalyRule = {
      id: 'broken',
      evaluate: () => {
        throw new Error('boom');
      },
    };
    const handle = createDispatcher([throwingRule, fakeRule('ok-rule', anomaly)], dedup);

    await handle(makeInvocation());

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith(anomaly);
  });

  it('does nothing when no rule raises an anomaly', async () => {
    const dedup = new AlertDeduplicator(60_000);
    const handle = createDispatcher([fakeRule('r1', null)], dedup);

    await handle(makeInvocation());

    expect(sendAlert).not.toHaveBeenCalled();
  });
});
