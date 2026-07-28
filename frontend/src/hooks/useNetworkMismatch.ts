"use client";
import { useNetworkMismatch as useNetworkMismatchFromWallet } from "@/hooks/wallet/useNetworkMismatch";

/**
 * Re-export for backward compatibility.
 * Previously Freighter-specific, now works with any connected wallet.
 */
export { useNetworkMismatchFromWallet as useNetworkMismatch };
