# Frontend & Wallet UX Issues

## Issue 23: Transaction Simulation and Pre-Signing Preview with Fee and Effect Breakdown

**Work:** Before a user signs any Stellar transaction (credit purchase, retirement, listing creation), simulate the transaction using Soroban's `simulateTransaction` RPC method and display a human-readable preview: estimated fee, XLM balance change, credits to be transferred, and any authorization requirements. Reject simulation failures with actionable error messages before the Freighter signing dialog opens.

**Scope:** In scope: simulation hook/service layer in the Next.js frontend, human-readable transaction breakdown component (fee, effects, auth requirements), error state handling for simulation failures, Freighter integration. Out of scope: multi-wallet simulation (covered in a separate issue), gas-fee estimation optimization.

**Acceptance Criteria:**
- Every transaction-initiating action shows a simulation preview modal before the Freighter dialog
- Preview displays: estimated fee in XLM, net credit balance change, and required signers
- Simulation failures surface a user-facing error with the failure reason (e.g., "Insufficient balance", "Contract error: CREDIT_NOT_FOUND") rather than a raw error code
- Preview component is accessible (WCAG 2.1 AA): keyboard navigable, screen-reader labels on all data fields
- Simulation is re-run automatically if the user modifies quantity before confirming

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** frontend,wallet,ux,help-wanted
**Relevant Files:** `frontend/src/`, `frontend/src/components/transaction/`

---

## Issue 24: Multi-Wallet Support: WalletConnect, xBull, and Lobstr in Addition to Freighter

**Work:** The frontend currently only supports the Freighter wallet extension. Implement a wallet abstraction layer using a standard Stellar wallet interface (Stellar Wallets Kit or equivalent) that supports Freighter, xBull, Lobstr, and WalletConnect-compatible wallets. The abstraction must handle wallet detection, connection lifecycle, session persistence, and disconnection gracefully.

**Scope:** In scope: wallet abstraction service, connection modal with wallet selection, session persistence (reconnect on page reload), disconnect flow, wallet-specific error handling, tests for the abstraction layer. Out of scope: hardware wallet (Ledger) support (document as future work), mobile wallet deep links.

**Acceptance Criteria:**
- Wallet selection modal lists all supported wallets and shows install prompts for unavailable ones
- Wallet session persists across page reloads without requiring re-authentication
- Switching wallets mid-session clears all user-specific cached state and re-fetches from the new address
- All wallet interactions go through the abstraction interface; no Freighter-specific SDK calls in business logic components
- Disconnection is handled gracefully: UI reflects wallet-not-connected state without uncaught errors

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** frontend,wallet,ux,help-wanted
**Relevant Files:** `frontend/src/`, `frontend/src/hooks/wallet/`, `frontend/src/providers/`

---

## Issue 25: Offline-Resilient State Management with Optimistic UI and Conflict Resolution

**Work:** The marketplace frontend has no offline resilience: if the user loses connectivity mid-session, pending transactions and unsaved state are lost with no recovery path. Implement an offline-resilient state layer using a client-side cache (React Query or SWR with IndexedDB persistence) that preserves pending operations, shows optimistic UI updates, and reconciles with on-chain state when connectivity resumes.

**Scope:** In scope: IndexedDB-backed persistence layer, optimistic updates for trade and retirement actions, conflict detection when cached state diverges from on-chain state after reconnect, user-facing reconciliation prompt. Out of scope: service worker / full PWA offline mode, background sync for transaction submission while offline.

**Acceptance Criteria:**
- Credit listings, portfolio balance, and retirement history are cached and served from IndexedDB during offline periods with a clear "offline — showing cached data" indicator
- Optimistic UI updates for pending trades/retirements are preserved across page reloads
- On reconnect, the frontend detects divergence between cached and on-chain state and prompts the user to refresh affected data
- Cache is invalidated correctly when a Stellar transaction is confirmed (by polling transaction status)
- All cached data has an explicit TTL; stale cache is never presented as current without an indicator

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** frontend,ux,resilience,help-wanted
**Relevant Files:** `frontend/src/`, `frontend/src/state/`, `frontend/src/hooks/`

---

## Issue 26: Accessible Financial Data Tables with Sorting, Filtering, and Screen-Reader Optimization

**Work:** The marketplace and portfolio views use data tables for credit listings and retirement history that fail WCAG 2.1 AA accessibility requirements: missing ARIA roles, non-keyboard-navigable sort controls, no announcements for dynamic data updates, and color-only status indicators. Audit and rewrite the financial data table components to be fully accessible, performant with large datasets (virtualization), and internationalizable.

**Scope:** In scope: ARIA audit and remediation, keyboard navigation for sort/filter, live-region announcements for data updates, color-plus-icon status indicators, row virtualization for tables with >100 rows, i18n-ready column headers. Out of scope: full i18n implementation (separate effort), mobile-specific table layouts.

**Acceptance Criteria:**
- All table components pass automated accessibility audit (axe-core) with zero violations at AA level
- Tables are fully keyboard navigable: sort, filter, row selection, pagination without mouse
- Dynamic data updates (new listing, price change) trigger a screen-reader announcement via `aria-live`
- Tables with >100 rows use windowed/virtual rendering with no perceptible scroll jank on mid-range hardware
- Color-only indicators (e.g., green for active, red for expired) are replaced with icon+color+label combinations

**Complexity:** Medium
**Estimated Time Frame:** 2–3 weeks
**Labels:** frontend,accessibility,ux,help-wanted
**Relevant Files:** `frontend/src/components/marketplace/`, `frontend/src/components/portfolio/`

---

## Issue 27: Real-Time Credit Price Chart with On-Chain Event Feed Integration

**Work:** Build a real-time price chart component for the marketplace that subscribes to Stellar Horizon event streams (or polls the backend's event log) to display credit price history, trade volume, and oracle price updates. The chart must handle sparse data (credits that haven't traded recently), show oracle price as a reference line, and degrade gracefully when the event feed is unavailable.

**Scope:** In scope: Horizon event stream subscription or backend SSE/WebSocket endpoint, price chart component (using Recharts or a library already in the project), oracle reference line overlay, sparse-data interpolation strategy, graceful degradation. Out of scope: order-book depth chart, full trading terminal UI.

**Acceptance Criteria:**
- Chart displays price history for any listed credit going back to its first trade
- New trades update the chart in real-time (≤5 second latency from on-chain confirmation)
- Oracle reference price is displayed as a distinct line with a legend label
- When the event feed is unavailable, the chart shows last-known data with a "data may be delayed" indicator and does not crash
- Chart is accessible: data points have keyboard-accessible tooltips and an alternative tabular data view

**Complexity:** High
**Estimated Time Frame:** 2–3 weeks
**Labels:** frontend,ux,real-time,help-wanted
**Relevant Files:** `frontend/src/components/marketplace/`, `backend/src/events/`

---

## Issue 28: Certificate of Retirement PDF Generation with On-Chain Proof

**Work:** When a user retires carbon credits, they need a verifiable certificate to present to auditors and regulators. Build a PDF certificate generation system (server-side) that includes: credit metadata (project, vintage, quantity, standard), the retiring party's Stellar address, the Stellar transaction hash, a QR code linking to the Horizon transaction explorer, and the oracle-attested carbon value at time of retirement. The certificate must be reproducible from on-chain data alone.

**Scope:** In scope: PDF generation service (NestJS backend using `pdfkit` or equivalent), certificate template design, `GET /retirements/:id/certificate` endpoint, QR code with Horizon link, reproducibility guarantee (same inputs produce identical certificate). Out of scope: certificate registry (third-party), digital signature on the PDF (document as future enhancement).

**Acceptance Criteria:**
- `GET /retirements/:id/certificate` returns a PDF with all required fields populated from on-chain and database data
- Certificate is reproducible: calling the endpoint twice for the same retirement ID produces byte-identical PDFs
- QR code links to the correct Horizon transaction explorer URL for testnet and mainnet
- Certificate generation is tested with a known retirement fixture; output is snapshot-tested
- Frontend "Download Certificate" button is accessible (keyboard activatable, screen-reader labelled)

**Complexity:** Medium
**Estimated Time Frame:** 1–2 weeks
**Labels:** frontend,backend,compliance,ux,help-wanted
**Relevant Files:** `backend/src/retirements/`, `frontend/src/components/portfolio/`
