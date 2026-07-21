# Implementation Plan: Carbon Credit Lifecycle Protocol Specification

## Overview

Write the `docs/protocol/carbon-credit-lifecycle.md` protocol specification document covering all six lifecycle operations (Project Registration, Credit Issuance, Marketplace Listing, Order Matching, Settlement, Credit Retirement, Credit Revocation) with Mermaid state machines, formal precondition/postcondition tables, protocol invariants cross-referenced to contract entry points, a glossary, PBT guide, and design rationale.

## Tasks

- [x] 1. Scaffold the protocol spec file and document skeleton
  - [x] 1.1 Create `docs/protocol/` directory
  - [x] 1.2 Create `docs/protocol/carbon-credit-lifecycle.md` with section headers and table of contents
  - [x] 1.3 Add document metadata block: title, version, status, date, author
  - [x] 1.4 Populate the Out of Scope section with the five exclusions
  - [x] 1.5 Verify the file is valid Markdown

- [x] 2. Write the Glossary section
  - [x] 2.1 Add all 25 glossary terms in alphabetical order
  - [x] 2.2 Each entry: term in bold, definition, contract cross-reference where applicable
  - [x] 2.3 Confirm all 15 required terms are present (Requirement 9.1)
  - [x] 2.4 Add anchor links from the table of contents to the Glossary section

- [x] 3. Write the Project Registration operation section
  - [x] 3.1 Add Overview, Actors, and entry points
  - [x] 3.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 3.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 3.4 Add Flow Description prose
  - [x] 3.5 Add Error Catalogue table
  - [x] 3.6 Add Events Emitted table
  - [x] 3.7 Include the validator rejection path (PENDING → REJECTED)

- [x] 4. Write the Credit Issuance operation section
  - [x] 4.1 Add Overview, Actors, and entry points
  - [x] 4.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 4.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 4.4 Add Flow Description including buffer pool withholding path
  - [x] 4.5 Add Error Catalogue table
  - [x] 4.6 Add Events Emitted table with all CreditsIssued fields
  - [x] 4.7 Note concurrent issuance serialization requirement

- [x] 5. Write the Marketplace Listing operation section
  - [x] 5.1 Add Overview, Actors, and entry points
  - [x] 5.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 5.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 5.4 Add Flow Description
  - [x] 5.5 Add Error Catalogue table
  - [x] 5.6 Add Events Emitted table
  - [x] 5.7 Document domain-separated order signing scheme
  - [x] 5.8 Document KYC gate

- [x] 6. Write the Order Matching operation section
  - [x] 6.1 Add Overview, Actors, and entry points
  - [x] 6.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 6.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 6.4 Add Flow Description
  - [x] 6.5 Document price-time priority algorithm
  - [x] 6.6 Add Error Catalogue table
  - [x] 6.7 Add Events Emitted table
  - [x] 6.8 Document partial fill and no-match behavior

- [x] 7. Write the Settlement operation section
  - [x] 7.1 Add Overview, Actors, and entry points
  - [x] 7.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 7.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 7.4 Add Flow Description (happy path and failure path)
  - [x] 7.5 Document settlement window (default 1,000 ledgers)
  - [x] 7.6 Add Error Catalogue table
  - [x] 7.7 Add Events Emitted table
  - [x] 7.8 Document reentrancy prevention

- [x] 8. Write the Credit Retirement operation section
  - [x] 8.1 Add Overview, Actors, and entry points
  - [x] 8.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 8.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 8.4 Add Flow Description
  - [x] 8.5 Document Soroban transaction atomicity guarantee
  - [x] 8.6 Add Error Catalogue table
  - [x] 8.7 Add Events Emitted table
  - [x] 8.8 Document the publicly queryable retirement record

- [x] 9. Write the Credit Revocation operation section
  - [x] 9.1 Add Overview, Actors, and entry points
  - [x] 9.2 Add Precondition Table with ≥ 3 preconditions
  - [x] 9.3 Add Postcondition Table with ≥ 3 postconditions
  - [x] 9.4 Add Flow Description
  - [x] 9.5 Document ESCROWED interception path
  - [x] 9.6 Add Error Catalogue table
  - [x] 9.7 Add Events Emitted table
  - [x] 9.8 Document all five revocation reason codes

- [x] 10. Write the State Machines section with Mermaid diagrams
  - [x] 10.1 Add Credit State Machine with stateDiagram-v2 Mermaid block (10 transitions)
  - [x] 10.2 Add transition table beneath credit state diagram
  - [x] 10.3 Add Project State Machine with stateDiagram-v2 Mermaid block (6 transitions)
  - [x] 10.4 Add transition table beneath project state diagram
  - [x] 10.5 Add note that unlisted transitions are rejected with InvalidStateTransitionError

- [x] 11. Write the Protocol Invariants section with contract cross-references
  - [x] 11.1 Add invariant table with all 9 invariants (INV-1 through INV-9)
  - [x] 11.2 Cross-reference carbon_credit entry points for INV-1
  - [x] 11.3 Cross-reference carbon_registry entry points for INV-2, INV-5, INV-6, INV-9
  - [x] 11.4 Cross-reference carbon_marketplace entry points for INV-3, INV-4, INV-7, INV-8
  - [x] 11.5 Add "file not yet present" notes for all contract files
  - [x] 11.6 Verify all 8 required invariants are present

- [x] 12. Write the Property-Based Testing Guide section
  - [x] 12.1 Add PBT opportunity table with one entry per lifecycle operation (7 rows)
  - [x] 12.2 Specify invariant under test, input domain, and property type per row
  - [x] 12.3 Add prose paragraph per operation expanding on the PBT strategy
  - [x] 12.4 Add forward reference to contracts/carbon_credit/fuzz/ and Issue #1

- [x] 13. Write the Known Limitations and Design Rationale section
  - [x] 13.1 Add five rationale subsections (admin key, oracle staleness, replay prevention, KYC thresholds, reentrancy)
  - [x] 13.2 For each: design decision, trade-off, known risk, deferred mitigations with issue references
  - [x] 13.3 Add Buffer Pool Percentage Precision subsection
  - [x] 13.4 Verify reentrancy section references Issue #2

- [x] 14. Write the Related Documents and Revision History sections
  - [x] 14.1 Add Related Documents table with all four entries
  - [x] 14.2 Add Revision History section with columns
  - [x] 14.3 Add initial row (1.0.0-draft)
  - [x] 14.4 Add contradiction-resolution process note

- [x] 15. Final review pass and cross-reference validation
  - [x] 15.1 Verify all Requirements 1–9 are traceable to spec sections
  - [x] 15.2 Verify all six lifecycle operations have sections
  - [x] 15.3 Verify all precondition/postcondition tables have ≥ 3 entries each
  - [x] 15.4 Verify Glossary contains all 15 required terms
  - [x] 15.5 Verify all 8 invariants (INV-1 through INV-8) present with cross-references
  - [x] 15.6 Verify both Mermaid diagrams render without syntax errors
  - [x] 15.7 Verify file is at docs/protocol/carbon-credit-lifecycle.md
  - [x] 15.8 Verify Out of Scope section excludes API docs and implementation code
  - [x] 15.9 Add maintainer review request note at top of document

## Task Dependency Graph

```
1 → 2 → 3
        ↓
        4 (parallel with 3)
        ↓
        5 → 6 → 7
        ↓
        8 (parallel with 5-7)
        ↓
        9 (parallel with 5-8)
        ↓
       10 (requires 3-9)
        ↓
       11 (requires 3-9)
        ↓
       12 (requires 11)
        ↓
       13 (requires 1)
        ↓
       14 (requires 1-13)
        ↓
       15 (requires 1-14)
```

## Notes

- The four contract crates (`contracts/carbon_credit/`, `contracts/carbon_registry/`, `contracts/carbon_marketplace/`, `contracts/carbon_oracle/`) do not yet exist. All invariant cross-references use "file not yet present" notes — these must be updated when the contracts are implemented.
- Maintainer review (Requirement 9 AC 5) must happen outside this automated task run. Add reviewers' names to the document header and record any contradictions found in the Revision History section.
- KYC/AML thresholds ($1,000 trade, $3,000 retirement) are defaults — legal counsel must confirm values before mainnet deployment.
