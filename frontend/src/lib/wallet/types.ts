"use client";

export enum WalletId {
  Freighter = "freighter",
  xBull = "xbull",
  Lobstr = "lobstr",
  WalletConnect = "walletconnect",
}

export enum WalletState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Error = "error",
}

export interface WalletMetadata {
  id: WalletId;
  name: string;
  icon: string;
  url: string;
  description: string;
  isInstalled: boolean;
  isAvailable: boolean;
  downloadUrl?: string;
}

export interface WalletAdapter {
  readonly id: WalletId;
  readonly name: string;

  detect(): Promise<boolean>;
  connect(): Promise<WalletConnectionResult>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string>;
  signTransaction(
    xdr: string,
    opts?: SignTransactionOptions
  ): Promise<SignTransactionResult>;
  getNetwork?(): Promise<WalletNetwork | null>;
  isConnected?(): Promise<boolean>;
  isAllowed?(): Promise<boolean>;
}

export interface WalletConnectionResult {
  address: string;
  walletId: WalletId;
}

export interface SignTransactionOptions {
  network?: string;
  networkPassphrase?: string;
  address?: string;
}

export interface SignTransactionResult {
  signedTxXdr: string;
  signerAddress?: string;
}

export interface WalletNetwork {
  network: string;
  networkPassphrase: string;
  networkUrl?: string;
}

export interface WalletSession {
  address: string;
  walletId: WalletId;
  connectedAt: number;
  network?: string;
}

export interface WalletError extends Error {
  code: WalletErrorCode;
  walletId?: WalletId;
}

export enum WalletErrorCode {
  NotInstalled = "WALLET_NOT_INSTALLED",
  UserRejected = "WALLET_USER_REJECTED",
  ConnectionFailed = "WALLET_CONNECTION_FAILED",
  SigningFailed = "WALLET_SIGNING_FAILED",
  NetworkMismatch = "WALLET_NETWORK_MISMATCH",
  SessionExpired = "WALLET_SESSION_EXPIRED",
  Unknown = "WALLET_UNKNOWN_ERROR",
}

export const SESSION_STORAGE_KEY = "stellarkraal_wallet_session";
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createWalletError(
  message: string,
  code: WalletErrorCode,
  walletId?: WalletId,
  cause?: Error
): WalletError {
  const error = new Error(message) as WalletError;
  error.code = code;
  error.walletId = walletId;
  if (cause) error.cause = cause;
  return error;
}
