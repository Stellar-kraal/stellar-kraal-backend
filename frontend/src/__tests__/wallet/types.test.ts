import {
  WalletId,
  WalletState,
  WalletErrorCode,
  SESSION_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  createWalletError,
  WalletError,
} from "../types";

describe("Wallet types and utilities", () => {
  describe("createWalletError", () => {
    it("creates an error with the correct code and walletId", () => {
      const error = createWalletError(
        "test message",
        WalletErrorCode.ConnectionFailed,
        WalletId.Freighter
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("test message");
      expect(error.code).toBe(WalletErrorCode.ConnectionFailed);
      expect(error.walletId).toBe(WalletId.Freighter);
    });

    it("preserves the cause chain", () => {
      const cause = new Error("original error");
      const error = createWalletError(
        "wrapper message",
        WalletErrorCode.SigningFailed,
        WalletId.xBull,
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it("works without a walletId", () => {
      const error = createWalletError(
        "generic error",
        WalletErrorCode.Unknown
      );

      expect(error.code).toBe(WalletErrorCode.Unknown);
      expect(error.walletId).toBeUndefined();
    });
  });

  describe("constants", () => {
    it("has a valid session storage key", () => {
      expect(SESSION_STORAGE_KEY).toBe("stellarkraal_wallet_session");
    });

    it("session max age is 24 hours", () => {
      expect(SESSION_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe("WalletId enum", () => {
    it("includes all expected wallets", () => {
      expect(WalletId.Freighter).toBe("freighter");
      expect(WalletId.xBull).toBe("xbull");
      expect(WalletId.Lobstr).toBe("lobstr");
      expect(WalletId.WalletConnect).toBe("walletconnect");
    });
  });

  describe("WalletState enum", () => {
    it("includes all expected states", () => {
      expect(WalletState.Disconnected).toBe("disconnected");
      expect(WalletState.Connecting).toBe("connecting");
      expect(WalletState.Connected).toBe("connected");
      expect(WalletState.Error).toBe("error");
    });
  });

  describe("WalletErrorCode enum", () => {
    it("includes all expected error codes", () => {
      expect(WalletErrorCode.NotInstalled).toBe("WALLET_NOT_INSTALLED");
      expect(WalletErrorCode.UserRejected).toBe("WALLET_USER_REJECTED");
      expect(WalletErrorCode.ConnectionFailed).toBe("WALLET_CONNECTION_FAILED");
      expect(WalletErrorCode.SigningFailed).toBe("WALLET_SIGNING_FAILED");
      expect(WalletErrorCode.NetworkMismatch).toBe("WALLET_NETWORK_MISMATCH");
      expect(WalletErrorCode.SessionExpired).toBe("WALLET_SESSION_EXPIRED");
      expect(WalletErrorCode.Unknown).toBe("WALLET_UNKNOWN_ERROR");
    });
  });
});
