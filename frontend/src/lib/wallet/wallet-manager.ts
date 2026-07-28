"use client";

import {
  WalletAdapter,
  WalletId,
  WalletSession,
  WalletState,
  SignTransactionOptions,
  SignTransactionResult,
  WalletNetwork,
  SESSION_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  WalletErrorCode,
  createWalletError,
} from "./types";
import { getAdapter, detectWallets } from "./registry";

export interface WalletManagerState {
  state: WalletState;
  address: string | null;
  walletId: WalletId | null;
  error: string | null;
  wallets: Awaited<ReturnType<typeof detectWallets>> | null;
}

type Listener = (state: WalletManagerState) => void;

export class WalletManager {
  private state: WalletManagerState = {
    state: WalletState.Disconnected,
    address: null,
    walletId: null,
    error: null,
    wallets: null,
  };

  private listeners = new Set<Listener>();
  private initialized = false;

  getState(): WalletManagerState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  private setState(partial: Partial<WalletManagerState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Detect available wallets
    const wallets = await detectWallets();
    this.setState({ wallets });

    // Try to restore session
    const saved = this.loadSession();
    if (saved) {
      try {
        const adapter = getAdapter(saved.walletId);
        const isStillConnected = adapter.isConnected
          ? await adapter.isConnected()
          : true;

        if (isStillConnected) {
          const address = await adapter.getAddress();
          this.setState({
            state: WalletState.Connected,
            address,
            walletId: saved.walletId,
            error: null,
          });
          return;
        }
      } catch {
        // Session invalid, clear it
      }
      this.clearSession();
    }
  }

  async connect(walletId: WalletId): Promise<void> {
    const adapter = getAdapter(walletId);

    // Check if wallet is installed
    const isInstalled = await adapter.detect();
    if (!isInstalled && walletId !== WalletId.WalletConnect) {
      throw createWalletError(
        `${adapter.name} is not installed`,
        WalletErrorCode.NotInstalled,
        walletId
      );
    }

    this.setState({
      state: WalletState.Connecting,
      error: null,
    });

    try {
      const result = await adapter.connect();
      this.setState({
        state: WalletState.Connected,
        address: result.address,
        walletId,
        error: null,
      });
      this.saveSession({
        address: result.address,
        walletId,
        connectedAt: Date.now(),
      });
    } catch (e: unknown) {
      const error =
        e instanceof Error ? e.message : "Connection failed";
      this.setState({
        state: WalletState.Error,
        error,
      });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (this.state.walletId) {
      try {
        const adapter = getAdapter(this.state.walletId);
        await adapter.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }

    this.clearSession();
    this.setState({
      state: WalletState.Disconnected,
      address: null,
      walletId: null,
      error: null,
    });
  }

  async switchWallet(walletId: WalletId): Promise<void> {
    // Disconnect current wallet
    if (this.state.walletId) {
      await this.disconnect();
    }
    // Connect new wallet
    await this.connect(walletId);
  }

  async signTransaction(
    xdr: string,
    opts?: SignTransactionOptions
  ): Promise<SignTransactionResult> {
    if (!this.state.walletId || this.state.state !== WalletState.Connected) {
      throw createWalletError(
        "No wallet connected",
        WalletErrorCode.SessionExpired
      );
    }

    const adapter = getAdapter(this.state.walletId);
    return adapter.signTransaction(xdr, opts);
  }

  async getAddress(): Promise<string> {
    if (!this.state.walletId || this.state.state !== WalletState.Connected) {
      throw createWalletError(
        "No wallet connected",
        WalletErrorCode.SessionExpired
      );
    }

    const adapter = getAdapter(this.state.walletId);
    return adapter.getAddress();
  }

  async getNetwork(): Promise<WalletNetwork | null> {
    if (!this.state.walletId) return null;
    const adapter = getAdapter(this.state.walletId);
    return adapter.getNetwork?.() ?? null;
  }

  clearError(): void {
    this.setState({ error: null });
  }

  private loadSession(): WalletSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session: WalletSession = JSON.parse(raw);
      if (Date.now() - session.connectedAt > SESSION_MAX_AGE_MS) {
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  private saveSession(session: WalletSession): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage errors
    }
  }

  private clearSession(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}

let _instance: WalletManager | null = null;

export function getWalletManager(): WalletManager {
  if (!_instance) {
    _instance = new WalletManager();
  }
  return _instance;
}
