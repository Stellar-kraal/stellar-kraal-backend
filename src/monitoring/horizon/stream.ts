/**
 * src/monitoring/horizon/stream.ts
 *
 * Subscribes to the live Horizon operations stream (SSE) scoped to the
 * monitored contract. Horizon indexes a contract's C-address as a
 * participant on any `invoke_host_function` operation that touches it, so
 * `GET /operations?account=<contractId>` returns exactly that contract's
 * activity — verified against a live testnet Horizon instance.
 *
 * We deliberately do NOT use the SDK's `.forAccount(id)` builder method:
 * it targets the REST-nested `/accounts/{id}/operations` route, and that
 * route validates `account_id` as a classic G-address, rejecting contract
 * (C...) addresses with a 400 — confirmed against a live testnet Horizon
 * instance. Only the flat `/operations?account=` form accepts a contract
 * ID, so the `account` query parameter is set directly.
 *
 * `includeFailed(true)` is required so failed invocations (contract
 * errors) reach the unauthorized-entry-point rule; by default Horizon
 * only returns operations from successful transactions.
 */

import { Horizon } from '@stellar/stellar-sdk';
import { createLogger } from '../logger';
import { NormalizedInvocation } from '../types';
import { normalizeOperation } from './normalize';

const log = createLogger('horizon-stream');

/** The `url` builder is `protected` in the SDK's public types; this is the minimal shape we need from it. */
interface QueryableCallBuilder {
  url: { setQuery(name: string, value: string): unknown };
}

export interface StreamStats {
  connected: boolean;
  lastMessageAt: number | null;
  /** ms between an operation's on-chain `created_at` and when we processed it */
  lastProcessingLagMs: number | null;
}

export interface HorizonStreamHandle {
  close: () => void;
  stats: StreamStats;
}

export function startHorizonStream(params: {
  horizonUrl: string;
  contractId: string;
  allowHttp: boolean;
  onInvocation: (invocation: NormalizedInvocation) => void;
}): HorizonStreamHandle {
  // Optimistic: the SDK opens the SSE connection synchronously below and
  // there's no `onopen` hook in its streaming API, so we flip this false
  // only on a reported error and back to true on the next received message.
  const stats: StreamStats = {
    connected: true,
    lastMessageAt: null,
    lastProcessingLagMs: null,
  };

  const server = new Horizon.Server(params.horizonUrl, { allowHttp: params.allowHttp });

  log.info('Subscribing to Horizon operations stream', {
    horizonUrl: params.horizonUrl,
    contractId: params.contractId,
  });

  const operationsBuilder = server.operations().includeFailed(true).cursor('now');
  (operationsBuilder as unknown as QueryableCallBuilder).url.setQuery('account', params.contractId);

  const close = operationsBuilder.stream({
    onmessage: (raw) => {
      stats.connected = true;
      stats.lastMessageAt = Date.now();

      // The SDK's streaming type signature reuses the collection-page
      // generic, but at runtime `onmessage` delivers one record per
      // event — a known js-stellar-sdk typing quirk.
      const record = raw as unknown as Horizon.ServerApi.OperationRecord;

      let normalized: NormalizedInvocation | null;
      try {
        normalized = normalizeOperation(record);
      } catch (err) {
        log.error('Failed to normalize Horizon operation', { err, opId: record.id });
        return;
      }

      if (!normalized) return;

      stats.lastProcessingLagMs = Date.now() - new Date(normalized.occurredAt).getTime();

      try {
        params.onInvocation(normalized);
      } catch (err) {
        log.error('onInvocation handler threw', { err, opId: normalized.operationId });
      }
    },
    onerror: (err) => {
      stats.connected = false;
      log.error('Horizon stream error (will auto-reconnect)', { err });
    },
  });

  return { close, stats };
}
