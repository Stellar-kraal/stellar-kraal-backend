"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWalletContext } from "@/providers/WalletProvider";
import { WalletId, WalletMetadata } from "@/lib/wallet/types";

interface WalletConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WalletConnectModal({
  open,
  onClose,
}: WalletConnectModalProps) {
  const { wallets, connect, isConnected, disconnect, walletId, error, clearError } =
    useWalletContext();
  const [connectingId, setConnectingId] = useState<WalletId | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
    } else {
      previousFocusRef.current?.focus();
      setConnectingId(null);
      setLocalError(null);
      clearError();
    }
  }, [open, clearError]);

  useEffect(() => {
    if (error) {
      setLocalError(error);
      setConnectingId(null);
    }
  }, [error]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  async function handleConnect(wallet: WalletMetadata) {
    if (!wallet.isAvailable) {
      window.open(wallet.downloadUrl ?? wallet.url, "_blank");
      return;
    }

    if (isConnected && walletId === wallet.id) {
      onClose();
      return;
    }

    setConnectingId(wallet.id);
    setLocalError(null);
    clearError();

    try {
      if (isConnected && walletId) {
        await disconnect();
      }
      await connect(wallet.id);
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Connection failed";
      setLocalError(message);
    } finally {
      setConnectingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white dark:bg-[#1C1008] rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-5 outline-none focus:ring-2 focus:ring-gold"
      >
        <div className="flex items-center justify-between">
          <h2
            id="wallet-modal-title"
            className="text-xl font-bold text-brown-700 dark:text-cream"
          >
            Connect Wallet
          </h2>
          <button
            onClick={onClose}
            aria-label="Close wallet selection"
            className="text-brown-400 hover:text-brown-700 dark:hover:text-cream transition p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-brown-500 dark:text-cream/60">
          Choose a wallet to connect to StellarKraal.
        </p>

        {localError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600"
          >
            {localError}
          </div>
        )}

        <ul className="space-y-2" role="listbox" aria-label="Available wallets">
          {wallets.map((wallet) => {
            const isActive = isConnected && walletId === wallet.id;
            const isConnecting = connectingId === wallet.id;

            return (
              <li key={wallet.id} role="option" aria-selected={isActive}>
                <button
                  onClick={() => handleConnect(wallet)}
                  disabled={isConnecting}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition text-left focus:outline-none focus:ring-2 focus:ring-gold ${
                    isActive
                      ? "bg-gold-100 border-2 border-gold-400 dark:bg-gold-900/30 dark:border-gold-600"
                      : wallet.isAvailable
                        ? "border border-brown-200 dark:border-gold/20 hover:border-gold hover:bg-gold-50 dark:hover:bg-gold-900/10"
                        : "border border-brown-100 dark:border-gold/10 opacity-60"
                  }`}
                >
                  <span className="text-2xl flex-shrink-0" aria-hidden="true">
                    {wallet.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-brown-700 dark:text-cream">
                        {wallet.name}
                      </span>
                      {isActive && (
                        <span className="text-xs bg-gold text-brown-700 px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brown-500 dark:text-cream/50 mt-0.5 truncate">
                      {wallet.isAvailable
                        ? wallet.description
                        : `Not installed — ${wallet.description}`}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isConnecting ? (
                      <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                    ) : wallet.isAvailable ? (
                      isActive ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            disconnect().then(onClose);
                          }}
                          className="text-xs text-red-500 hover:text-red-700 underline"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <span className="text-xs text-brown-400 dark:text-cream/40">
                          →
                        </span>
                      )
                    ) : (
                      <a
                        href={wallet.downloadUrl ?? wallet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-gold hover:text-gold/80 underline"
                      >
                        Install
                      </a>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Future work: Ledger support note */}
        <div className="border-t border-brown-100 dark:border-gold/10 pt-3">
          <p className="text-xs text-brown-400 dark:text-cream/40 text-center">
            Hardware wallet (Ledger) support coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
