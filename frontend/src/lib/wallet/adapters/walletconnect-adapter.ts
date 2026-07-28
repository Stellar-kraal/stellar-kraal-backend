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

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

let _signClient: unknown = null;
let _activeSession: unknown = null;

async function getSignClient() {
  if (_signClient) return _signClient;

  try {
    const { SignClient } = await import("@walletconnect/sign-client");
    _signClient = await SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "StellarKraal",
        description: "Livestock-backed micro-lending on Stellar",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [],
      },
    });
    return _signClient;
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw createWalletError(
      "Failed to initialize WalletConnect",
      WalletErrorCode.ConnectionFailed,
      WalletId.WalletConnect,
      err
    );
  }
}

async function restoreSession(): Promise<{
  address: string;
  topic: string;
  accounts: string[];
} | null> {
  const client = await getSignClient();
  if (!client) return null;

  const sessions = (client as { session: { getAll: () => unknown[] } }).session.getAll();
  for (const session of sessions) {
    const s = session as {
      topic: string;
      namespaces?: Record<string, { accounts?: string[] }>;
    };
    const stellarAccounts = s.namespaces?.["stellar"]?.accounts ?? [];
    if (stellarAccounts.length > 0) {
      const address = stellarAccounts[0].split(":").pop() ?? "";
      return { address, topic: s.topic, accounts: stellarAccounts };
    }
  }
  return null;
}

export class WalletConnectAdapter implements WalletAdapter {
  readonly id = WalletId.WalletConnect;
  readonly name = "WalletConnect";

  async detect(): Promise<boolean> {
    return true; // WalletConnect works via QR code, always available
  }

  async connect(): Promise<WalletConnectionResult> {
    if (!WALLETCONNECT_PROJECT_ID) {
      throw createWalletError(
        "WalletConnect project ID is not configured",
        WalletErrorCode.ConnectionFailed,
        this.id
      );
    }

    try {
      const client = await getSignClient();
      if (!client) throw new Error("Failed to initialize WalletConnect");

      const typed = client as {
        connect: (opts: unknown) => Promise<{ topic: string; namespaces: unknown }>;
      };

      const result = await typed.connect({
        requiredNamespaces: {
          stellar: {
            methods: [
              "stellar_signAndSubmitXDR",
              "stellar_signXDR",
              "stellar_getAddress",
            ],
            chains: [
              `stellar:${process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "pubnet" : "testnet"}`,
            ],
            events: [],
          },
        },
      });

      const stellarNamespace = result.namespaces as Record<
        string,
        { accounts?: string[] }
      >;
      const stellarAccounts = stellarNamespace?.["stellar"]?.accounts ?? [];
      const address = stellarAccounts[0]?.split(":").pop() ?? "";

      _activeSession = result;

      return { address, walletId: this.id };
    } catch (e: unknown) {
      if ((e as WalletError).code) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw createWalletError(
        err.message || "WalletConnect connection failed",
        WalletErrorCode.ConnectionFailed,
        this.id,
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    const client = await getSignClient();
    if (client && _activeSession) {
      const topic = (_activeSession as { topic: string }).topic;
      try {
        await (client as { disconnect: (opts: { topic: string }) => Promise<void> }).disconnect({
          topic,
        });
      } catch {
        // ignore disconnect errors
      }
    }
    _activeSession = null;
  }

  async getAddress(): Promise<string> {
    const session = await restoreSession();
    if (!session) {
      throw createWalletError(
        "No active WalletConnect session",
        WalletErrorCode.SessionExpired,
        this.id
      );
    }
    return session.address;
  }

  async signTransaction(
    xdr: string,
    opts?: SignTransactionOptions
  ): Promise<SignTransactionResult> {
    const client = await getSignClient();
    if (!client || !_activeSession) {
      throw createWalletError(
        "No active WalletConnect session",
        WalletErrorCode.SessionExpired,
        this.id
      );
    }

    const session = _activeSession as { topic: string; namespaces: unknown };
    const stellarNamespace = session.namespaces as Record<
      string,
      { accounts?: string[] }
    >;
    const accounts = stellarNamespace?.["stellar"]?.accounts ?? [];
    const account = accounts[0] ?? "";

    try {
      const result = await (
        client as {
          request: (opts: {
            topic: string;
            request: { method: string; params: { xdr: string; account?: string } };
            chainId: string;
          }) => Promise<{ signedTxXdr: string }>;
        }
      ).request({
        topic: session.topic,
        request: {
          method: "stellar_signXDR",
          params: { xdr, account: opts?.address ?? account.split(":").pop() },
        },
        chainId: `stellar:${process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "pubnet" : "testnet"}`,
      });

      return { signedTxXdr: result.signedTxXdr };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.message?.includes("rejected") || err.message?.includes("denied")) {
        throw createWalletError(
          "User rejected the transaction",
          WalletErrorCode.UserRejected,
          this.id,
          err
        );
      }
      throw createWalletError(
        err.message || "Transaction signing failed",
        WalletErrorCode.SigningFailed,
        this.id,
        err
      );
    }
  }

  async getNetwork(): Promise<WalletNetwork | null> {
    const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "pubnet" : "testnet";
    return {
      network,
      networkPassphrase:
        network === "pubnet"
          ? "Public Global Stellar Network ; September 2015"
          : "Test SDF Network ; September 2015",
    };
  }

  async isConnected(): Promise<boolean> {
    const session = await restoreSession();
    return session !== null;
  }
}
