"use client";

import { useCallback } from "react";
import { useWalletContext } from "@/providers/WalletProvider";
import { WalletId, WalletErrorCode, createWalletError } from "@/lib/wallet/types";

export interface UseWalletConnectionReturn {
  address: string | null;
  walletId: WalletId | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  switchWallet: (walletId: WalletId) => Promise<void>;
  clearError: () => void;
}

export function useWalletConnection(): UseWalletConnectionReturn {
  const {
    address,
    walletId,
    state,
    error,
    connect: ctxConnect,
    disconnect: ctxDisconnect,
    switchWallet: ctxSwitchWallet,
    clearError,
  } = useWalletContext();

  const connect = useCallback(
    async (walletId: WalletId) => {
      try {
        await ctxConnect(walletId);
      } catch (e: unknown) {
        // Error is already set in context state; re-throw for component-level handling
        throw e;
      }
    },
    [ctxConnect]
  );

  const disconnect = useCallback(async () => {
    await ctxDisconnect();
  }, [ctxDisconnect]);

  const switchWallet = useCallback(
    async (walletId: WalletId) => {
      try {
        await ctxSwitchWallet(walletId);
      } catch (e: unknown) {
        throw e;
      }
    },
    [ctxSwitchWallet]
  );

  return {
    address,
    walletId,
    isConnecting: state === "connecting",
    isConnected: state === "connected",
    error,
    connect,
    disconnect,
    switchWallet,
    clearError,
  };
}
