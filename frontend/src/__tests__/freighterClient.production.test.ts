/**
 * Regression test for security issue #66.
 *
 * Verifies that the window.__STELLARKRAAL_E2E__ hook is completely
 * unreachable when NODE_ENV === 'production'.  The guard in getTestApi()
 * must cause every exported function to ignore the hook, which means the
 * hook cannot be used by any script (XSS, malicious extension, compromised
 * dependency) to spoof wallet connection or forge signed transactions.
 *
 * Threat: FE-01 (Spoofing) — docs/security/threat-model.md#4-frontend
 *
 * Closes #66
 */

// Swap NODE_ENV to production *before* the module is imported so that
// webpack / ts-jest / Next.js dead-code-elimination logic would mirror what
// the real production bundle does.  We store and restore the original value
// so other tests in the suite are not affected.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeAll(() => {
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "production",
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(process.env, "NODE_ENV", {
    value: ORIGINAL_NODE_ENV,
    writable: true,
    configurable: true,
  });
});

describe("freighterClient — production build guard (issue #66)", () => {
  const SPOOFED_ADDRESS = "GSPOOF000000000000000000000000000000000000000000000000";
  const SPOOFED_XDR = "SPOOFED_SIGNED_XDR";

  // Re-require the module inside each test so NODE_ENV is already 'production'
  // when the module-level constant is evaluated.
  function loadModule() {
    jest.resetModules();
    // Provide a minimal wallet-manager stub so the import does not error out.
    jest.mock("@/lib/wallet/wallet-manager", () => ({
      getWalletManager: () => ({
        getState: () => ({ state: "disconnected" }),
        signTransaction: jest.fn(),
      }),
    }));
    jest.mock("@/lib/wallet/types", () => ({
      WalletId: { Freighter: "freighter" },
      WalletErrorCode: { SessionExpired: "SESSION_EXPIRED" },
      createWalletError: (msg: string, code: string) => new Error(`${code}: ${msg}`),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/lib/freighterClient");
  }

  beforeEach(() => {
    // Plant a spoofed E2E hook on window — simulates an attacker setting it.
    Object.defineProperty(window, "__STELLARKRAAL_E2E__", {
      value: {
        isConnected: jest.fn().mockResolvedValue({ isConnected: true }),
        isAllowed: jest.fn().mockResolvedValue({ isAllowed: true }),
        setAllowed: jest.fn().mockResolvedValue({ isAllowed: true }),
        getAddress: jest.fn().mockResolvedValue({ address: SPOOFED_ADDRESS }),
        signTransaction: jest.fn().mockResolvedValue({ signedTxXdr: SPOOFED_XDR }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Clean up the hook so it does not leak between tests.
    Object.defineProperty(window, "__STELLARKRAAL_E2E__", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("isConnected() does not use the spoofed E2E hook in production", async () => {
    const { isConnected } = loadModule();
    const result = await isConnected();
    // Without the production guard the mock would return { isConnected: true }.
    // With the guard in place the real wallet-manager path runs (disconnected
    // state) so it must return { isConnected: false }.
    expect(result).toEqual({ isConnected: false });
    expect((window.__STELLARKRAAL_E2E__ as any)?.isConnected).not.toHaveBeenCalled();
  });

  it("isAllowed() does not use the spoofed E2E hook in production", async () => {
    const { isAllowed } = loadModule();
    // FreighterAdapter will not be available in jsdom — the catch branch runs
    // and returns { isAllowed: false } which is different from the spoofed true.
    const result = await isAllowed();
    expect(result).toEqual({ isAllowed: false });
    expect((window.__STELLARKRAAL_E2E__ as any)?.isAllowed).not.toHaveBeenCalled();
  });

  it("getAddress() does not return the spoofed address in production", async () => {
    const { getAddress } = loadModule();
    // Real path: wallet-manager returns disconnected, so getAddress throws.
    await expect(getAddress()).rejects.toThrow();
    expect((window.__STELLARKRAAL_E2E__ as any)?.getAddress).not.toHaveBeenCalled();
  });

  it("signTransaction() does not return the spoofed XDR in production", async () => {
    const { signTransaction } = loadModule();
    // Real path: wallet-manager returns disconnected, so signTransaction throws.
    await expect(signTransaction("REAL_XDR")).rejects.toThrow();
    expect((window.__STELLARKRAAL_E2E__ as any)?.signTransaction).not.toHaveBeenCalled();
  });

  it("window.__STELLARKRAAL_E2E__ is present on window but never consulted", async () => {
    // This is the key regression assertion: the hook is reachable in the DOM
    // (e.g., set by an attacker) but the production guard makes the module
    // ignore it entirely.
    expect(window.__STELLARKRAAL_E2E__).toBeDefined(); // attacker set it
    const { isConnected } = loadModule();
    await isConnected();
    // None of the hook methods should have been called.
    expect((window.__STELLARKRAAL_E2E__ as any)?.isConnected).not.toHaveBeenCalled();
  });
});
