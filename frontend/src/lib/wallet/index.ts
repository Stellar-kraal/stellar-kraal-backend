export {
  WalletId,
  WalletState,
  WalletErrorCode,
  SESSION_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  createWalletError,
} from "./types";
export type {
  WalletMetadata,
  WalletAdapter,
  WalletConnectionResult,
  SignTransactionOptions,
  SignTransactionResult,
  WalletNetwork,
  WalletSession,
  WalletError,
} from "./types";

export { getAdapter, detectWallets } from "./registry";
export { getWalletManager, WalletManager } from "./wallet-manager";
export type { WalletManagerState } from "./wallet-manager";

export { FreighterAdapter } from "./adapters/freighter-adapter";
export { XBullAdapter } from "./adapters/xbull-adapter";
export { LobstrAdapter } from "./adapters/lobstr-adapter";
export { WalletConnectAdapter } from "./adapters/walletconnect-adapter";
