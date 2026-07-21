/**
 * src/monitoring/alerting/dedup.ts
 *
 * Cooldown-based alert deduplication. Each anomaly carries a `dedupKey`
 * (rule + contract + relevant identity, e.g. function/account) computed by
 * the rule that raised it; a repeat of the same key within the cooldown
 * window is suppressed rather than re-sent.
 */

export class AlertDeduplicator {
  private readonly lastAlertedAtMs = new Map<string, number>();

  constructor(private readonly cooldownMs: number) {}

  /**
   * Returns true (and records the alert) if `dedupKey` is outside its
   * cooldown window; returns false if it should be suppressed.
   */
  shouldAlert(dedupKey: string, nowMs: number = Date.now()): boolean {
    const last = this.lastAlertedAtMs.get(dedupKey);
    if (last !== undefined && nowMs - last < this.cooldownMs) {
      return false;
    }
    this.lastAlertedAtMs.set(dedupKey, nowMs);
    return true;
  }

  /** Number of distinct keys currently tracked (for diagnostics/health). */
  get size(): number {
    return this.lastAlertedAtMs.size;
  }
}
