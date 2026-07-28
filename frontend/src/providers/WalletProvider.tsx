"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  WalletId,
  WalletState,
  WalletMetadata,
  SignTransactionOptions,
  SignTransactionResult,
  WalletNetwork,
} from "@/lib/wallet/types";
import {
  getWalletManager,
  WalletManager,
  WalletManagerState,
} from "@/lib/wallet/wallet-manager";

interface WalletContextValue extends WalletManagerState {
  wallets: WalletMetadata[];
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  switchWallet: (walletId: WalletId) => Promise<void>;
  signTransaction: (
    xdr: string,
    opts?: SignTransactionOptions
  ) => Promise<SignTransactionResult>;
  getNetwork: () => Promise<WalletNetwork | null>;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return ctx;
}

interface WalletProviderProps {
  children: React.ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const managerRef = useRef<WalletManager>(getWalletManager());
  const [state, setState] = useState<WalletManagerState>(
    managerRef.current.getState()
  );
  const [wallets, setWallets] = useState<WalletMetadata[]>([]);

  useEffect(() => {
    const manager = managerRef.current;

    const unsubscribe = manager.subscribe((newState) => {
      setState(newState);
      if (newState.wallets) {
        setWallets(newState.wallets);
      }
    });

    manager.initialize().then(() => {
      setState(manager.getState());
      setWallets(manager.getState().wallets ?? []);
    });

    return unsubscribe;
  }, []);

  const connect = useCallback(async (walletId: WalletId) => {
    await managerRef.current.connect(walletId);
  }, []);

  const disconnect = useCallback(async () => {
    await managerRef.current.disconnect();
  }, []);

  const switchWallet = useCallback(async (walletId: WalletId) => {
    await managerRef.current.switchWallet(walletId);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string, opts?: SignTransactionOptions) => {
      return managerRef.current.signTransaction(xdr, opts);
    },
    []
  );

  const getNetwork = useCallback(async () => {
    return managerRef.current.getNetwork();
  }, []);

  const clearError = useCallback(() => {
    managerRef.current.clearError();
  }, []);

  const value: WalletContextValue = {
    ...state,
    wallets,
    connect,
    disconnect,
    switchWallet,
    signTransaction,
    getNetwork,
    clearError,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
