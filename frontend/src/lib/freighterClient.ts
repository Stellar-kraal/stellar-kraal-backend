"use client";

/**
 * Legacy freighterClient compatibility shim.
 *
 * This module re-exports wallet operations through the new wallet abstraction
 * layer. Existing components that import from `@/lib/freighterClient` continue
 * to work, but all Freighter-specific SDK calls are now routed through the
 * wallet adapter. New code should use the wallet hooks directly instead.
 */

import { getWalletManager } from "@/lib/wallet/wallet-manager";
import { WalletId, WalletErrorCode, createWalletError } from "@/lib/wallet/types";

type FreighterTestApi = Partial<{
  isConnected: () => Promise<{ isConnected: boolean }>;
  isAllowed: () => Promise<{ isAllowed: boolean }>;
  setAllowed: () => Promise<{ isAllowed: boolean }>;
  getAddress: () => Promise<{ address: string }>;
  signTransaction: (xdr: string, opts?: { network?: string }) => Promise<{ signedTxXdr: string }>;
}>;

declare global {
  interface Window {
    __STELLARKRAAL_E2E__?: FreighterTestApi & {
      submitSignedXdr?: (signedXdr: string) => Promise<string> | string;
    };
  }
}

function getTestApi(): FreighterTestApi | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__STELLARKRAAL_E2E__;
}

export async function isConnected() {
  const testApi = getTestApi();
  if (testApi?.isConnected) return testApi.isConnected();

  const manager = getWalletManager();
  const state = manager.getState();
  if (state.state === "connected" && state.walletId === WalletId.Freighter) {
    return { isConnected: true };
  }
  return { isConnected: false };
}

export async function isAllowed() {
  const testApi = getTestApi();
  if (testApi?.isAllowed) return testApi.isAllowed();

  try {
    const { FreighterAdapter } = await import("@/lib/wallet/adapters/freighter-adapter");
    const adapter = new FreighterAdapter();
    const allowed = await adapter.isAllowed();
    return { isAllowed: allowed };
  } catch {
    return { isAllowed: false };
  }
}

export async function setAllowed() {
  const testApi = getTestApi();
  if (testApi?.setAllowed) return testApi.setAllowed();

  try {
    const { FreighterAdapter } = await import("@/lib/wallet/adapters/freighter-adapter");
    const adapter = new FreighterAdapter();
    // Freighter setAllowed prompts the user for permission
    await adapter.connect();
    return { isAllowed: true };
  } catch {
    return { isAllowed: false };
  }
}

export async function getAddress() {
  const testApi = getTestApi();
  if (testApi?.getAddress) return testApi.getAddress();

  const manager = getWalletManager();
  const state = manager.getState();
  if (state.state === "connected" && state.address) {
    return { address: state.address };
  }

  throw createWalletError(
    "No wallet connected",
    WalletErrorCode.SessionExpired,
    WalletId.Freighter
  );
}

export async function signTransaction(
  xdr: string,
  opts?: { network?: string; networkPassphrase?: string; address?: string }
) {
  const testApi = getTestApi();
  if (testApi?.signTransaction) return testApi.signTransaction(xdr, opts);

  const manager = getWalletManager();
  const state = manager.getState();
  if (state.state !== "connected") {
    throw createWalletError(
      "No wallet connected",
      WalletErrorCode.SessionExpired,
      WalletId.Freighter
    );
  }

  const result = await manager.signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? opts?.network,
    address: opts?.address,
  });

  return { signedTxXdr: result.signedTxXdr };
}
