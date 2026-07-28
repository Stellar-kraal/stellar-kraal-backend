"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletContext } from "@/providers/WalletProvider";
import { WalletId } from "@/lib/wallet/types";

const STORAGE_KEY = "stellarkraal_wallet";

/**
 * Backward-compatible wallet hook.
 *
 * Maintains the original API shape so existing components continue to work
 * without changes. For new components, prefer useWalletConnection() which
 * exposes the full multi-wallet abstraction.
 */
export type WalletState = {
  address: string | null;
  freighterInstalled: boolean | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** ID of the currently connected wallet, if any. */
  walletId: WalletId | null;
  /** Show the wallet selection modal. */
  openWalletModal: () => void;
};

export function useWallet(): WalletState {
  const {
    address,
    walletId,
    state,
    error,
    wallets,
    connect: ctxConnect,
    disconnect: ctxDisconnect,
    clearError,
  } = useWalletContext();

  const [modalOpen, setModalOpen] = useState(false);

  const freighterMeta = wallets?.find((w) => w.id === WalletId.Freighter);
  const freighterInstalled =
    freighterMeta === undefined ? null : freighterMeta.isInstalled;

  const connecting = state === "connecting";

  const connect = useCallback(async () => {
    // If only Freighter is installed or no wallet is selected, connect Freighter directly.
    // Otherwise, signal that the modal should open.
    const availableWallets = wallets?.filter((w) => w.isAvailable) ?? [];
    const installedWallets = wallets?.filter((w) => w.isInstalled) ?? [];

    if (installedWallets.length === 1) {
      await ctxConnect(installedWallets[0].id);
    } else if (installedWallets.length > 0) {
      setModalOpen(true);
    } else if (availableWallets.length === 1) {
      await ctxConnect(availableWallets[0].id);
    } else {
      setModalOpen(true);
    }
  }, [wallets, ctxConnect]);

  const disconnect = useCallback(() => {
    ctxDisconnect();
  }, [ctxDisconnect]);

  const openWalletModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  // Sync address to localStorage for backward compatibility
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (address) {
      localStorage.setItem(STORAGE_KEY, address);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [address]);

  return {
    address: address ?? null,
    freighterInstalled,
    connecting,
    error,
    connect,
    disconnect,
    walletId,
    openWalletModal,
  };
}
