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

interface XBullWindow {
  xbull?: {
    connect(): Promise<string[]>;
    getAddress(): Promise<string>;
    sign(txXdr: string, network: string): Promise<string>;
    getNetwork?(): Promise<{ network: string }>;
    disconnect?(): Promise<void>;
  };
}

declare global {
  interface Window extends XBullWindow {}
}

function getXBull() {
  if (typeof window === "undefined") return undefined;
  return window.xbull;
}

export class XBullAdapter implements WalletAdapter {
  readonly id = WalletId.xBull;
  readonly name = "xBull";

  async detect(): Promise<boolean> {
    return typeof window !== "undefined" && !!window.xbull;
  }

  async connect(): Promise<WalletConnectionResult> {
    const xbull = getXBull();
    if (!xbull) {
      throw createWalletError(
        "xBull wallet is not installed",
        WalletErrorCode.NotInstalled,
        this.id
      );
    }

    try {
      const addresses = await xbull.connect();
      if (!addresses || addresses.length === 0) {
        throw createWalletError(
          "No addresses returned from xBull",
          WalletErrorCode.ConnectionFailed,
          this.id
        );
      }
      return { address: addresses[0], walletId: this.id };
    } catch (e: unknown) {
      if ((e as WalletError).code) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw createWalletError(
        err.message || "Failed to connect to xBull",
        WalletErrorCode.ConnectionFailed,
        this.id,
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    const xbull = getXBull();
    if (xbull?.disconnect) {
      await xbull.disconnect();
    }
  }

  async getAddress(): Promise<string> {
    const xbull = getXBull();
    if (!xbull) {
      throw createWalletError(
        "xBull wallet is not installed",
        WalletErrorCode.NotInstalled,
        this.id
      );
    }
    return xbull.getAddress();
  }

  async signTransaction(
    xdr: string,
    opts?: SignTransactionOptions
  ): Promise<SignTransactionResult> {
    const xbull = getXBull();
    if (!xbull) {
      throw createWalletError(
        "xBull wallet is not installed",
        WalletErrorCode.NotInstalled,
        this.id
      );
    }

    try {
      const network = opts?.networkPassphrase ?? opts?.network ?? "TESTNET";
      const signedXdr = await xbull.sign(xdr, network);
      return { signedTxXdr: signedXdr };
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
    const xbull = getXBull();
    if (!xbull?.getNetwork) return null;
    try {
      const result = await xbull.getNetwork();
      return {
        network: result.network,
        networkPassphrase: result.network,
      };
    } catch {
      return null;
    }
  }

  async isConnected(): Promise<boolean> {
    const xbull = getXBull();
    if (!xbull) return false;
    try {
      await xbull.getAddress();
      return true;
    } catch {
      return false;
    }
  }
}
