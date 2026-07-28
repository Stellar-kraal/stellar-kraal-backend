# Future Work: Hardware Wallet (Ledger) Support

## Status: Planned

## Overview

Hardware wallet support via Ledger is planned as a future enhancement to the wallet abstraction layer. This document outlines the design considerations and implementation approach.

## Design Considerations

### USB/HID Transport

Ledger devices communicate via USB HID (WebUSB or WebHID API). The browser must have WebUSB/WebHID support, which is available in Chromium-based browsers but not Firefox or Safari.

### Stellar App on Ledger

The Stellar app must be installed on the Ledger device via Ledger Live. The app exposes:
- Public key derivation from seed phrase
- Transaction signing via `stellar_signTransaction` APDU commands

### Adapter Implementation

A `LedgerAdapter` would implement the `WalletAdapter` interface:

```typescript
export class LedgerAdapter implements WalletAdapter {
  readonly id = WalletId.Ledger;
  readonly name = "Ledger";

  async detect(): Promise<boolean> {
    // Check for WebUSB/WebHID support
    return typeof navigator !== "undefined" && "usb" in navigator;
  }

  async connect(): Promise<WalletConnectionResult> {
    // 1. Request USB device access
    // 2. Open Stellar app on device
    // 3. Derive public key
    // 4. Return address
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions) {
    // 1. Build transaction from XDR
    // 2. Send signing request to device
    // 3. Return signed XDR
  }
}
```

### UX Challenges

1. **Device detection**: WebUSB requires user gesture to enumerate devices
2. **App state**: User must have Stellar app open on the device
3. **Path selection**: Multiple Stellar accounts may derive from different BIP-44 paths
4. **Confirmation flow**: Device shows transaction details for physical confirmation

### Implementation Steps

1. Add `WalletId.Ledger` to the enum
2. Create `LedgerAdapter` using `@ledgerhq/hw-transport-webusb` and `@ledgerhq/hw-app-stellar`
3. Add device detection to the wallet registry
4. Update `WalletConnectModal` to show Ledger option
5. Handle device-specific error states (app not open, wrong app, device locked)

### Dependencies

```
@ledgerhq/hw-transport-webusb
@ledgerhq/hw-app-stellar
```

### Browser Compatibility

| Browser | WebUSB | WebHID | Status |
|---------|--------|--------|--------|
| Chrome  | ✅     | ✅     | Supported |
| Edge    | ✅     | ✅     | Supported |
| Firefox | ❌     | ❌     | Not supported |
| Safari  | ❌     | ❌     | Not supported |

### Migration Path

The wallet abstraction layer is designed to accommodate Ledger without breaking changes:
1. Add `WalletId.Ledger` to the enum
2. Create the adapter
3. Register it in the wallet registry
4. The modal and hooks automatically pick it up
