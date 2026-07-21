import { sendAlert } from '../../../src/monitoring/alerting/webhook';
import { Anomaly } from '../../../src/monitoring/types';
import { baseMonitorConfig } from './testUtils';

const anomaly: Anomaly = {
  ruleId: 'large-value-invocation',
  severity: 'critical',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  txHash: 'deadbeef',
  ledger: 12345,
  functionName: 'mint_collateral',
  sourceAccount: 'GAEQ5IUNQTW36XMQF6MR2VWKPG3JOF6IKEGAD2JQ6OUNKTUVBAIE5AO3',
  observedValue: '123456',
  thresholdValue: '50000',
  message: 'test anomaly',
  dedupKey: 'large-value-invocation:test',
  occurredAt: '2026-07-20T00:00:00Z',
};

describe('sendAlert', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('posts a Slack-shaped payload when WEBHOOK_FORMAT is slack', async () => {
    await sendAlert(anomaly, { ...baseMonitorConfig, WEBHOOK_FORMAT: 'slack' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(baseMonitorConfig.WEBHOOK_URL);
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('large-value-invocation');
    expect(body.blocks).toBeInstanceOf(Array);
  });

  it('posts the raw anomaly when WEBHOOK_FORMAT is generic', async () => {
    await sendAlert(anomaly, { ...baseMonitorConfig, WEBHOOK_FORMAT: 'generic' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual(anomaly);
  });

  it('does not throw when the webhook request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(sendAlert(anomaly, baseMonitorConfig)).resolves.toBeUndefined();
  });

  it('does not throw on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(sendAlert(anomaly, baseMonitorConfig)).resolves.toBeUndefined();
  });
});
