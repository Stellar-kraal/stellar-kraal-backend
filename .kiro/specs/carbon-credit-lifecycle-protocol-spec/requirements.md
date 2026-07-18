# Requirements Document

## Introduction

This specification covers the formal protocol requirements for the **Carbon Credit Lifecycle** on the StellarKraal platform — a Stellar/Soroban-based voluntary carbon market. The document defines the six core lifecycle operations: Project Registration, Credit Issuance, Marketplace Listing & Matching, Settlement, Retirement, and Revocation. It establishes the state machines, invariants, preconditions, postconditions, and glossary needed for an independent team to reimplement the protocol.

The protocol is implemented across four Soroban smart contract crates:
- `contracts/carbon_registry/src/lib.rs` — project and credit registry
- `contracts/carbon_credit/src/lib.rs` — SEP-41 token representing carbon credits
- `contracts/carbon_marketplace/src/lib.rs` — order matching and settlement
- `contracts/carbon_oracle/src/lib.rs` — price feeds from Xpansiv/Toucan

The produced artifact is a protocol specification document at `docs/protocol/carbon-credit-lifecycle.md`, not implementation code.

---

## Glossary

- **Additionality**: The property that a carbon reduction would not have occurred without the specific project's intervention. A credit without additionality does not represent a genuine offset.
- **Buffer Pool**: A reserve pool of credits held back from circulation to cover future invalidations or permanence failures. Protects buyers from retroactive loss.
- **Carbon Credit**: A tokenized unit representing one tonne of CO₂-equivalent greenhouse gas reduced, removed, or avoided, identified by a unique serial number.
- **Carbon_Credit_Contract**: The SEP-41 token contract at `contracts/carbon_credit/src/lib.rs` that manages minting, burning, and transfer of carbon credit tokens.
- **Carbon_Marketplace_Contract**: The order-book contract at `contracts/carbon_marketplace/src/lib.rs` that handles listings, order matching, and settlement.
- **Carbon_Oracle_Contract**: The price-feed contract at `contracts/carbon_oracle/src/lib.rs` that provides validated market prices from Xpansiv and Toucan data sources.
- **Carbon_Registry_Contract**: The registry contract at `contracts/carbon_registry/src/lib.rs` that manages project metadata, credit serial number assignment, and lifecycle state transitions.
- **Counterparty Risk**: The risk that the other party to a trade will fail to deliver credits or payment at settlement.
- **Credit Batch**: A set of carbon credits issued together from the same project vintage, sharing a contiguous serial number range.
- **Credit State**: The current lifecycle phase of a carbon credit — one of: `ISSUED`, `LISTED`, `ESCROWED`, `SETTLED`, `RETIRED`, `REVOKED`.
- **Escrow**: A temporary on-chain hold that locks credits and funds during the settlement window, preventing double-spending.
- **Methodology**: The audited standard under which a carbon project's reductions are quantified (e.g., Gold Standard, Verra VCS).
- **Order**: A signed intent to buy or sell a specified quantity of credits at a specified price, bound to a specific contract, network passphrase, and expiry ledger.
- **Permanence**: The assurance that a carbon reduction will persist over time (typically 100 years for forestry projects). Projects with low permanence carry higher revocation risk.
- **Project**: A registered carbon offset initiative with an on-chain identifier, methodology reference, validator address, and geographic metadata.
- **Project_State**: The current lifecycle phase of a project — one of: `PENDING`, `ACTIVE`, `SUSPENDED`, `DECOMMISSIONED`.
- **Protocol_Spec**: The artifact produced by this specification — `docs/protocol/carbon-credit-lifecycle.md`.
- **Retirement**: The permanent, irreversible burning of a carbon credit to claim the underlying offset. A retired credit is removed from circulation and cannot be transferred or traded.
- **Revocation**: An admin or validator action that invalidates previously issued credits due to permanence failure, fraud, or methodology non-compliance. Revoked credits are also removed from circulation but carry a different semantic from retirement.
- **Serial Number**: A globally unique identifier assigned to each carbon credit at issuance, combining the project ID, vintage year, and a monotonic sequence number.
- **Settlement**: The atomic exchange of carbon credits and payment tokens (USDC) between a matched buyer and seller, finalizing a trade.
- **Validator**: An accredited third-party entity authorized to approve projects and verify that issued credits meet the claimed methodology's standards.
- **Vintage**: The calendar year in which the carbon reduction represented by a credit occurred. Older vintages may trade at a discount in voluntary markets.

---

## Requirements

### Requirement 1: Project Registration

**User Story:** As a carbon project developer, I want to register a new carbon offset project on-chain, so that I can subsequently issue credits backed by that project.

#### Acceptance Criteria

1. WHEN a project registration request is submitted with a valid project ID, methodology reference, validator address, geographic coordinates, and project developer address, THE Carbon_Registry_Contract SHALL create a new project record in `PENDING` state.

2. THE Carbon_Registry_Contract SHALL enforce that no two project records share the same project ID; IF a duplicate project ID is submitted, THEN THE Carbon_Registry_Contract SHALL reject the registration with a typed `DuplicateProjectId` error.

3. WHEN a registered validator approves a `PENDING` project, THE Carbon_Registry_Contract SHALL transition the project state from `PENDING` to `ACTIVE` and record the validator's address and the approval ledger sequence.

4. IF a project registration is submitted without a valid methodology reference from the list of supported methodologies (Gold Standard, Verra VCS, or a registered custom methodology), THEN THE Carbon_Registry_Contract SHALL reject the registration with a typed `UnsupportedMethodology` error.

5. WHILE a project is in `PENDING` state, THE Carbon_Registry_Contract SHALL prevent any credit issuance against that project.

6. THE Carbon_Registry_Contract SHALL emit a versioned `ProjectRegistered` event for every successful registration, containing the project ID, developer address, methodology reference, and ledger sequence.

7. WHEN a project is approved by a validator, THE Carbon_Registry_Contract SHALL emit a versioned `ProjectApproved` event containing the project ID, validator address, and approval ledger sequence.

8. THE Carbon_Registry_Contract SHALL require `require_auth` on the validator's address before processing any project approval.

---

### Requirement 2: Credit Issuance

**User Story:** As an approved project developer or authorized issuer, I want to mint carbon credit tokens from an active project, so that those credits can be traded or retired on the marketplace.

#### Acceptance Criteria

1. WHEN a credit issuance request is submitted for an `ACTIVE` project, THE Carbon_Registry_Contract SHALL assign a contiguous range of serial numbers to the new credit batch, and THE Carbon_Credit_Contract SHALL mint the corresponding quantity of tokens to the issuer's address.

2. THE Carbon_Registry_Contract SHALL enforce that serial numbers within a project's vintage are unique and monotonically increasing; IF an issuance would produce a duplicate serial number, THEN THE Carbon_Registry_Contract SHALL reject the issuance with a typed `SerialNumberConflict` error.

3. IF a credit issuance request is submitted against a project not in `ACTIVE` state, THEN THE Carbon_Registry_Contract SHALL reject the issuance with a typed `ProjectNotActive` error.

4. WHEN a credit batch is issued, THE Carbon_Registry_Contract SHALL record the vintage year, methodology reference, quantity, issuer address, and issuance ledger sequence in the batch record.

5. THE Carbon_Credit_Contract SHALL enforce that the total supply after issuance equals the total supply before issuance plus the minted quantity; IF this invariant is violated, THE Carbon_Credit_Contract SHALL reject the mint operation.

6. THE Carbon_Registry_Contract SHALL require `require_auth` on the authorized issuer's address before processing any credit issuance.

7. WHEN a credit batch is successfully issued, THE Carbon_Registry_Contract SHALL emit a versioned `CreditsIssued` event containing the batch ID, project ID, vintage year, quantity, serial number range start and end, and issuer address.

8. WHERE a buffer pool is configured for a project's methodology, THE Carbon_Registry_Contract SHALL withhold the configured buffer pool percentage of issued credits from the issuer's allocation and hold them in the buffer pool address.

9. THE Carbon_Credit_Contract SHALL require that all minted tokens have an associated serial number range registered in THE Carbon_Registry_Contract; tokens minted without a registry entry SHALL be considered invalid.

---

### Requirement 3: Marketplace Listing

**User Story:** As a credit holder, I want to list carbon credits for sale on the marketplace, so that buyers can discover and purchase them.

#### Acceptance Criteria

1. WHEN a credit holder submits a listing with a valid quantity, price-per-credit in USDC, and expiry ledger sequence, THE Carbon_Marketplace_Contract SHALL create a sell order record and transition the listed credits to `LISTED` state.

2. THE Carbon_Marketplace_Contract SHALL escrow the listed credits from the seller's token balance at listing time; WHILE credits are in `LISTED` state, THE Carbon_Credit_Contract SHALL prevent the seller from transferring or burning those credits outside the marketplace.

3. IF the Carbon_Oracle_Contract's most recent price update is older than `max_age_ledgers` at listing time, THEN THE Carbon_Marketplace_Contract SHALL reject the listing with a typed `OracleStalenessError`.

4. THE Carbon_Marketplace_Contract SHALL enforce that the sell order includes an explicit expiry ledger sequence; IF the current ledger sequence exceeds the order's expiry, THEN THE Carbon_Marketplace_Contract SHALL reject any attempt to match or fill the order with a typed `OrderExpiredError`.

5. THE Carbon_Marketplace_Contract SHALL enforce domain-separated order signing: each signed order SHALL be cryptographically bound to the contract address, the Stellar network passphrase, and the expiry ledger sequence to prevent replay attacks.

6. WHEN a listing is created, THE Carbon_Marketplace_Contract SHALL emit a versioned `OrderCreated` event containing the order ID, seller address, quantity, price, vintage year, and expiry ledger.

7. IF the seller's credit balance is insufficient to cover the listed quantity at listing time, THEN THE Carbon_Marketplace_Contract SHALL reject the listing with a typed `InsufficientBalance` error.

8. WHERE the trade value of the listing (quantity × price) is at or above the KYC trade threshold (`KYC_TRADE_THRESHOLD_USD`, default $1,000), THE Carbon_Marketplace_Contract SHALL verify that the seller's KYC status is `VERIFIED` and AML status is `CLEAR` before creating the listing.

---

### Requirement 4: Order Matching

**User Story:** As a buyer, I want to submit a buy order that matches against existing sell listings, so that I can acquire carbon credits at an agreed price.

#### Acceptance Criteria

1. WHEN a buyer submits a buy order specifying a quantity and maximum price, THE Carbon_Marketplace_Contract SHALL match the order against available sell orders using price-time priority (lowest price first, then earliest creation time for equal prices).

2. THE Carbon_Marketplace_Contract SHALL enforce that a buy order can only be matched against sell orders for the same vintage year and project ID; cross-vintage or cross-project matches SHALL be rejected with a typed `IncompatibleOrderError`.

3. IF the Carbon_Oracle_Contract reports that the agreed match price deviates by more than the configured maximum deviation percentage from the oracle reference price, THEN THE Carbon_Marketplace_Contract SHALL reject the match with a typed `PriceDeviationExceededError`.

4. WHEN a buy order is matched against a sell order, THE Carbon_Marketplace_Contract SHALL transition the matched credits from `LISTED` to `ESCROWED` state and record the matched buy order, sell order, quantity, price, and match ledger sequence.

5. THE Carbon_Marketplace_Contract SHALL enforce that matched credits and buyer funds are atomically escrowed before emitting a match confirmation; IF either escrow fails, THEN THE Carbon_Marketplace_Contract SHALL roll back both escrows.

6. WHERE the buyer's KYC trade threshold is met or exceeded, THE Carbon_Marketplace_Contract SHALL verify the buyer's `kycStatus` is `VERIFIED` and `amlStatus` is `CLEAR` before allowing the match to proceed.

7. THE Carbon_Marketplace_Contract SHALL emit a versioned `OrderMatched` event containing the match ID, buy order ID, sell order ID, quantity, matched price, buyer address, seller address, and match ledger sequence.

8. THE Carbon_Marketplace_Contract SHALL enforce that no single address is simultaneously the buyer and seller in a matched trade (wash-trading prevention).

---

### Requirement 5: Settlement

**User Story:** As either party in a matched trade, I want the settlement of credits and funds to happen atomically, so that neither party can receive one side of the exchange without delivering the other.

#### Acceptance Criteria

1. WHEN a matched trade reaches the settlement phase, THE Carbon_Marketplace_Contract SHALL atomically transfer the escrowed credits from the seller's escrow to the buyer's address AND transfer the escrowed USDC from the buyer's escrow to the seller's address in a single transaction.

2. THE Carbon_Marketplace_Contract SHALL enforce that settlement is only possible for trades in `ESCROWED` state; IF settlement is attempted on a trade not in `ESCROWED` state, THEN THE Carbon_Marketplace_Contract SHALL reject the settlement with a typed `InvalidTradeStateError`.

3. IF the settlement transaction fails for any reason (insufficient gas, contract error, authorization failure), THEN THE Carbon_Marketplace_Contract SHALL preserve the `ESCROWED` state and make the escrowed assets available for cancellation or retry.

4. WHEN settlement completes successfully, THE Carbon_Marketplace_Contract SHALL transition the traded credits from `ESCROWED` to `SETTLED` state, update the credit owner in THE Carbon_Registry_Contract, and emit a versioned `TradeSettled` event.

5. THE Carbon_Marketplace_Contract SHALL enforce that the total value of credits transferred at settlement equals the total value of USDC transferred at settlement, within the agreed match price tolerance; IF these amounts do not match, THE Carbon_Marketplace_Contract SHALL reject the settlement.

6. WHEN settlement completes, THE Carbon_Marketplace_Contract SHALL record the settlement in an audit log containing the trade ID, buyer, seller, quantity, price, settlement ledger sequence, and both transaction hashes.

7. IF a matched trade has not been settled within a configurable number of ledgers (the settlement window), THEN THE Carbon_Marketplace_Contract SHALL allow either party to trigger a cancellation, returning escrowed assets to their original owners.

8. THE Carbon_Marketplace_Contract SHALL prevent cross-contract reentrancy during settlement: all state transitions SHALL be committed before any external token transfer calls are initiated.

---

### Requirement 6: Credit Retirement

**User Story:** As a credit holder, I want to permanently retire carbon credits, so that I can claim the underlying CO₂ offset and remove the credits from circulation.

#### Acceptance Criteria

1. WHEN a credit holder submits a retirement request specifying a quantity, beneficiary name, and purpose, THE Carbon_Credit_Contract SHALL burn the specified credits and THE Carbon_Registry_Contract SHALL mark the corresponding serial numbers as `RETIRED`.

2. THE Carbon_Registry_Contract SHALL enforce that once a serial number is marked `RETIRED`, it cannot be transferred, traded, relisted, or reissued; IF any such operation is attempted on a `RETIRED` serial number, THEN THE Carbon_Registry_Contract SHALL reject it with a typed `CreditAlreadyRetiredError`.

3. IF a retirement request is submitted for credits not owned by the requesting address, THEN THE Carbon_Credit_Contract SHALL reject the retirement with a typed `UnauthorizedRetirementError`.

4. WHEN a credit batch is retired, THE Carbon_Registry_Contract SHALL emit a versioned `CreditsRetired` event containing the batch ID, serial number range, retiring address, beneficiary name, retirement purpose, and ledger sequence.

5. THE Carbon_Registry_Contract SHALL maintain a publicly queryable retirement record for each retired serial number, including the retiring address, beneficiary, purpose, and retirement ledger sequence, that persists permanently on-chain.

6. WHERE the retirement value (quantity × oracle reference price) is at or above the KYC retirement threshold (`KYC_RETIREMENT_THRESHOLD_USD`, default $3,000), THE Carbon_Credit_Contract SHALL verify that the retiring address's `kycStatus` is `VERIFIED` and `amlStatus` is `CLEAR` before processing the retirement.

7. THE Carbon_Credit_Contract SHALL enforce that the total supply after retirement equals the total supply before retirement minus the retired quantity; IF this invariant is violated, THE Carbon_Credit_Contract SHALL reject the burn operation.

8. THE Carbon_Registry_Contract SHALL require `require_auth` on the retiring address before processing any retirement.

---

### Requirement 7: Credit Revocation

**User Story:** As a registry admin or authorized validator, I want to revoke previously issued credits, so that credits that fail permanence verification, are found fraudulent, or violate methodology standards can be invalidated and removed from circulation.

#### Acceptance Criteria

1. WHEN an authorized admin or validator submits a revocation order specifying a batch ID, quantity to revoke, and a typed revocation reason, THE Carbon_Registry_Contract SHALL mark the specified serial numbers as `REVOKED` and THE Carbon_Credit_Contract SHALL burn the corresponding tokens.

2. THE Carbon_Registry_Contract SHALL enforce that revocation is an admin-gated operation requiring `require_auth` on the registry admin address or a delegated validator address with revocation authority; IF an unauthorized address attempts revocation, THEN THE Carbon_Registry_Contract SHALL reject it with a typed `UnauthorizedRevocationError`.

3. IF a revocation is submitted for serial numbers already in `RETIRED` or `REVOKED` state, THEN THE Carbon_Registry_Contract SHALL reject the revocation with a typed `InvalidRevocationTargetError`.

4. WHEN a credit batch is revoked, THE Carbon_Registry_Contract SHALL emit a versioned `CreditsRevoked` event containing the batch ID, serial number range, revoking authority address, revocation reason code, and ledger sequence.

5. THE Carbon_Registry_Contract SHALL enforce that revocation reasons conform to a typed enumeration: `PERMANENCE_FAILURE`, `FRAUD`, `METHODOLOGY_NON_COMPLIANCE`, `VALIDATOR_WITHDRAWAL`, or `REGULATORY_ORDER`; IF an unrecognized reason code is submitted, THE Carbon_Registry_Contract SHALL reject the revocation.

6. WHEN credits are revoked that are currently held in a marketplace escrow (state `ESCROWED`), THE Carbon_Marketplace_Contract SHALL cancel the associated trades and return the buyer's escrowed USDC before the burn is finalized.

7. THE Carbon_Registry_Contract SHALL permanently record each revocation event, including the revocation authority, reason, and ledger sequence, in a manner that is queryable by any party.

8. THE Carbon_Registry_Contract SHALL maintain a revocation audit trail: the total number of revoked credits per project SHALL be queryable, and THE Carbon_Registry_Contract SHALL enforce that revoked quantity plus retired quantity never exceeds total issued quantity for any project.

---

### Requirement 8: Protocol Invariants and Cross-Reference

**User Story:** As an independent implementer or auditor, I want a complete, cross-referenced list of protocol invariants, so that I can verify the implementation against the specification and build property-based test harnesses.

#### Acceptance Criteria

1. THE Protocol_Spec SHALL define at least eight named invariants covering: supply conservation, serial number uniqueness, state-machine legality (only permitted transitions), escrow balance conservation, retirement irreversibility, revocation authority, oracle staleness enforcement, and order replay prevention.

2. FOR ALL named invariants, THE Protocol_Spec SHALL cross-reference each invariant to the corresponding contract entry point by file path and line range in the relevant contract source file.

3. THE Protocol_Spec SHALL define formal precondition and postcondition tables for each of the six lifecycle operations (Project Registration, Credit Issuance, Marketplace Listing, Order Matching, Settlement, Retirement, Revocation), with at least 3 preconditions and 3 postconditions per operation.

4. FOR ALL serial numbers assigned during issuance, THE Carbon_Registry_Contract SHALL enforce that the combination of (project_id, vintage_year, serial_number) is globally unique across all credit records.

5. THE Protocol_Spec SHALL define the complete credit state machine with all valid state transitions: `ISSUED → LISTED`, `LISTED → ESCROWED`, `LISTED → ISSUED` (cancel listing), `ESCROWED → SETTLED`, `ESCROWED → ISSUED` (cancel trade), `ISSUED → RETIRED`, `SETTLED → RETIRED`, `ISSUED → REVOKED`, `LISTED → REVOKED`, `ESCROWED → REVOKED`; any unlisted transition SHALL be considered invalid.

6. THE Protocol_Spec SHALL define the complete project state machine with all valid transitions: `PENDING → ACTIVE` (validator approval), `ACTIVE → SUSPENDED` (admin action), `SUSPENDED → ACTIVE` (admin reinstatement), `ACTIVE → DECOMMISSIONED` (admin action), `SUSPENDED → DECOMMISSIONED` (admin action); any unlisted transition SHALL be considered invalid.

7. THE Protocol_Spec SHALL include Mermaid state machine diagrams for both the credit state machine (Requirement 8.5) and the project state machine (Requirement 8.6).

8. THE Protocol_Spec SHALL identify at least one property-based testing opportunity for each of the six lifecycle operations, specifying the invariant under test, the input domain to generate, and whether a round-trip, metamorphic, or error-condition property applies.

---

### Requirement 9: Document Structure and Glossary

**User Story:** As a reader of the specification, I want a well-structured document with a comprehensive glossary, so that I can understand the domain-specific terminology without external references.

#### Acceptance Criteria

1. THE Protocol_Spec SHALL include a glossary section that defines at minimum the following terms: additionality, buffer pool, carbon credit, credit batch, escrow, methodology, order, permanence, project, retirement, revocation, serial number, settlement, validator, vintage.

2. THE Protocol_Spec SHALL include a table of contents with links to each major section: Introduction, Glossary, each of the six lifecycle operations, Invariants, State Machines, and Appendices.

3. THE Protocol_Spec SHALL be located at `docs/protocol/carbon-credit-lifecycle.md` within the repository.

4. THE Protocol_Spec SHALL include a Known Limitations and Design Rationale section that documents: the single-admin-key centralization risk for revocation authority, the oracle staleness window trade-off, replay attack prevention approach (domain-separated order signing), the KYC/AML threshold configuration, and the cross-contract reentrancy model under Soroban's host environment.

5. THE Protocol_Spec SHALL cross-reference related protocol documents where they exist: `docs/compliance/kyc-aml-design.md`, `docs/issues/01-smart-contract-security.md` (Issues 1–5), `docs/issues/03-oracle-data-integrity.md`, and any future `docs/protocol/order-signing.md`.

6. THE Protocol_Spec SHALL include an Out of Scope section explicitly stating that API reference documentation and implementation code are not covered by this document.

7. WHEN any contradiction between the specification and the implementation is identified during review, THE Protocol_Spec SHALL record the contradiction, the resolution decision, and the date of resolution in a Revision History section.
