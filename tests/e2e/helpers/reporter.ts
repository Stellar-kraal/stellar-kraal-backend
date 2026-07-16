/**
 * tests/e2e/helpers/reporter.ts
 *
 * Structured report builder for E2E test failures.
 *
 * When an E2E step fails the reporter captures:
 *   - Which lifecycle step was executing
 *   - The full API request / response
 *   - The Horizon transaction link (if a tx hash is available)
 *   - Timestamps for each completed step
 *
 * Usage:
 *   const report = new LifecycleReport();
 *   report.startStep('register-livestock');
 *   // ... perform step ...
 *   report.completeStep('register-livestock', { livestockId });
 *   // On failure:
 *   throw report.buildError('register-livestock', apiResponse, txHash);
 */

import { horizonTxUrl } from './horizon';
import { E2E_CONFIG } from '../config';

export type LifecycleStepName =
  | 'fund-accounts'
  | 'authenticate-farmer'
  | 'register-livestock'
  | 'appraisal-triggered'
  | 'livestock-verified'
  | 'request-loan'
  | 'market-view'
  | 'authenticate-investor'
  | 'view-loan-detail'
  | 'on-chain-loan-state'
  | 'repayment';

export interface StepRecord {
  name: LifecycleStepName;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface ApiCapture {
  method: string;
  url: string;
  requestBody?: unknown;
  statusCode: number;
  responseBody: unknown;
}

export class LifecycleReport {
  private steps: Map<LifecycleStepName, StepRecord> = new Map();
  private currentStep: LifecycleStepName | null = null;

  startStep(name: LifecycleStepName): void {
    this.currentStep = name;
    this.steps.set(name, { name, startedAt: new Date().toISOString() });
    if (E2E_CONFIG.verbose) {
      console.log(`\n[e2e] ▶ ${name}`);
    }
  }

  completeStep(name: LifecycleStepName, metadata?: Record<string, unknown>): void {
    const step = this.steps.get(name);
    if (!step) return;

    const now = new Date();
    step.completedAt = now.toISOString();
    step.durationMs = now.getTime() - new Date(step.startedAt).getTime();
    step.metadata = metadata;

    if (E2E_CONFIG.verbose) {
      console.log(`[e2e] ✓ ${name} (${step.durationMs}ms)`);
    }
  }

  /**
   * Build a structured E2EStepError that includes everything needed to
   * understand and reproduce the failure.
   */
  buildError(
    failedStep: LifecycleStepName,
    api: ApiCapture,
    txHash?: string,
  ): E2EStepError {
    const completedSteps = [...this.steps.values()]
      .filter((s) => s.completedAt)
      .map((s) => s.name);

    const report: FailureReport = {
      failedStep,
      completedSteps,
      api,
      horizonLink: txHash ? horizonTxUrl(txHash) : undefined,
      timestamp: new Date().toISOString(),
    };

    return new E2EStepError(report);
  }

  /** Print a summary of all completed steps to stdout (useful in CI logs). */
  printSummary(): void {
    console.log('\n══════════════ E2E Lifecycle Report ══════════════');
    for (const step of this.steps.values()) {
      const status = step.completedAt ? '✓' : '✗';
      const duration = step.durationMs != null ? ` (${step.durationMs}ms)` : '';
      console.log(`  ${status} ${step.name}${duration}`);
      if (step.metadata) {
        for (const [k, v] of Object.entries(step.metadata)) {
          console.log(`      ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
    console.log('══════════════════════════════════════════════════\n');
  }
}

export interface FailureReport {
  failedStep: LifecycleStepName;
  completedSteps: LifecycleStepName[];
  api: ApiCapture;
  horizonLink?: string;
  timestamp: string;
}

export class E2EStepError extends Error {
  public readonly report: FailureReport;

  constructor(report: FailureReport) {
    const horizonNote = report.horizonLink
      ? `\n  Horizon: ${report.horizonLink}`
      : '';

    super(
      `E2E step FAILED: ${report.failedStep}\n` +
      `  API: ${report.api.method} ${report.api.url} → ${report.api.statusCode}\n` +
      `  Response: ${JSON.stringify(report.api.responseBody).slice(0, 500)}` +
      horizonNote,
    );

    this.name = 'E2EStepError';
    this.report = report;
  }

  /** Emit the full structured report as JSON to stderr for CI log parsing. */
  emitStructuredReport(): void {
    process.stderr.write(
      '\n[E2E FAILURE REPORT]\n' +
      JSON.stringify(this.report, null, 2) +
      '\n',
    );
  }
}

// ─── API call helper ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Perform a JSON API call and return both the response status and parsed body.
 * Captures everything needed for the FailureReport.
 */
export async function apiCall<T = unknown>(
  method: string,
  url: string,
  opts: {
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; body: T; capture: ApiCapture }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let responseBody: unknown;
  let status: number;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    status = res.status;
    const text = await res.text();
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  } finally {
    clearTimeout(timer);
  }

  const capture: ApiCapture = {
    method,
    url,
    requestBody: opts.body,
    statusCode: status!,
    responseBody,
  };

  return { status: status!, body: responseBody as T, capture };
}
