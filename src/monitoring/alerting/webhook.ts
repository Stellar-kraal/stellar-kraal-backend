/**
 * src/monitoring/alerting/webhook.ts
 *
 * Posts an anomaly to a configurable webhook. `slack` produces a Slack
 * incoming-webhook-compatible payload (also readable by most chat-ops
 * relays); `generic` posts the raw anomaly as JSON, suitable for a
 * PagerDuty Events API v2 proxy or a custom receiver.
 */

import { monitorConfig } from '../config';
import { createLogger } from '../logger';
import { Anomaly } from '../types';

const log = createLogger('webhook');

function toSlackPayload(anomaly: Anomaly): unknown {
  const emoji = anomaly.severity === 'critical' ? ':rotating_light:' : ':warning:';
  return {
    text: `${emoji} *[${anomaly.severity.toUpperCase()}] ${anomaly.ruleId}*\n${anomaly.message}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *[${anomaly.severity.toUpperCase()}] ${anomaly.ruleId}*\n${anomaly.message}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Contract:*\n\`${anomaly.contractId}\`` },
          { type: 'mrkdwn', text: `*Tx Hash:*\n\`${anomaly.txHash}\`` },
          { type: 'mrkdwn', text: `*Function:*\n${anomaly.functionName ?? 'n/a'}` },
          { type: 'mrkdwn', text: `*Source Account:*\n\`${anomaly.sourceAccount}\`` },
          { type: 'mrkdwn', text: `*Observed:*\n${anomaly.observedValue}` },
          { type: 'mrkdwn', text: `*Threshold:*\n${anomaly.thresholdValue}` },
          { type: 'mrkdwn', text: `*Ledger:*\n${anomaly.ledger}` },
          { type: 'mrkdwn', text: `*Occurred At:*\n${anomaly.occurredAt}` },
        ],
      },
    ],
  };
}

export async function sendAlert(
  anomaly: Anomaly,
  config: typeof monitorConfig = monitorConfig,
): Promise<void> {
  const payload = config.WEBHOOK_FORMAT === 'slack' ? toSlackPayload(anomaly) : anomaly;

  try {
    const response = await fetch(config.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      log.error('Webhook returned non-2xx status', {
        status: response.status,
        ruleId: anomaly.ruleId,
        dedupKey: anomaly.dedupKey,
      });
      return;
    }

    log.info('Alert dispatched', { ruleId: anomaly.ruleId, dedupKey: anomaly.dedupKey, severity: anomaly.severity });
  } catch (err) {
    log.error('Failed to dispatch webhook alert', { err, ruleId: anomaly.ruleId, dedupKey: anomaly.dedupKey });
  }
}
