# Gold Standard (GS4GG) and Verra VCS Methodology Alignment & Data Model Mapping

## Executive Summary

StellarKraal registers and collateralizes livestock-backed carbon credits on the Stellar blockchain. To ensure institutional liquidity, regulatory compliance, and market trust, credits issued or pledged on StellarKraal must align with leading voluntary carbon market (VCM) standards:
- **Gold Standard for the Global Goals (GS4GG)**
- **Verra Verified Carbon Standard (VCS)**

This document provides a field-by-field mapping between StellarKraal's on-chain/off-chain data models and the required fields for Gold Standard and Verra VCS registries. It details a comprehensive gap analysis, outlines proposed schema extensions for `carbon_registry`, and provides guidance for third-party auditor verification.

---

## 1. Data Model Mapping Tables

### 1.1 Gold Standard for the Global Goals (GS4GG) Mapping Table

Gold Standard requires rigorous proof of additionality, Sustainable Development Goal (SDG) contributions, and spatial/audit traceability.

| # | Standard Field Name | GS Field Description | StellarKraal Data Model Field | Field Type | Req. Level | Alignment Status |
|---|---|---|---|---|---|---|
| 1 | **GS Project ID** | Unique project identifier in Gold Standard Registry (e.g. `GS10924`) | `carbon_registry::project_id` | `String` | Mandatory | **Mapped** |
| 2 | **Project Name** | Registered title of the climate/agriculture activity | `Livestock.metadata.name` / `project_name` | `String` | Mandatory | **Partial Gap** |
| 3 | **Methodology Code** | Applied GS methodology identifier (e.g. `GS-AGR-01`) | `carbon_registry::methodology` | `String` | Mandatory | **Partial Gap** |
| 4 | **Project Developer ID** | Legal entity or farmer wallet representing proponent | `User.publicKey` / `User.id` | `String` | Mandatory | **Mapped** |
| 5 | **Geographical Coordinates** | GPS coordinates or GeoJSON boundary of project site | `Livestock.metadata.location` | `String` | Mandatory | **Partial Gap** |
| 6 | **Crediting Period Start** | Start date of eligible crediting window | *None* | `Timestamp` | Mandatory | **Missing Gap** |
| 7 | **Crediting Period End** | End date of eligible crediting window | *None* | `Timestamp` | Mandatory | **Missing Gap** |
| 8 | **Vintage Year** | Calendar year in which emissions reductions occurred | `carbon_registry::vintage` | `u32` | Mandatory | **Mapped** |
| 9 | **SDG Impacts Array** | Quantified contributions to ≥3 SDGs (e.g. SDG 1, 8, 13) | *None* | `Array<String>` | Mandatory | **Missing Gap** |
| 10 | **Issued Credit Quantity** | Total tCO2e credits issued for vintage | `carbon_registry::credit_amount` | `i128` | Mandatory | **Mapped** |
| 11 | **Serial Number Range** | Standardized serial format (`GS1-1-XX-GSxxxx-YY-ZZZZ`) | `carbon_registry::serial_number` | `String` | Mandatory | **Mapped** |
| 12 | **VVB Auditor Name** | ISO 14065 accredited validation & verification body | *None* | `String` | Mandatory | **Missing Gap** |
| 13 | **Verification Report Hash** | SHA-256 hash of signed auditor verification report | `Livestock.appraisalTxHash` | `String` | Mandatory | **Partial Gap** |
| 14 | **Safeguards Assessment** | Environmental & social safeguard compliance flag | *None* | `Boolean` | Recommended | **Missing Gap** |
| 15 | **Buffer Pool Contribution** | Amount/percentage held in risk buffer for reversals | *None* | `u32` | Recommended | **Missing Gap** |
| 16 | **Retirement Beneficiary** | Entity on whose behalf credit was retired | `carbon_registry::retirement_beneficiary` | `String` | Mandatory | **Partial Gap** |

---

### 1.2 Verra Verified Carbon Standard (VCS) Mapping Table

Verra VCS requires strict tracking of Verified Carbon Units (VCUs), VVB validation, non-permanence risk buffer allocations, and corresponding adjustment declarations.

| # | Standard Field Name | VCS Field Description | StellarKraal Data Model Field | Field Type | Req. Level | Alignment Status |
|---|---|---|---|---|---|---|
| 1 | **VCS Project ID** | Numeric project identifier in Verra Registry | `carbon_registry::project_id` | `String` | Mandatory | **Mapped** |
| 2 | **Project Name** | Official title registered in Verra database | `Livestock.metadata.name` / `project_name` | `String` | Mandatory | **Partial Gap** |
| 3 | **VCS Methodology** | Applied methodology code (e.g. `VM0042` Agriculture) | `carbon_registry::methodology` | `String` | Mandatory | **Partial Gap** |
| 4 | **Project Proponent** | Primary entity responsible for project submission | `User.publicKey` | `String` | Mandatory | **Mapped** |
| 5 | **Sectoral Scope** | Verra sector classification (e.g. Scope 14: Agriculture) | *None* | `u32` | Mandatory | **Missing Gap** |
| 6 | **Project Location (GeoJSON)** | Polygon coordinates for project boundaries | `Livestock.metadata.location` | `String` | Mandatory | **Partial Gap** |
| 7 | **Monitoring Period Start** | Start timestamp of verification monitoring interval | *None* | `Timestamp` | Mandatory | **Missing Gap** |
| 8 | **Monitoring Period End** | End timestamp of verification monitoring interval | *None* | `Timestamp` | Mandatory | **Missing Gap** |
| 9 | **Vintage Year** | Production year of carbon credit issuance | `carbon_registry::vintage` | `u32` | Mandatory | **Mapped** |
| 10 | **VCU Volume** | Number of Verified Carbon Units issued (1 VCU = 1 tCO2e) | `carbon_registry::credit_amount` | `i128` | Mandatory | **Mapped** |
| 11 | **VCU Serial Range** | Verra unique serial number range string | `carbon_registry::serial_number` | `String` | Mandatory | **Mapped** |
| 12 | **VVB Accreditation ID** | Accreditation identifier of auditing entity | *None* | `String` | Mandatory | **Missing Gap** |
| 13 | **Verification Statement URL** | Direct link / IPFS hash to signed verification statement | *None* | `String` | Mandatory | **Missing Gap** |
| 14 | **AFOLU Risk Buffer Rate** | Non-permanence risk buffer contribution percentage | *None* | `u32` | Mandatory | **Missing Gap** |
| 15 | **CCB / SD VISta Status** | Co-benefit certification status (if applicable) | *None* | `String` | Optional | **Missing Gap** |
| 16 | **Corresponding Adjustment** | Article 6 authorization status for international transfer | *None* | `Boolean` | Optional | **Missing Gap** |

---

## 2. Gap Analysis

Comparing StellarKraal's current data structures against Gold Standard and Verra VCS requirements reveals three categories of gaps:

### 2.1 Critical Gaps (Mandatory for Compliance)

1. **Crediting & Monitoring Period Timestamps (`crediting_period_start`, `crediting_period_end`)**
   - **Current State**: Only single `createdAt` / `vintage` integer exists.
   - **Impact**: Neither GS4GG nor VCS allows credit issuance without explicit monitoring period boundaries.

2. **Validation & Verification Body (VVB) Identity (`vvb_name`, `vvb_accreditation_id`)**
   - **Current State**: On-chain appraisal is recorded via `appraisalTxHash` representing the backend oracle key, but VVB auditor credentials are missing.
   - **Impact**: Institutional buyers require third-party auditor identity on verification statements.

3. **Verification Document Cryptographic Provenance (`verification_report_hash`)**
   - **Current State**: `appraisalTxHash` references the Soroban transaction, but does not anchor the raw VVB PDF verification report SHA-256 hash.
   - **Impact**: External auditors cannot verify that on-chain records match published registry documents.

4. **Structured GIS Spatial Boundaries (`geojson_boundary`)**
   - **Current State**: Location stored as loose unstructured string in `Livestock.metadata`.
   - **Impact**: Satellite/GEE telemetry verification requires valid GeoJSON polygon boundaries.

### 2.2 Moderate Gaps (Required for Specific Project Types / Co-benefits)

1. **Gold Standard SDG Impact Allocations (`sdg_impacts`)**
   - **Current State**: No storage for quantified SDG metrics.
   - **Impact**: Blocks Gold Standard registration, which mandates demonstrated impact for ≥3 SDGs.

2. **Verra AFOLU Risk Buffer Allocation (`buffer_pool_amount`)**
   - **Current State**: 100% of appraised credit value is assigned to the primary record with no risk reserve pool.
   - **Impact**: Agricultural/Livestock projects (AFOLU) require a risk buffer deduction (10%–20%) to cover reversal risks.

### 2.3 Minor Gaps (Optional / Emerging Regulation)

1. **Corresponding Adjustment Declaration (`corresponding_adjustment`)**
   - **Current State**: Unspecified.
   - **Impact**: Necessary for Paris Agreement Article 6 national inventory transfers.

---

## 3. Proposed Schema Extensions

To close all identified gaps without breaking backward compatibility, we propose extending the `carbon_registry` Soroban smart contract storage and Prisma schema.

### 3.1 Soroban Contract Data Structures (`contracts/carbon_registry/src/types.rs`)

```rust
pub struct ProjectMetadata {
    pub project_id: Symbol,
    pub standard: Symbol,              // "GOLD_STANDARD" | "VERRA_VCS"
    pub methodology_code: Symbol,      // e.g. "GS-AGR-01" | "VM0042"
    pub crediting_period_start: u64,   // Unix timestamp
    pub crediting_period_end: u64,     // Unix timestamp
    pub geojson_hash: BytesN<32>,      // SHA-256 of boundary GeoJSON
}

pub struct AuditProvenance {
    pub vvb_name: Symbol,
    pub vvb_accreditation_id: Symbol,
    pub verification_report_hash: BytesN<32>,
}

pub struct RiskReserveConfig {
    pub buffer_pool_bps: u32,          // Basis points (e.g. 1500 = 15%)
    pub corresponding_adjustment: bool,
}
```

### 3.2 Prisma Off-Chain Schema Extensions (`prisma/schema.prisma`)

```prisma
model CarbonProject {
  id                      String    @id @default(cuid())
  projectId               String    @unique
  standard                String    // "GOLD_STANDARD" | "VERRA_VCS"
  methodologyCode         String
  creditingPeriodStart    DateTime
  creditingPeriodEnd      DateTime
  geojsonBoundary         String    // GeoJSON polygon payload
  vvbName                 String
  vvbAccreditationId      String
  verificationReportHash  String
  sdgImpacts              String    // JSON array: ["SDG1", "SDG8", "SDG13"]
  bufferPoolBps           Int       @default(1500)
  correspondingAdjustment Boolean   @default(false)

  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
}
```

---

## 4. Auditor Verification & On-Chain Proof Requirements

Third-party carbon auditors require tamper-proof evidence to certify StellarKraal credits. The table below specifies how StellarKraal on-chain primitives satisfy auditor verification criteria:

| Verification Requirement | On-Chain Primitive / Proof Mechanism | Auditor Verification Method |
|---|---|---|
| **Double-Counting Prevention** | Soroban `carbon_registry` unique serial generation & state transitions | Query Soroban contract state for `serial_number`; verify status is `ACTIVE` (or `RETIRED`). |
| **Data Integrity & Provenance** | SHA-256 image/telemetry hash stored on-chain via `carbon_oracle` | Re-hash raw GEE telemetry batch and compare with `carbon_oracle` hash using CLI tool. |
| **Issuance Authenticity** | Pre-signed SEP-10 backend transaction with authorized oracle key | Verify transaction signatures on Horizon against public oracle address. |
| **Retirement Finality** | Atomic state change to `RETIRED` with immutable memo & beneficiary address | Inspect Soroban `AssetLiquidated` / `CreditRetired` event stream on ledger. |

---

## 5. Follow-Up Implementation Issues

The following follow-up issues track the implementation of the proposed extensions:

1. **Issue #39-A**: *Implement `ProjectMetadata` and `AuditProvenance` storage in `carbon_registry` Soroban contract.*
2. **Issue #39-B**: *Add `CarbonProject` model and migration to Prisma schema in `stellar-kraal-backend`.*
3. **Issue #39-C**: *Extend Oracle bridge provenance validator to cross-check GeoJSON hashes against VVB reports.*
