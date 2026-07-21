/**
 * src/monitoring/rules/volumeSpike.rule.ts
 *
 * Buckets invocations into fixed-size time windows and flags a window
 * whose count both exceeds an absolute floor (to avoid noise at a low
 * baseline) and is a large multiple of the trailing average of prior
 * windows — a sudden spike in transaction volume against the contract.
 *
 * Windows advance lazily, driven by incoming events rather than a timer,
 * so the rule stays a pure function of the event stream and is easy to
 * unit test.
 */

import { monitorConfig } from '../config';
import { Anomaly, AnomalyRule, NormalizedInvocation } from '../types';
import { mean } from './common';

export const VOLUME_SPIKE_RULE_ID = 'transaction-volume-spike';

interface WindowState {
  windowStartMs: number;
  count: number;
  history: number[];
}

export function createVolumeSpikeRule(config: typeof monitorConfig = monitorConfig): AnomalyRule {
  const windowMs = config.VOLUME_WINDOW_SECONDS * 1000;
  const states = new Map<string, WindowState>();

  return {
    id: VOLUME_SPIKE_RULE_ID,
    evaluate(invocation: NormalizedInvocation): Anomaly[] {
      const nowMs = new Date(invocation.occurredAt).getTime();
      if (!Number.isFinite(nowMs)) return [];

      let state = states.get(invocation.contractId);
      if (!state) {
        state = { windowStartMs: nowMs, count: 0, history: [] };
        states.set(invocation.contractId, state);
      }

      // Roll forward through any elapsed windows (including empty ones),
      // so a burst after a quiet period is compared against a true baseline.
      while (nowMs - state.windowStartMs >= windowMs) {
        state.history.push(state.count);
        if (state.history.length > config.VOLUME_BASELINE_WINDOWS) state.history.shift();
        state.count = 0;
        state.windowStartMs += windowMs;
      }

      state.count += 1;

      const anomalies: Anomaly[] = [];
      if (state.history.length >= 1 && state.count >= config.VOLUME_SPIKE_MIN_COUNT) {
        const baseline = mean(state.history);
        if (baseline > 0 && state.count > baseline * config.VOLUME_SPIKE_MULTIPLIER) {
          anomalies.push({
            ruleId: VOLUME_SPIKE_RULE_ID,
            severity: 'warning',
            contractId: invocation.contractId,
            txHash: invocation.txHash,
            ledger: invocation.ledger,
            functionName: invocation.functionName,
            sourceAccount: invocation.sourceAccount,
            observedValue: `${state.count} ops / ${config.VOLUME_WINDOW_SECONDS}s`,
            thresholdValue: `> ${(baseline * config.VOLUME_SPIKE_MULTIPLIER).toFixed(1)} ops (baseline ${baseline.toFixed(1)} x${config.VOLUME_SPIKE_MULTIPLIER})`,
            message: `Transaction volume spike: ${state.count} operations in the current ${config.VOLUME_WINDOW_SECONDS}s window vs. a trailing baseline of ${baseline.toFixed(1)}`,
            dedupKey: `${VOLUME_SPIKE_RULE_ID}:${invocation.contractId}`,
            occurredAt: invocation.occurredAt,
          });
        }
      }

      return anomalies;
    },
  };
}
