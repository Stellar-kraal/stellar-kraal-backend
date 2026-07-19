/**
 * src/state.ts
 *
 * The bridge's operational state: everything needed to describe "what this
 * instance is doing and how far it's gotten," excluding raw secret material.
 * This is exactly what gets backed up and restored.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BridgeConfig, BridgeRole } from './config';

export interface BridgeState {
  role: BridgeRole;
  contractId: string;
  network: string;
  rpcUrl: string;
  /** Reference only — never a raw key. See secretsProvider.ts. */
  signingKeySecretRef: string;
  lastSubmittedPrice: number | null;
  lastSubmittedAt: string | null;
  lastProcessedLedger: number;
  updatedAt: string;
}

const STATE_FILE = 'state.json';

export function defaultState(config: BridgeConfig): BridgeState {
  return {
    role: config.role,
    contractId: config.contractId,
    network: config.network,
    rpcUrl: config.rpcUrl,
    signingKeySecretRef: config.signingKeySecretRef,
    lastSubmittedPrice: null,
    lastSubmittedAt: null,
    lastProcessedLedger: 0,
    updatedAt: new Date().toISOString(),
  };
}

function statePath(stateDir: string): string {
  return path.join(stateDir, STATE_FILE);
}

export function loadState(stateDir: string): BridgeState | null {
  const file = statePath(stateDir);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw) as BridgeState;
}

/** Persists the state and returns exactly what was written (with a fresh `updatedAt`). */
export function saveState(stateDir: string, state: BridgeState): BridgeState {
  fs.mkdirSync(stateDir, { recursive: true });
  const next: BridgeState = { ...state, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statePath(stateDir), JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export function loadOrInitState(stateDir: string, config: BridgeConfig): BridgeState {
  return loadState(stateDir) ?? defaultState(config);
}
