import { WalletManager } from "@/lib/wallet/wallet-manager";
import { WalletId, WalletState } from "@/lib/wallet/types";

// Mock the registry module
jest.mock("@/lib/wallet/registry", () => ({
  getAdapter: jest.fn(),
  detectWallets: jest.fn().mockResolvedValue([
    {
      id: WalletId.Freighter,
      name: "Freighter",
      icon: "🦊",
      url: "https://freighter.app",
      description: "Browser extension for Stellar",
      isInstalled: true,
      isAvailable: true,
    },
    {
      id: WalletId.WalletConnect,
      name: "WalletConnect",
      icon: "🔗",
      url: "https://walletconnect.com",
      description: "Connect via QR code",
      isInstalled: false,
      isAvailable: true,
    },
  ]),
}));

describe("WalletManager", () => {
  let manager: WalletManager;

  beforeEach(() => {
    manager = new WalletManager();
    localStorage.clear();
  });

  it("starts in disconnected state", () => {
    const state = manager.getState();
    expect(state.state).toBe(WalletState.Disconnected);
    expect(state.address).toBeNull();
    expect(state.walletId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("notifies subscribers on state change", async () => {
    const listener = jest.fn();
    manager.subscribe(listener);

    await manager.initialize();

    expect(listener).toHaveBeenCalled();
  });

  it("clears error state", () => {
    manager["setState"]({ error: "test error" });
    expect(manager.getState().error).toBe("test error");

    manager.clearError();
    expect(manager.getState().error).toBeNull();
  });

  describe("session persistence", () => {
    it("saves session to localStorage on connect", async () => {
      const mockAdapter = {
        id: WalletId.Freighter,
        name: "Freighter",
        detect: jest.fn().mockResolvedValue(true),
        connect: jest.fn().mockResolvedValue({
          address: "GABCDEF1234567890ABCDEF",
          walletId: WalletId.Freighter,
        }),
        disconnect: jest.fn(),
        getAddress: jest.fn(),
        signTransaction: jest.fn(),
        isConnected: jest.fn(),
        isAllowed: jest.fn(),
      };

      const { getAdapter } = require("@/lib/wallet/registry");
      getAdapter.mockReturnValue(mockAdapter);

      await manager.initialize();
      await manager.connect(WalletId.Freighter);

      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      expect(saved).toBeTruthy();

      const session = JSON.parse(saved!);
      expect(session.address).toBe("GABCDEF1234567890ABCDEF");
      expect(session.walletId).toBe(WalletId.Freighter);
      expect(session.connectedAt).toBeGreaterThan(0);
    });

    it("clears session on disconnect", async () => {
      const mockAdapter = {
        id: WalletId.Freighter,
        name: "Freighter",
        detect: jest.fn().mockResolvedValue(true),
        connect: jest.fn().mockResolvedValue({
          address: "GABCDEF1234567890ABCDEF",
          walletId: WalletId.Freighter,
        }),
        disconnect: jest.fn(),
        getAddress: jest.fn(),
        signTransaction: jest.fn(),
        isConnected: jest.fn(),
        isAllowed: jest.fn(),
      };

      const { getAdapter } = require("@/lib/wallet/registry");
      getAdapter.mockReturnValue(mockAdapter);

      await manager.initialize();
      await manager.connect(WalletId.Freighter);
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeTruthy();

      await manager.disconnect();
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    it("rejects expired sessions", async () => {
      const expiredSession = {
        address: "GABCDEF1234567890ABCDEF",
        walletId: WalletId.Freighter,
        connectedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(expiredSession));

      await manager.initialize();

      const state = manager.getState();
      expect(state.state).toBe(WalletState.Disconnected);
      expect(state.address).toBeNull();
    });
  });
});
