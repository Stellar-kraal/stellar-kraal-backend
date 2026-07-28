"use client";

import { WalletAdapter, WalletId, WalletMetadata } from "./types";
import { FreighterAdapter } from "./adapters/freighter-adapter";
import { XBullAdapter } from "./adapters/xbull-adapter";
import { LobstrAdapter } from "./adapters/lobstr-adapter";
import { WalletConnectAdapter } from "./adapters/walletconnect-adapter";

const WALLET_METADATA: Record<WalletId, Omit<WalletMetadata, "isInstalled" | "isAvailable">> = {
  [WalletId.Freighter]: {
    id: WalletId.Freighter,
    name: "Freighter",
    icon: "🦊",
    url: "https://freighter.app",
    description: "Browser extension for Stellar",
    downloadUrl: "https://freighter.app",
  },
  [WalletId.xBull]: {
    id: WalletId.xBull,
    name: "xBull",
    icon: "🐂",
    url: "https://xbull.app",
    description: "Browser extension for Stellar",
    downloadUrl: "https://xbull.app",
  },
  [WalletId.Lobstr]: {
    id: WalletId.Lobstr,
    name: "LOBSTR",
    icon: "🦞",
    url: "https://lobstr.co",
    description: "Stellar wallet with mobile and web support",
    downloadUrl: "https://lobstr.co",
  },
  [WalletId.WalletConnect]: {
    id: WalletId.WalletConnect,
    name: "WalletConnect",
    icon: "🔗",
    url: "https://walletconnect.com",
    description: "Connect via QR code to any compatible wallet",
  },
};

const DEFAULT_ORDER: WalletId[] = [
  WalletId.Freighter,
  WalletId.xBull,
  WalletId.Lobstr,
  WalletId.WalletConnect,
];

let _adapters: Map<WalletId, WalletAdapter> | null = null;

function getAdapters(): Map<WalletId, WalletAdapter> {
  if (!_adapters) {
    _adapters = new Map();
    _adapters.set(WalletId.Freighter, new FreighterAdapter());
    _adapters.set(WalletId.xBull, new XBullAdapter());
    _adapters.set(WalletId.Lobstr, new LobstrAdapter());
    _adapters.set(WalletId.WalletConnect, new WalletConnectAdapter());
  }
  return _adapters;
}

export function getAdapter(walletId: WalletId): WalletAdapter {
  const adapters = getAdapters();
  const adapter = adapters.get(walletId);
  if (!adapter) throw new Error(`Unknown wallet: ${walletId}`);
  return adapter;
}

export async function detectWallets(): Promise<WalletMetadata[]> {
  const adapters = getAdapters();
  const metadata: WalletMetadata[] = [];

  for (const walletId of DEFAULT_ORDER) {
    const adapter = adapters.get(walletId)!;
    const meta = WALLET_METADATA[walletId];

    let isInstalled = false;
    try {
      isInstalled = await adapter.detect();
    } catch {
      isInstalled = false;
    }

    metadata.push({
      ...meta,
      isInstalled,
      isAvailable: isInstalled || walletId === WalletId.WalletConnect,
    });
  }

  return metadata;
}
