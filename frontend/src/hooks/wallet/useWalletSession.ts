"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletContext } from "@/providers/WalletProvider";
import { WalletId, SESSION_STORAGE_KEY, SESSION_MAX_AGE_MS } from "@/lib/wallet/types";

export interface WalletSessionInfo {
  address: string;
  walletId: WalletId;
  connectedAt: number;
  isExpired: boolean;
}

export interface UseWalletSessionReturn {
  session: WalletSessionInfo | null;
  hasExpiredSession: boolean;
  clearExpiredSession: () => void;
}

function readSession(): WalletSessionInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.address || !parsed.walletId || !parsed.connectedAt) return null;
    return {
      address: parsed.address,
      walletId: parsed.walletId,
      connectedAt: parsed.connectedAt,
      isExpired: Date.now() - parsed.connectedAt > SESSION_MAX_AGE_MS,
    };
  } catch {
    return null;
  }
}

export function useWalletSession(): UseWalletSessionReturn {
  const { address, walletId } = useWalletContext();
  const [storedSession, setStoredSession] = useState<WalletSessionInfo | null>(
    null
  );

  useEffect(() => {
    setStoredSession(readSession());
  }, []);

  const clearExpiredSession = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setStoredSession(null);
  }, []);

  const currentSession: WalletSessionInfo | null =
    address && walletId
      ? {
          address,
          walletId,
          connectedAt: storedSession?.connectedAt ?? Date.now(),
          isExpired: false,
        }
      : storedSession?.isExpired
        ? storedSession
        : null;

  return {
    session: currentSession,
    hasExpiredSession: !!storedSession?.isExpired,
    clearExpiredSession,
  };
}
