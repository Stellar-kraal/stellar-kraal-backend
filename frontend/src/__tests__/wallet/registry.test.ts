import { detectWallets, getAdapter } from "@/lib/wallet/registry";
import { WalletId } from "@/lib/wallet/types";

describe("Wallet registry", () => {
  describe("getAdapter", () => {
    it("returns a FreighterAdapter for WalletId.Freighter", () => {
      const adapter = getAdapter(WalletId.Freighter);
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe(WalletId.Freighter);
      expect(adapter.name).toBe("Freighter");
    });

    it("returns an XBullAdapter for WalletId.xBull", () => {
      const adapter = getAdapter(WalletId.xBull);
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe(WalletId.xBull);
    });

    it("returns a LobstrAdapter for WalletId.Lobstr", () => {
      const adapter = getAdapter(WalletId.Lobstr);
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe(WalletId.Lobstr);
    });

    it("returns a WalletConnectAdapter for WalletId.WalletConnect", () => {
      const adapter = getAdapter(WalletId.WalletConnect);
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe(WalletId.WalletConnect);
    });

    it("throws for unknown wallet IDs", () => {
      expect(() => getAdapter("unknown" as WalletId)).toThrow(
        "Unknown wallet: unknown"
      );
    });
  });

  describe("detectWallets", () => {
    it("returns metadata for all registered wallets", async () => {
      const wallets = await detectWallets();
      expect(wallets).toHaveLength(4);

      const ids = wallets.map((w) => w.id);
      expect(ids).toContain(WalletId.Freighter);
      expect(ids).toContain(WalletId.xBull);
      expect(ids).toContain(WalletId.Lobstr);
      expect(ids).toContain(WalletId.WalletConnect);
    });

    it("WalletConnect is always available", async () => {
      const wallets = await detectWallets();
      const wc = wallets.find((w) => w.id === WalletId.WalletConnect);
      expect(wc?.isAvailable).toBe(true);
    });

    it("includes metadata for each wallet", async () => {
      const wallets = await detectWallets();
      for (const wallet of wallets) {
        expect(wallet.name).toBeTruthy();
        expect(wallet.icon).toBeTruthy();
        expect(wallet.url).toBeTruthy();
        expect(wallet.description).toBeTruthy();
      }
    });
  });
});
