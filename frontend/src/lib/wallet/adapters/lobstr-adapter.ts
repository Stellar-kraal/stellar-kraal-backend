"use client";

import {
  WalletAdapter,
  WalletId,
  WalletConnectionResult,
  SignTransactionOptions,
  SignTransactionResult,
  WalletNetwork,
  WalletErrorCode,
  createWalletError,
} from "../types";

interface LobstrWindow {
  lobstr?: {
    connect(): Promise<{ address: string }>;
    getAddress(): Promise<{ address: string }>;
    sign(xdr: string, opts?: { networkPassphrase?: string }): Promise<{
      signedTxXdr: string;
    }>;
    getNetwork?(): Promise<{ network: string; networkPassphrase: string }>;
    disconnect?(): Promise<void>;
  };
}

declare global {
  interface Window extends LobstrWindow {}
}

function getLobstr() {
  if (typeof window === "undefined") return undefined;
  return window.lobstr;
}

export class LobstrAdapter implements WalletAdapter {
  readonly id = WalletId.Lobstr;
  readonly name = "LOBSTR";

  async detect(): Promise<boolean> {
    return typeof window !== "undefined" && !!window.lobstr;
  }

  async connect(): Promise<WalletConnectionResult> {
    const lobstr = getLobstr();
    if (!lobstr) {
      throw createWalletError(
        "LOBSTR wallet is not installed",
        WalletErrorCode.NotInstalled,
        this.id
      );
    }

    try {
      const result = await lobstr.connect();
      return { address: result.address, walletId: this.id };
    } catch (e: unknown) {
      if ((e as WalletError).code) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw createWalletError(
        err.message || "Failed to connect to LOBSTR",
        WalletErrorCode.ConnectionFailed,
        this.id,
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    const lobstr = getLobstr();
    if (lobstr?.disconnect) {
      await lobstr.disconnect();
    }
  }

  async getAddress(): Promise<string> {
    const lobstr = getLobstr();
    if (!lobstr) {
      throw createWalletError(
        "LOBSTR wallet is not installed",
        WalletErrorCode.NotInstalled,
        this.id
      );
    }
    const result = await lobstr.getAddress();
    return result.address;
  }

  async signTransaction(
    xdr: string,
    opts?: SignTransactionOptions
  ): Promise<SignTransactionResult> {
    const lobstr = getLobstr();
    if (!lobstr) {
      throw createWalletError(
        "LOBSTR wallet is not installed",
        WalletErrorCode.NotInstalled,
        this.id
      );
    }

    try {
      const result = await lobstr.sign(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? opts?.network,
      });
      return { signedTxXdr: result.signedTxXdr };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw createWalletError(
        err.message || "Transaction signing failed",
        WalletErrorCode.SigningFailed,
        this.id,
        err
      );
    }
  }

  async getNetwork(): Promise<WalletNetwork | null> {
    const lobstr = getLobstr();
    if (!lobstr?.getNetwork) return null;
    try {
      const result = await lobstr.getNetwork();
      return {
        network: result.network,
        networkPassphrase: result.networkPassphrase,
      };
    } catch {
      return null;
    }
  }

  async isConnected(): Promise<boolean> {
    const lobstr = getLobstr();
    if (!lobstr) return false;
    try {
      await lobstr.getAddress();
      return true;
    } catch {
      return false;
    }
  }
}
