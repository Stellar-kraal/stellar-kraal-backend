import { renderHook, act } from "@testing-library/react";
import React from "react";
import { WalletProvider, useWalletContext } from "@/providers/WalletProvider";
import { WalletId, WalletState } from "@/lib/wallet/types";

// Mock the wallet manager
jest.mock("@/lib/wallet/wallet-manager", () => {
  const actual = jest.requireActual("@/lib/wallet/wallet-manager");
  return {
    ...actual,
    getWalletManager: jest.fn().mockReturnValue({
      getState: jest.fn().mockReturnValue({
        state: WalletState.Disconnected,
        address: null,
        walletId: null,
        error: null,
        wallets: [
          {
            id: WalletId.Freighter,
            name: "Freighter",
            icon: "🦊",
            url: "https://freighter.app",
            description: "Browser extension for Stellar",
            isInstalled: true,
            isAvailable: true,
          },
        ],
      }),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      initialize: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      switchWallet: jest.fn().mockResolvedValue(undefined),
      signTransaction: jest.fn().mockResolvedValue({
        signedTxXdr: "mock-signed-xdr",
      }),
      getNetwork: jest.fn().mockResolvedValue({
        network: "testnet",
        networkPassphrase: "Test SDF Network ; September 2015",
      }),
      clearError: jest.fn(),
    }),
  };
});

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <WalletProvider>{children}</WalletProvider>;
  };
}

describe("useWalletContext", () => {
  it("provides wallet state", () => {
    const { result } = renderHook(() => useWalletContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current.state).toBe(WalletState.Disconnected);
    expect(result.current.address).toBeNull();
    expect(result.current.walletId).toBeNull();
  });

  it("provides connect function", () => {
    const { result } = renderHook(() => useWalletContext(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.connect).toBe("function");
  });

  it("provides disconnect function", () => {
    const { result } = renderHook(() => useWalletContext(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.disconnect).toBe("function");
  });

  it("provides signTransaction function", () => {
    const { result } = renderHook(() => useWalletContext(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.signTransaction).toBe("function");
  });

  it("provides wallet metadata", () => {
    const { result } = renderHook(() => useWalletContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current.wallets).toBeDefined();
    expect(Array.isArray(result.current.wallets)).toBe(true);
  });
});
