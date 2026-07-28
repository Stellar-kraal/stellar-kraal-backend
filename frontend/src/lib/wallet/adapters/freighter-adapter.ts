"use client";

import {
  getAddress as freighterGetAddress,
  isAllowed as freighterIsAllowed,
  isConnected as freighterIsConnected,
  setAllowed as freighterSetAllowed,
  signTransaction as freighterSignTransaction,
  getNetworkDetails as freighterGetNetworkDetails,
} from "@stellar/freighter-api";
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

type FreighterNetworkDetails = {
  network: string;
  networkUrl: string;
  networkPassphrase: string;
};

type FreighterTestApi = Partial<{
  isConnected: () => Promise<{ isConnected: boolean }>;
  isAllowed: () => Promise<{ isAllowed: boolean }>;
  setAllowed: () => Promise<{ isAllowed: boolean }>;
  getAddress: () => Promise<{ address: string }>;
  signTransaction: (
    xdr: string,
    opts?: { network?: string }
  ) => Promise<{ signedTxXdr: string }>;
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

export class FreighterAdapter implements WalletAdapter {
  readonly id = WalletId.Freighter;
  readonly name = "Freighter";

  async detect(): Promise<boolean> {
    const testApi = getTestApi();
    if (testApi?.isConnected) {
      try {
        const result = await testApi.isConnected();
        return result.isConnected;
      } catch {
        return false;
      }
    }

    try {
      await freighterIsConnected();
      return true;
    } catch {
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    const testApi = getTestApi();
    if (testApi?.isConnected) {
      const result = await testApi.isConnected();
      return result.isConnected;
    }
    const result = await freighterIsConnected();
    return result.isConnected;
  }

  async isAllowed(): Promise<boolean> {
    const testApi = getTestApi();
    if (testApi?.isAllowed) {
      const result = await testApi.isAllowed();
      return result.isAllowed;
    }
    const result = await freighterIsAllowed();
    return result.isAllowed;
  }

  async connect(): Promise<WalletConnectionResult> {
    const testApi = getTestApi();
    try {
      if (testApi?.setAllowed) {
        await testApi.setAllowed();
      } else {
        await freighterSetAllowed();
      }

      let address: string;
      if (testApi?.getAddress) {
        const result = await testApi.getAddress();
        address = result.address;
      } else {
        const result = await freighterGetAddress();
        address = result.address;
      }

      return { address, walletId: this.id };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw createWalletError(
        err.message || "Failed to connect to Freighter",
        WalletErrorCode.ConnectionFailed,
        this.id,
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    // Freighter doesn't have an explicit disconnect;
    // clearing the session is handled by the wallet manager.
  }

  async getAddress(): Promise<string> {
    const testApi = getTestApi();
    if (testApi?.getAddress) {
      const result = await testApi.getAddress();
      return result.address;
    }
    const result = await freighterGetAddress();
    return result.address;
  }

  async signTransaction(
    xdr: string,
    opts?: SignTransactionOptions
  ): Promise<SignTransactionResult> {
    const testApi = getTestApi();
    try {
      if (testApi?.signTransaction) {
        const result = await testApi.signTransaction(xdr, {
          network: opts?.networkPassphrase ?? opts?.network,
        });
        return { signedTxXdr: result.signedTxXdr };
      }

      const result = await freighterSignTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? opts?.network,
        address: opts?.address,
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
    try {
      const details = (await freighterGetNetworkDetails()) as FreighterNetworkDetails;
      return {
        network: details.network,
        networkPassphrase: details.networkPassphrase,
        networkUrl: details.networkUrl,
      };
    } catch {
      return null;
    }
  }
}
