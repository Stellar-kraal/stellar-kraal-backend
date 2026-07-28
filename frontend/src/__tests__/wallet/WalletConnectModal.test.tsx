import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WalletConnectModal from "@/components/wallet/WalletConnectModal";
import { WalletProvider } from "@/providers/WalletProvider";
import { WalletId, WalletState } from "@/lib/wallet/types";

// Mock the wallet manager
jest.mock("@/lib/wallet/wallet-manager", () => ({
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
        {
          id: WalletId.xBull,
          name: "xBull",
          icon: "🐂",
          url: "https://xbull.app",
          description: "Browser extension for Stellar",
          isInstalled: false,
          isAvailable: false,
          downloadUrl: "https://xbull.app",
        },
        {
          id: WalletId.Lobstr,
          name: "LOBSTR",
          icon: "🦞",
          url: "https://lobstr.co",
          description: "Stellar wallet",
          isInstalled: false,
          isAvailable: false,
          downloadUrl: "https://lobstr.co",
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
      ],
    }),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    initialize: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    clearError: jest.fn(),
  }),
}));

function renderWithProvider(ui: React.ReactElement) {
  return render(<WalletProvider>{ui}</WalletProvider>);
}

describe("WalletConnectModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = renderWithProvider(
      <WalletConnectModal open={false} onClose={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the modal when open", () => {
    renderWithProvider(
      <WalletConnectModal open={true} onClose={jest.fn()} />
    );
    expect(screen.getByText("Connect Wallet")).toBeTruthy();
    expect(screen.getByText("Freighter")).toBeTruthy();
    expect(screen.getByText("WalletConnect")).toBeTruthy();
  });

  it("shows install link for unavailable wallets", () => {
    renderWithProvider(
      <WalletConnectModal open={true} onClose={jest.fn()} />
    );
    const installLinks = screen.getAllByText("Install");
    expect(installLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when clicking the close button", () => {
    const onClose = jest.fn();
    renderWithProvider(
      <WalletConnectModal open={true} onClose={onClose} />
    );
    fireEvent.click(screen.getByLabelText("Close wallet selection"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when pressing Escape", () => {
    const onClose = jest.fn();
    renderWithProvider(
      <WalletConnectModal open={true} onClose={onClose} />
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the Ledger coming soon note", () => {
    renderWithProvider(
      <WalletConnectModal open={true} onClose={jest.fn()} />
    );
    expect(screen.getByText(/Hardware wallet/)).toBeTruthy();
  });
});
