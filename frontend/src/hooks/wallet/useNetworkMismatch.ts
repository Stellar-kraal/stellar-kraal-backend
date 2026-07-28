"use client";

import { useEffect, useState } from "react";
import { useWalletContext } from "@/providers/WalletProvider";

/**
 * Checks if the connected wallet's network matches the app's configured network.
 * Works with any connected wallet adapter, not just Freighter.
 */
export function useNetworkMismatch(walletAddress: string | null): boolean {
  const { walletId, getNetwork } = useWalletContext();
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (!walletAddress || !walletId) {
      setMismatch(false);
      return;
    }

    let cancelled = false;

    getNetwork().then((walletNetwork) => {
      if (cancelled || !walletNetwork) return;
      const appNetwork = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet").toLowerCase();
      const walletNetworkLower = walletNetwork.network.toLowerCase();
      setMismatch(walletNetworkLower !== appNetwork);
    });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, walletId, getNetwork]);

  return mismatch;
}
