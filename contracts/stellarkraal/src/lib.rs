//! # StellarKraal Smart Contract
//!
//! Livestock-backed micro-lending protocol on Stellar/Soroban.
//! Borrowers register livestock as on-chain collateral and receive
//! token loans up to a configured loan-to-value (LTV) ratio.
//!
//! ## Security
//! - All state-mutating functions require `require_auth()` from the relevant party.
//! - Admin-only functions verify the caller against the stored admin address.
//! - The contract can be paused (with optional auto-expiry) to halt new operations
//!   while still allowing repayments.
#![warn(missing_docs)]
#![no_std]
#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN,
    Env, String, Symbol, Vec,
};

// ── Storage keys ────────────────────────────────────────────────────────────
const ADMIN: Symbol = symbol_short!("ADMIN");
const ORACLE: Symbol = symbol_short!("ORACLE");
const TOKEN: Symbol = symbol_short!("TOKEN");
const LTV: Symbol = symbol_short!("LTV");        // loan-to-value bps  e.g. 6000 = 60%
const LIQ_THR: Symbol = symbol_short!("LIQTHR"); // liquidation threshold bps e.g. 8000
const TREASURY: Symbol = symbol_short!("TREASURY");
const ORIG_FEE: Symbol = symbol_short!("ORIGFEE"); // origination fee bps e.g. 50 = 0.5%
const INT_FEE: Symbol = symbol_short!("INTFEE");   // interest fee bps e.g. 1000 = 10%
const CLOSE_FACTOR: Symbol = symbol_short!("CLSFACT"); // close factor bps e.g. 5000 = 50%
const PAUSED: Symbol = symbol_short!("PAUSED");   // pause state flag
const PAUSE_EXP: Symbol = symbol_short!("PAUSEXP"); // pause expiry timestamp
const ORACLES: Symbol = symbol_short!("ORACLES");
const PAUSE_DUR: Symbol = symbol_short!("PAUSEDUR");
const PENDING_ADMIN: Symbol = symbol_short!("PEND_ADM");
const TOTAL_BORROWED: Symbol = symbol_short!("TOT_BORR");
const TOTAL_LIQUIDITY: Symbol = symbol_short!("TOT_LIQ");
const BASE_RATE: Symbol = symbol_short!("BASERATE");
const SLOPE1: Symbol = symbol_short!("SLOPE1");
const SLOPE2: Symbol = symbol_short!("SLOPE2");
const KINK: Symbol = symbol_short!("KINK");
const PRICE_MIN: Symbol = symbol_short!("PRC_MIN");
const PRICE_MAX: Symbol = symbol_short!("PRC_MAX");
const STALE_THR: Symbol = symbol_short!("STALE_THR");
const DEV_BPS: Symbol = symbol_short!("DEV_BPS");
const LAST_PRICE: Symbol = symbol_short!("LST_PRC");
const LAST_PRICE_TIME: Symbol = symbol_short!("LST_TIME");
const TWAP_PRICE: Symbol = symbol_short!("TWAP_PRC");
const TWAP_SUM: Symbol = symbol_short!("TWAP_SUM");
const TWAP_COUNT: Symbol = symbol_short!("TWAP_CNT");
const TWAP_WINDOW: Symbol = symbol_short!("TWAP_WIN");
const MIN_QUORUM: Symbol = symbol_short!("MINQRM"); // minimum oracle response quorum
const WL_COUNT: Symbol = symbol_short!("WLCOUNT");  // number of whitelisted liquidators

// ── Issue #669 storage keys ──────────────────────────────────────────────────
const PNDG_WASM: Symbol = symbol_short!("PNDGWASM");
const UPG_TIME: Symbol = symbol_short!("UPGTIME");

// ── Constants ────────────────────────────────────────────────────────────────

/// Maximum allowed pause duration in seconds (~30 days).
pub const MAX_PAUSE_DURATION: u64 = 518_400;

/// Timelock enforced between a WASM upgrade proposal and its execution, in seconds (24 hours).
pub const UPGRADE_TIMELOCK_SECS: u64 = 86_400;

/// Maximum accepted oracle price (exclusive). Any price ≥ `MAX_PRICE` is
/// rejected as invalid.
pub const MAX_PRICE: i128 = 1_000_000_000_000_000_000i128; // 10^18

// ── TTL management ───────────────────────────────────────────────────────────

/// Minimum remaining TTL (in ledgers) below which a persistent entry is extended.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 100_000; // ~5.7 days
/// Target TTL (in ledgers) applied when extending a persistent entry.
pub const PERSISTENT_TTL_LEDGERS: u32 = 518_400;   // ~30 days

// ── Errors ───────────────────────────────────────────────────────────────────

/// Contract-level errors returned by all public functions.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// Contract has not been initialised yet.
    NotInitialized = 1,
    /// `initialize` was called on an already-initialised contract.
    AlreadyInitialized = 2,
    /// Caller is not authorised to perform the operation.
    Unauthorized = 3,
    /// Requested loan amount exceeds the maximum allowed by the LTV ratio.
    InsufficientCollateral = 4,
    /// No loan record exists for the given loan ID.
    LoanNotFound = 5,
    /// No collateral record exists for the given collateral ID.
    CollateralNotFound = 6,
    /// Liquidation attempted on a loan whose health factor is ≥ 1 (safe).
    HealthFactorSafe = 7,
    /// A numeric argument is zero, negative, or would cause overflow.
    InvalidAmount = 8,
    /// Operation requires an active loan but the loan is already closed.
    LoanAlreadyClosed = 9,
    /// Fee rate exceeds the protocol maximum (500 bps / 5 %).
    InvalidFeeRate = 10,
    /// Repay amount in liquidation exceeds the close-factor cap.
    ExceedsCloseFactor = 11,
    /// Close factor must be between 1 and 10 000 bps.
    InvalidCloseFactor = 12,
    ContractPaused = 13,
    OracleAlreadyRegistered = 14,
    OracleLimitReached = 15,
    OracleNotFound = 16,
    InsufficientOracleQuorum = 17,
    InvalidPrice = 18,
    NotPaused = 19,
    /// Reentrancy guard: another call is already in progress.
    AlreadyInProgress = 20,
    /// Contract is already paused.
    AlreadyPaused = 21,
    /// Arithmetic overflow detected.
    ArithmeticOverflow = 22,
    /// Caller is not on the approved liquidator whitelist.
    LiquidatorNotWhitelisted = 23,
    /// `execute_upgrade` called with no pending upgrade proposal.
    NoUpgradePending = 24,
    /// `execute_upgrade` called before the 24-hour timelock has elapsed.
    TimelockNotElapsed = 25,
}

// ── Types ────────────────────────────────────────────────────────────────────

/// Lifecycle state of a loan.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LoanStatus {
    /// Loan is open and outstanding balance is > 0.
    Active,
    /// Loan was fully repaid by the borrower.
    Repaid,
    /// Loan was closed via liquidation.
    Liquidated,
}

/// On-chain record for a single piece of livestock collateral.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CollateralRecord {
    /// Stellar address of the collateral owner.
    pub owner: Address,
    /// Animal type symbol (e.g. `cattle`, `goat`, `sheep`).
    pub animal_type: Symbol,
    /// Number of animals registered.
    pub count: u32,
    /// Oracle-appraised total value in the protocol token's base unit.
    pub appraised_value: i128,
    /// ID of the loan this collateral is locked to; `0` means unlocked.
    pub loan_id: u64,
    /// Rolling log of the last 3 appraised values (newest last).
    pub appraisal_history: Vec<i128>,
}

/// On-chain record for a loan.
#[contracttype]
#[derive(Clone, Debug)]
pub struct LoanRecord {
    /// Unique loan identifier.
    pub id: u64,
    /// Stellar address of the borrower.
    pub borrower: Address,
    /// IDs of all collateral records backing this loan.
    pub collateral_ids: Vec<u64>,
    /// Sum of appraised values of all collaterals at origination time.
    pub total_collateral_value: i128,
    /// Original disbursed principal (before fees).
    pub principal: i128,
    /// Remaining outstanding principal balance (excluding accrued interest).
    pub outstanding: i128,
    /// Interest accrued since the last repayment, in token base units.
    pub interest_accrued: i128,
    /// Ledger timestamp of the last interest-accrual update.
    pub last_interest_time: u64,
    /// Current lifecycle status.
    pub status: LoanStatus,
}

/// Protocol fee configuration.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeConfig {
    /// Origination fee in basis points (e.g. 50 = 0.5 %).
    pub origination_fee_bps: u32,
    /// Interest fee in basis points applied to the interest portion of repayments.
    pub interest_fee_bps: u32,
}

/// Admin-readable summary of key contract state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractState {
    /// Current admin address.
    pub admin: Address,
    /// SAC token address used by the protocol.
    pub token: Address,
    /// Loan-to-value ratio in basis points.
    pub ltv_bps: u32,
    /// Liquidation threshold in basis points.
    pub liq_threshold_bps: u32,
    /// Current pause status after applying any pause expiry.
    pub is_paused: bool,
    /// Number of registered oracle addresses.
    pub oracle_count: u32,
    /// Number of loan records created.
    pub total_loans: u64,
    /// Number of collateral records created.
    pub total_collaterals: u64,
}

/// Aggregated result of a multi-oracle price submission.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleReport {
    /// Median of the submitted prices.
    pub median: i128,
    /// Number of price responses included in the aggregation.
    pub responses: u32,
    /// Number of submitted prices that deviated > 50% from the median.
    pub flagged_count: u32,
}

/// Current TWAP state returned by [`StellarKraal::get_twap_data`].
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TWAPData {
    /// Most recent price submitted by the oracle.
    pub current_price: i128,
    /// Time-weighted average price over the current TWAP window.
    pub twap_price: i128,
    /// Ledger timestamp of the most recent price submission.
    pub last_update: u64,
}

// ── Storage helpers ──────────────────────────────────────────────────────────

/// Persistent storage keys used by the contract.
#[contracttype]
pub enum DataKey {
    /// Full [`LoanRecord`] for the loan identified by the inner `u64` ID.
    Loan(u64),
    /// Full [`CollateralRecord`] for the collateral identified by the inner `u64` ID.
    Collateral(u64),
    /// Monotonically increasing counter used to assign unique loan IDs.
    LoanCounter,
    /// Monotonically increasing counter used to assign unique collateral IDs.
    CollateralCounter,
    /// Reentrancy guard flag stored in *temporary* storage.
    Guard,
    /// Liquidator whitelist entry keyed by address.
    WhitelistEntry(Address),
    /// Per-animal-type maximum appraised value cap.
    AnimalCap(Symbol),
    /// Pending WASM hash for a proposed contract upgrade (issue #669).
    PendingWasm,
    /// Ledger timestamp when an upgrade was proposed (issue #669).
    UpgradeTime,
}

// ── Contract ─────────────────────────────────────────────────────────────────

/// StellarKraal lending contract.
#[contract]
pub struct StellarKraal;


/// RAII guard to prevent reentrancy.
///
/// Sets a temporary storage flag on creation and removes it on drop.
pub struct ReentrancyGuard {
    env: Env,
}

impl ReentrancyGuard {
    /// Create a new guard, returning [`Error::AlreadyInProgress`] if already set.
    pub fn new(env: &Env) -> Result<Self, Error> {
        if env.storage().temporary().has(&DataKey::Guard) {
            return Err(Error::AlreadyInProgress);
        }
        env.storage().temporary().set(&DataKey::Guard, &());
        Ok(Self { env: env.clone() })
    }
}

impl Drop for ReentrancyGuard {
    fn drop(&mut self) {
        self.env.storage().temporary().remove(&DataKey::Guard);
    }
}

#[contractimpl]
impl StellarKraal {
    // ── initialize ────────────────────────────────────────────────────────
    /// Initialise the contract with protocol parameters.
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        token: Address,
        treasury: Address,
        ltv_bps: u32,
        liquidation_threshold_bps: u32,
        min_quorum: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&ADMIN) {
            return Err(Error::AlreadyInitialized);
        }
        let zero = Address::from_string(&String::from_str(&env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"));
        if admin == zero {
            return Err(Error::Unauthorized);
        }
        if ltv_bps == 0 || ltv_bps > 9000 {
            return Err(Error::InvalidAmount);
        }
        if liquidation_threshold_bps < ltv_bps {
            return Err(Error::InvalidAmount);
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&ORACLE, &oracle);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&TREASURY, &treasury);
        env.storage().instance().set(&LTV, &ltv_bps);
        env.storage().instance().set(&LIQ_THR, &liquidation_threshold_bps);
        env.storage().instance().set(&MIN_QUORUM, &min_quorum);
        env.storage().instance().set(&ORIG_FEE, &50u32); // 0.5%
        env.storage().instance().set(&INT_FEE, &1000u32); // 10%
        env.storage().instance().set(&CLOSE_FACTOR, &5000u32); // 50%
        env.storage().instance().set(&BASE_RATE, &200u32);
        env.storage().instance().set(&SLOPE1, &500u32);
        env.storage().instance().set(&SLOPE2, &4500u32);
        env.storage().instance().set(&KINK, &8000u32);
        env.storage().instance().set(&TOTAL_BORROWED, &0i128);
        env.storage().instance().set(&TOTAL_LIQUIDITY, &0i128);
        env.storage().instance().set(&TWAP_WINDOW, &3600u64);
        env.storage().instance().set(&LAST_PRICE, &0i128);
        env.storage().instance().set(&LAST_PRICE_TIME, &0u64);
        env.storage().instance().set(&TWAP_PRICE, &0i128);
        env.storage().instance().set(&TWAP_SUM, &0i128);
        env.storage().instance().set(&TWAP_COUNT, &0u32);
        env.storage().instance().set(&PRICE_MIN, &0i128);
        env.storage().instance().set(&PRICE_MAX, &0i128);
        env.storage().instance().set(&STALE_THR, &3600u64);
        env.storage().instance().set(&DEV_BPS, &2000u32);
        Ok(())
    }

    // ── is_paused ─────────────────────────────────────────────────────────
    /// Returns `true` if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        Self::is_paused_raw(&env)
    }

    // ── pause ─────────────────────────────────────────────────────────────
    /// Pause the contract, blocking new loans and liquidations.
    pub fn pause(env: Env, admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if Self::is_paused_raw(&env) {
            return Err(Error::AlreadyPaused);
        }

        let duration: u64 = env.storage().instance().get(&PAUSE_DUR).unwrap_or(24 * 3600);
        let expires_at = env.ledger().timestamp().checked_add(duration).ok_or(Error::ArithmeticOverflow)?;

        env.storage().instance().set(&PAUSED, &true);
        env.storage().instance().set(&PAUSE_EXP, &expires_at);
        env.events().publish((symbol_short!("Pause"),), expires_at);
        Ok(())
    }

    // ── unpause ───────────────────────────────────────────────────────────
    /// Unpause the contract.
    pub fn unpause(env: Env, admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if !Self::is_paused_raw(&env) {
            return Err(Error::NotPaused);
        }

        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&PAUSE_EXP, &0u64);
        env.events().publish((symbol_short!("Unpause"),), env.ledger().timestamp());
        Ok(())
    }

    // ── set_pause_duration ────────────────────────────────────────────────
    /// Set the default duration (in seconds) applied when the contract is paused.
    ///
    /// Capped at [`MAX_PAUSE_DURATION`] (~30 days). Passing a value strictly
    /// greater than `MAX_PAUSE_DURATION` returns [`Error::InvalidAmount`].
    pub fn set_pause_duration(env: Env, admin: Address, duration: u64) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        if duration > MAX_PAUSE_DURATION {
            return Err(Error::InvalidAmount);
        }
        env.storage().instance().set(&PAUSE_DUR, &duration);
        Ok(())
    }

    // ── update_oracle ─────────────────────────────────────────────────────
    /// Update the oracle address and optionally the minimum quorum.
    pub fn update_oracle(env: Env, admin: Address, new_oracle: Address, new_min_quorum: u32) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        env.storage().instance().set(&ORACLE, &new_oracle);
        if new_min_quorum > 0 {
            env.storage().instance().set(&MIN_QUORUM, &new_min_quorum);
        }
        env.events().publish((symbol_short!("Admin"), symbol_short!("OracleUpd")), new_oracle);
        Ok(())
    }

    // ── set_animal_cap ───────────────────────────────────────────────────
    /// Set the maximum appraised value accepted for an animal type.
    pub fn set_animal_cap(
        env: Env,
        admin: Address,
        animal_type: Symbol,
        max_value: i128,
    ) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        if max_value <= 0 {
            return Err(Error::InvalidAmount);
        }
        env.storage()
            .persistent()
            .set(&DataKey::AnimalCap(animal_type.clone()), &max_value);
        env.events()
            .publish((symbol_short!("Admin"), symbol_short!("AnimalCap")), (animal_type, max_value));
        Ok(())
    }

    // ── set_liquidation_threshold ─────────────────────────────────────────
    /// Update the liquidation threshold in basis points.
    pub fn set_liquidation_threshold(env: Env, admin: Address, threshold_bps: u32) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        if threshold_bps == 0 || threshold_bps > 10_000 {
            return Err(Error::InvalidAmount);
        }
        env.storage().instance().set(&LIQ_THR, &threshold_bps);
        env.events().publish((symbol_short!("Admin"), symbol_short!("LiqThrUpd")), threshold_bps);
        Ok(())
    }

    // ── propose_new_admin ─────────────────────────────────────────────────
    /// Propose a new admin address (Step 1 of transfer).
    pub fn propose_new_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        env.storage().instance().set(&PENDING_ADMIN, &new_admin);
        env.events().publish((symbol_short!("Admin"), symbol_short!("PropNewAd")), new_admin);
        Ok(())
    }

    // ── accept_admin_role ─────────────────────────────────────────────────
    /// Accept the admin role (Step 2 of transfer).
    pub fn accept_admin_role(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        let pending: Address = env.storage().instance().get(&PENDING_ADMIN).ok_or(Error::Unauthorized)?;
        if new_admin != pending {
            return Err(Error::Unauthorized);
        }
        new_admin.require_auth();
        env.storage().instance().set(&ADMIN, &new_admin);
        env.storage().instance().remove(&PENDING_ADMIN);
        env.events().publish((symbol_short!("Admin"), symbol_short!("AdminUpd")), new_admin);
        Ok(())
    }

    // ── register_livestock ────────────────────────────────────────────────
    /// Register livestock as on-chain collateral.
    pub fn register_livestock(
        env: Env,
        owner: Address,
        animal_type: Symbol,
        count: u32,
        appraised_value: i128,
    ) -> Result<u64, Error> {
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        if appraised_value <= 0 || count == 0 {
            return Err(Error::InvalidAmount);
        }
        if let Some(max_value) = env
            .storage()
            .persistent()
            .get::<_, i128>(&DataKey::AnimalCap(animal_type.clone()))
        {
            if appraised_value > max_value {
                return Err(Error::InvalidAmount);
            }
        }
        owner.require_auth();

        let id = Self::next_id(&env, DataKey::CollateralCounter)?;
        let mut history = Vec::new(&env);
        history.push_back(appraised_value);
        let record = CollateralRecord {
            owner: owner.clone(),
            animal_type: animal_type.clone(),
            count,
            appraised_value,
            loan_id: 0,
            appraisal_history: history,
        };
        env.storage().persistent().set(&DataKey::Collateral(id), &record);
        env.storage().persistent().extend_ttl(&DataKey::Collateral(id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_LEDGERS);

        env.events().publish(
            (symbol_short!("livestock"), Symbol::new(&env, "registered")),
            (id, owner, animal_type, count, appraised_value),
        );

        Ok(id)
    }

    // ── request_loan ──────────────────────────────────────────────────────
    /// Request a new loan against one or more collateral records.
    pub fn request_loan(
        env: Env,
        borrower: Address,
        collateral_ids: Vec<u64>,
        amount: i128,
    ) -> Result<u64, Error> {
        let _guard = ReentrancyGuard::new(&env)?;
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if collateral_ids.is_empty() {
            return Err(Error::CollateralNotFound);
        }
        borrower.require_auth();

        let mut total_collateral_value: i128 = 0;
        for col_id in collateral_ids.iter() {
            let collateral: CollateralRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Collateral(col_id))
                .ok_or(Error::CollateralNotFound)?;
            if collateral.owner != borrower {
                return Err(Error::Unauthorized);
            }
            total_collateral_value = total_collateral_value
                .checked_add(collateral.appraised_value)
                .ok_or(Error::InvalidAmount)?;
        }

        let ltv: u32 = env.storage().instance().get(&LTV).unwrap();
        let max_loan = total_collateral_value
            .checked_mul(ltv as i128)
            .ok_or(Error::InvalidAmount)?
            / 10_000;

        if amount > max_loan {
            return Err(Error::InsufficientCollateral);
        }

        let orig_fee_bps: u32 = env.storage().instance().get(&ORIG_FEE).unwrap();
        let fee = amount.checked_mul(orig_fee_bps as i128).ok_or(Error::InvalidAmount)? / 10_000;
        let disbursement = amount.checked_sub(fee).ok_or(Error::InvalidAmount)?;

        let loan_id = Self::next_id(&env, DataKey::LoanCounter)?;
        let loan = LoanRecord {
            id: loan_id,
            borrower: borrower.clone(),
            collateral_ids: collateral_ids.clone(),
            total_collateral_value,
            principal: amount,
            outstanding: amount,
            interest_accrued: 0,
            last_interest_time: env.ledger().timestamp(),
            status: LoanStatus::Active,
        };
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        env.storage().persistent().extend_ttl(&DataKey::Loan(loan_id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_LEDGERS);

        for col_id in collateral_ids.iter() {
            let mut col: CollateralRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Collateral(col_id))
                .unwrap();
            col.loan_id = loan_id;
            env.storage().persistent().set(&DataKey::Collateral(col_id), &col);
            env.storage().persistent().extend_ttl(&DataKey::Collateral(col_id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_LEDGERS);
        }

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        if fee > 0 {
            let treasury: Address = env.storage().instance().get(&TREASURY).unwrap();
            token_client.transfer(&env.current_contract_address(), &treasury, &fee);
            env.events().publish((symbol_short!("FeeCol"), loan_id), (symbol_short!("originate"), fee));
        }

        token_client.transfer(&env.current_contract_address(), &borrower, &disbursement);

        env.events().publish(
            (symbol_short!("loan"), Symbol::new(&env, "requested")),
            (loan_id, borrower.clone(), amount, disbursement, total_collateral_value),
        );

        Ok(loan_id)
    }

    // ── repay_loan ────────────────────────────────────────────────────────
    /// Repay part or all of an active loan.
    ///
    /// Repayment is intentionally **not** blocked when the contract is paused.
    pub fn repay_loan(env: Env, borrower: Address, loan_id: u64, amount: i128) -> Result<(), Error> {
        let _guard = ReentrancyGuard::new(&env)?;
        Self::assert_initialized(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        borrower.require_auth();

        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;

        if loan.borrower != borrower {
            return Err(Error::Unauthorized);
        }
        if loan.status != LoanStatus::Active {
            return Err(Error::LoanAlreadyClosed);
        }

        // ── On-chain interest accrual ──────────────────────────────────
        let int_fee_bps: u32 = env.storage().instance().get(&INT_FEE).unwrap();
        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(loan.last_interest_time);
        if elapsed > 0 && loan.outstanding > 0 {
            let accrued = loan.outstanding
                .checked_mul(int_fee_bps as i128)
                .unwrap_or(i128::MAX)
                .checked_mul(elapsed as i128)
                .unwrap_or(i128::MAX)
                / (10_000i128 * 31_536_000i128);
            loan.interest_accrued = loan.interest_accrued.saturating_add(accrued);
        }
        loan.last_interest_time = now;

        let effective_outstanding = loan.outstanding
            .checked_add(loan.interest_accrued)
            .ok_or(Error::InvalidAmount)?;
        let repay_amount = amount.min(effective_outstanding);

        // Reduce interest_accrued first, then principal outstanding
        let interest_paid = loan.interest_accrued.min(repay_amount);
        loan.interest_accrued = loan.interest_accrued
            .checked_sub(interest_paid)
            .ok_or(Error::InvalidAmount)?;
        let principal_paid = repay_amount
            .checked_sub(interest_paid)
            .ok_or(Error::InvalidAmount)?;
        loan.outstanding = loan.outstanding
            .checked_sub(principal_paid)
            .ok_or(Error::InvalidAmount)?;

        let interest_fee = interest_paid
            .checked_mul(int_fee_bps as i128)
            .ok_or(Error::InvalidAmount)?
            / 10_000;

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&borrower, &env.current_contract_address(), &repay_amount);

        if interest_fee > 0 {
            let treasury: Address = env.storage().instance().get(&TREASURY).unwrap();
            token_client.transfer(&env.current_contract_address(), &treasury, &interest_fee);
            env.events().publish((symbol_short!("FeeCol"), loan_id), (symbol_short!("interest"), interest_fee));
        }

        if loan.outstanding == 0 && loan.interest_accrued == 0 {
            loan.status = LoanStatus::Repaid;
        }
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        env.storage().persistent().extend_ttl(&DataKey::Loan(loan_id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_LEDGERS);

        env.events().publish(
            (Symbol::new(&env, "loan_repaid"), borrower.clone()),
            (loan_id, principal_paid, interest_paid, loan.outstanding),
        );

        Ok(())
    }

    // ── liquidate ─────────────────────────────────────────────────────────
    /// Liquidate an undercollateralised loan position.
    pub fn liquidate(env: Env, liquidator: Address, loan_id: u64, repay_amount: i128) -> Result<(), Error> {
        let _guard = ReentrancyGuard::new(&env)?;
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        if repay_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        liquidator.require_auth();

        let wl_count: u32 = env.storage().instance().get(&WL_COUNT).unwrap_or(0);
        if wl_count > 0 && !env.storage().persistent().has(&DataKey::WhitelistEntry(liquidator.clone())) {
            return Err(Error::LiquidatorNotWhitelisted);
        }

        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;

        if loan.status != LoanStatus::Active {
            return Err(Error::LoanAlreadyClosed);
        }

        let liq_thr: u32 = env.storage().instance().get(&LIQ_THR).unwrap();
        let close_factor: u32 = env.storage().instance().get(&CLOSE_FACTOR).unwrap();

        let hf = Self::compute_health_factor_with_thr(&loan, liq_thr)?;
        if hf >= 10_000 {
            return Err(Error::HealthFactorSafe);
        }

        let max_repay = loan.outstanding
            .checked_mul(close_factor as i128)
            .ok_or(Error::InvalidAmount)?
            / 10_000;
        if repay_amount > max_repay {
            return Err(Error::ExceedsCloseFactor);
        }

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&liquidator, &env.current_contract_address(), &repay_amount);

        let outstanding_before = loan.outstanding;
        loan.outstanding = loan.outstanding.checked_sub(repay_amount).ok_or(Error::InvalidAmount)?;
        if loan.outstanding == 0 {
            loan.status = LoanStatus::Liquidated;
        }

        let collateral_seized = if outstanding_before > 0 {
            repay_amount
                .checked_mul(loan.total_collateral_value)
                .unwrap_or(0)
                / outstanding_before
        } else {
            0
        };

        let borrower = loan.borrower.clone();
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        env.storage().persistent().extend_ttl(&DataKey::Loan(loan_id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_LEDGERS);

        env.events().publish(
            (symbol_short!("loan"), Symbol::new(&env, "liquidated")),
            (loan_id, liquidator.clone(), repay_amount, loan.outstanding, loan.status.clone()),
        );

        // suppress unused-variable warning; collateral_seized is available to off-chain observers via events if needed
        let _ = collateral_seized;

        Ok(())
    }

    // ── set_close_factor ──────────────────────────────────────────────────
    /// Update the close factor used to cap liquidation repayments.
    pub fn set_close_factor(env: Env, admin: Address, close_factor_bps: u32) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        if close_factor_bps == 0 || close_factor_bps > 10_000 {
            return Err(Error::InvalidCloseFactor);
        }
        env.storage().instance().set(&CLOSE_FACTOR, &close_factor_bps);
        Ok(())
    }

    // ── get_close_factor ──────────────────────────────────────────────────
    /// Returns the current close factor in basis points.
    pub fn get_close_factor(env: Env) -> Result<u32, Error> {
        Self::assert_initialized(&env)?;
        Ok(env.storage().instance().get(&CLOSE_FACTOR).unwrap())
    }

    // ── add_liquidator ────────────────────────────────────────────────────
    /// Add an address to the approved liquidator whitelist.
    pub fn add_liquidator(env: Env, admin: Address, liquidator: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if env.storage().persistent().has(&DataKey::WhitelistEntry(liquidator.clone())) {
            return Ok(());
        }

        env.storage().persistent().set(&DataKey::WhitelistEntry(liquidator.clone()), &());

        let count: u32 = env.storage().instance().get(&WL_COUNT).unwrap_or(0);
        env.storage().instance().set(&WL_COUNT, &(count + 1));

        env.events().publish(
            (symbol_short!("whitelist"), symbol_short!("added")),
            liquidator,
        );
        Ok(())
    }

    // ── remove_liquidator ─────────────────────────────────────────────────
    /// Remove an address from the approved liquidator whitelist.
    pub fn remove_liquidator(env: Env, admin: Address, liquidator: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if !env.storage().persistent().has(&DataKey::WhitelistEntry(liquidator.clone())) {
            return Ok(());
        }

        env.storage().persistent().remove(&DataKey::WhitelistEntry(liquidator.clone()));

        let count: u32 = env.storage().instance().get(&WL_COUNT).unwrap_or(0);
        env.storage().instance().set(&WL_COUNT, &count.saturating_sub(1));

        env.events().publish(
            (symbol_short!("whitelist"), symbol_short!("removed")),
            liquidator,
        );
        Ok(())
    }

    // ── is_whitelisted ────────────────────────────────────────────────────
    /// Returns `true` if the given address is on the approved liquidator whitelist,
    /// or if the whitelist is empty (open liquidation mode).
    pub fn is_whitelisted(env: Env, liquidator: Address) -> bool {
        let wl_count: u32 = env.storage().instance().get(&WL_COUNT).unwrap_or(0);
        if wl_count == 0 {
            return true;
        }
        env.storage().persistent().has(&DataKey::WhitelistEntry(liquidator))
    }

    // ── health_factor ─────────────────────────────────────────────────────
    /// Compute the health factor for a loan (scaled by 10 000).
    pub fn health_factor(env: Env, loan_id: u64) -> Result<i128, Error> {
        let loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;
        let liq_thr: u32 = env.storage().instance().get(&LIQ_THR).unwrap();
        Self::compute_health_factor_with_thr(&loan, liq_thr)
    }

    // ── update_appraisal ──────────────────────────────────────────────────
    /// Update the appraised value of a collateral record.
    pub fn update_appraisal(
        env: Env,
        owner: Address,
        collateral_id: u64,
        new_value: i128,
    ) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        if new_value <= 0 {
            return Err(Error::InvalidAmount);
        }
        owner.require_auth();

        let mut record: CollateralRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Collateral(collateral_id))
            .ok_or(Error::CollateralNotFound)?;

        if record.owner != owner {
            return Err(Error::Unauthorized);
        }

        if record.appraisal_history.len() >= 3 {
            let mut new_hist = Vec::new(&env);
            let start = record.appraisal_history.len() - 2;
            for i in start..record.appraisal_history.len() {
                new_hist.push_back(record.appraisal_history.get(i).unwrap());
            }
            record.appraisal_history = new_hist;
        }
        record.appraisal_history.push_back(new_value);
        record.appraised_value = new_value;

        env.storage()
            .persistent()
            .set(&DataKey::Collateral(collateral_id), &record);

        env.events().publish(
            (symbol_short!("collat"), symbol_short!("appraised")),
            (collateral_id, new_value),
        );

        Ok(())
    }

    // ── get_appraisal_history ─────────────────────────────────────────────
    /// Return the rolling appraisal history (up to 3 entries) for a collateral.
    pub fn get_appraisal_history(
        env: Env,
        collateral_id: u64,
    ) -> Result<Vec<i128>, Error> {
        let record: CollateralRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Collateral(collateral_id))
            .ok_or(Error::CollateralNotFound)?;
        Ok(record.appraisal_history)
    }

    // ── get_loan ──────────────────────────────────────────────────────────
    /// Fetch a loan record by ID.
    pub fn get_loan(env: Env, loan_id: u64) -> Result<LoanRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)
    }

    // ── get_collateral ────────────────────────────────────────────────────
    /// Fetch a collateral record by ID.
    pub fn get_collateral(env: Env, collateral_id: u64) -> Result<CollateralRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Collateral(collateral_id))
            .ok_or(Error::CollateralNotFound)
    }

    // ── get_loan_collaterals ──────────────────────────────────────────────
    /// Return all collateral records associated with a loan.
    pub fn get_loan_collaterals(env: Env, loan_id: u64) -> Result<Vec<CollateralRecord>, Error> {
        let loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;
        let mut records: Vec<CollateralRecord> = Vec::new(&env);
        for col_id in loan.collateral_ids.iter() {
            let col: CollateralRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Collateral(col_id))
                .ok_or(Error::CollateralNotFound)?;
            records.push_back(col);
        }
        Ok(records)
    }

    // ── get_collateral_count ──────────────────────────────────────────────
    /// Get the number of non-liquidated collaterals for an owner.
    pub fn get_collateral_count(env: Env, owner: Address) -> u32 {
        let counter: u64 = env.storage().instance().get(&DataKey::CollateralCounter).unwrap_or(0);
        let mut count: u32 = 0;
        for id in 1..=counter {
            if let Some(col) = env.storage().persistent().get::<_, CollateralRecord>(&DataKey::Collateral(id)) {
                if col.owner == owner {
                    let mut is_liquidated = false;
                    if col.loan_id > 0 {
                        if let Some(loan) = env.storage().persistent().get::<_, LoanRecord>(&DataKey::Loan(col.loan_id)) {
                            if loan.status == LoanStatus::Liquidated {
                                is_liquidated = true;
                            }
                        }
                    }
                    if !is_liquidated {
                        count += 1;
                    }
                }
            }
        }
        count
    }

    // ── get_loans ─────────────────────────────────────────────────────────
    /// Batch-fetch up to 20 loan records by explicit ID list (issue #670).
    ///
    /// Non-existent IDs are silently skipped. More than 20 IDs returns
    /// [`Error::InvalidAmount`].
    pub fn get_loans(env: Env, ids: Vec<u64>) -> Result<Vec<LoanRecord>, Error> {
        if ids.len() > 20 {
            return Err(Error::InvalidAmount);
        }
        let mut loans: Vec<LoanRecord> = Vec::new(&env);
        for id in ids.iter() {
            if let Some(loan) = env.storage().persistent().get::<_, LoanRecord>(&DataKey::Loan(id)) {
                loans.push_back(loan);
            }
        }
        Ok(loans)
    }

    // ── update_fee_config ─────────────────────────────────────────────────
    /// Update origination and interest fee rates.
    pub fn update_fee_config(
        env: Env,
        admin: Address,
        origination_fee_bps: u32,
        interest_fee_bps: u32,
    ) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if origination_fee_bps > 500 || interest_fee_bps > 500 {
            return Err(Error::InvalidFeeRate);
        }

        let old_orig: u32 = env.storage().instance().get(&ORIG_FEE).unwrap();
        let old_int: u32 = env.storage().instance().get(&INT_FEE).unwrap();

        env.storage().instance().set(&ORIG_FEE, &origination_fee_bps);
        env.storage().instance().set(&INT_FEE, &interest_fee_bps);

        env.events().publish(
            (symbol_short!("fee"), symbol_short!("cfgUpd")),
            (old_orig, old_int, origination_fee_bps, interest_fee_bps),
        );
        Ok(())
    }

    // ── get_fee_config ────────────────────────────────────────────────────
    /// Return the current fee configuration.
    pub fn get_fee_config(env: Env) -> Result<FeeConfig, Error> {
        Self::assert_initialized(&env)?;
        let orig: u32 = env.storage().instance().get(&ORIG_FEE).unwrap();
        let int: u32 = env.storage().instance().get(&INT_FEE).unwrap();
        Ok(FeeConfig {
            origination_fee_bps: orig,
            interest_fee_bps: int,
        })
    }

    // ── emergency_withdraw ─────────────────────────────────────────────
    /// Emergency withdrawal of all token reserves (admin-only, contract must be paused).
    pub fn emergency_withdraw(env: Env, admin: Address, recipient: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if !Self::is_paused_raw(&env) {
            return Err(Error::NotPaused);
        }

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let balance = token_client.balance(&env.current_contract_address());

        if balance > 0 {
            token_client.transfer(&env.current_contract_address(), &recipient, &balance);
        }

        env.events().publish(
            (symbol_short!("emergency"),),
            (recipient, balance),
        );

        Ok(())
    }

    // ── set_ltv ──────────────────────────────────────────────────────────
    /// Update the loan-to-value ratio (1000–9000 bps).
    pub fn set_ltv(env: Env, admin: Address, ltv_bps: u32) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if ltv_bps < 1000 || ltv_bps > 9000 {
            return Err(Error::InvalidAmount);
        }

        let old_ltv: u32 = env.storage().instance().get(&LTV).unwrap();
        env.storage().instance().set(&LTV, &ltv_bps);

        env.events().publish(
            (symbol_short!("Admin"), symbol_short!("LtvUpd")),
            (old_ltv, ltv_bps),
        );

        Ok(())
    }

    // ── get_state ─────────────────────────────────────────────────────────
    /// Return an admin-readable summary of key contract state.
    pub fn get_state(env: Env, admin: Address) -> Result<ContractState, Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let ltv_bps: u32 = env.storage().instance().get(&LTV).unwrap();
        let liq_threshold_bps: u32 = env.storage().instance().get(&LIQ_THR).unwrap();
        let is_paused = Self::is_paused_raw(&env);
        let oracle_count = Self::get_oracles(env.clone()).len();
        let total_loans: u64 = env.storage().instance().get(&DataKey::LoanCounter).unwrap_or(0);
        let total_collaterals: u64 = env.storage().instance().get(&DataKey::CollateralCounter).unwrap_or(0);
        Ok(ContractState {
            admin,
            token,
            ltv_bps,
            liq_threshold_bps,
            is_paused,
            oracle_count,
            total_loans,
            total_collaterals,
        })
    }

    // ── add_oracle ────────────────────────────────────────────────────────
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        let mut oracles = Self::get_oracles(env.clone());
        if oracles.contains(&oracle) {
            return Err(Error::OracleAlreadyRegistered);
        }
        if oracles.len() >= 5 {
            return Err(Error::OracleLimitReached);
        }
        oracles.push_back(oracle);
        env.storage().instance().set(&ORACLES, &oracles);
        Ok(())
    }

    // ── remove_oracle ─────────────────────────────────────────────────────
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        let mut oracles = Self::get_oracles(env.clone());
        let mut index = None;
        for i in 0..oracles.len() {
            if oracles.get(i).unwrap() == oracle {
                index = Some(i);
                break;
            }
        }
        if let Some(idx) = index {
            oracles.remove(idx);
            env.storage().instance().set(&ORACLES, &oracles);
            Ok(())
        } else {
            Err(Error::OracleNotFound)
        }
    }

    // ── get_oracles ───────────────────────────────────────────────────────
    pub fn get_oracles(env: Env) -> Vec<Address> {
        if let Some(oracles) = env.storage().instance().get::<_, Vec<Address>>(&ORACLES) {
            oracles
        } else {
            let mut oracles = Vec::new(&env);
            if let Some(oracle) = env.storage().instance().get::<_, Address>(&ORACLE) {
                oracles.push_back(oracle);
            }
            oracles
        }
    }

    // ── submit_oracle_prices ──────────────────────────────────────────────
    pub fn submit_oracle_prices(
        env: Env,
        submitter: Address,
        prices: Vec<i128>,
    ) -> Result<OracleReport, Error> {
        Self::assert_initialized(&env)?;
        submitter.require_auth();

        let oracles = Self::get_oracles(env.clone());
        if prices.len() != oracles.len() {
            return Err(Error::InvalidPrice);
        }

        for price in prices.iter() {
            if price <= 0 || price >= MAX_PRICE {
                return Err(Error::InvalidPrice);
            }
        }

        let mut non_zero_prices = Vec::new(&env);
        let mut responses = 0;
        for price in prices.iter() {
            non_zero_prices.push_back(price);
            responses += 1;
        }

        let min_quorum: u32 = env.storage().instance().get(&MIN_QUORUM).unwrap_or(if oracles.len() >= 3 { 3 } else { oracles.len() });
        if responses < min_quorum {
            return Err(Error::InsufficientOracleQuorum);
        }

        let mut arr = [0i128; 5];
        for i in 0..responses {
            arr[i as usize] = non_zero_prices.get(i).unwrap();
        }

        for i in 0..responses {
            for j in (i+1)..responses {
                if arr[i as usize] > arr[j as usize] {
                    let tmp = arr[i as usize];
                    arr[i as usize] = arr[j as usize];
                    arr[j as usize] = tmp;
                }
            }
        }

        let median = if responses % 2 == 1 {
            arr[(responses / 2) as usize]
        } else {
            let mid = (responses / 2) as usize;
            (arr[mid - 1] + arr[mid]) / 2
        };

        let mut flagged_count = 0;
        for price in prices.iter() {
            let diff = if price > median { price - median } else { median - price };
            if median > 0 && diff * 100 > median * 50 {
                flagged_count += 1;
            }
        }

        Ok(OracleReport {
            median,
            responses,
            flagged_count,
        })
    }

    // ── submit_price ──────────────────────────────────────────────────────
    /// Submit a single price observation to update the TWAP.
    pub fn submit_price(env: Env, oracle: Address, price: i128) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        oracle.require_auth();
        let stored_oracle: Address = env.storage().instance().get(&ORACLE).unwrap();
        if oracle != stored_oracle {
            return Err(Error::Unauthorized);
        }
        if price <= 0 {
            return Err(Error::InvalidPrice);
        }

        let now = env.ledger().timestamp();
        let window: u64 = env.storage().instance().get(&TWAP_WINDOW).unwrap_or(3600);
        let last_time: u64 = env.storage().instance().get(&LAST_PRICE_TIME).unwrap_or(0);

        let (new_sum, new_count) = if last_time == 0 || now.saturating_sub(last_time) > window {
            (price, 1u32)
        } else {
            let sum: i128 = env.storage().instance().get(&TWAP_SUM).unwrap_or(0);
            let count: u32 = env.storage().instance().get(&TWAP_COUNT).unwrap_or(0);
            let new_count = count.saturating_add(1);
            (sum.checked_add(price).unwrap_or(i128::MAX), new_count)
        };

        let twap = new_sum / new_count as i128;
        env.storage().instance().set(&LAST_PRICE, &price);
        env.storage().instance().set(&LAST_PRICE_TIME, &now);
        env.storage().instance().set(&TWAP_SUM, &new_sum);
        env.storage().instance().set(&TWAP_COUNT, &new_count);
        env.storage().instance().set(&TWAP_PRICE, &twap);
        env.events().publish(
            (symbol_short!("TWAP"), symbol_short!("price")),
            (price, twap, now),
        );
        Ok(())
    }

    // ── get_twap_data ─────────────────────────────────────────────────────
    /// Return the current TWAP state.
    pub fn get_twap_data(env: Env) -> Result<TWAPData, Error> {
        Self::assert_initialized(&env)?;
        Ok(TWAPData {
            current_price: env.storage().instance().get(&LAST_PRICE).unwrap_or(0),
            twap_price: env.storage().instance().get(&TWAP_PRICE).unwrap_or(0),
            last_update: env.storage().instance().get(&LAST_PRICE_TIME).unwrap_or(0),
        })
    }

    // ── propose_upgrade ───────────────────────────────────────────────────
    /// Propose a WASM upgrade (Step 1 of two-step upgrade, issue #669).
    pub fn propose_upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        let proposal_time = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::PendingWasm, &new_wasm_hash);
        env.storage().persistent().set(&DataKey::UpgradeTime, &proposal_time);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("proposed")),
            (new_wasm_hash, proposal_time),
        );
        Ok(())
    }

    // ── execute_upgrade ───────────────────────────────────────────────────
    /// Execute the pending WASM upgrade after the 24-hour timelock (issue #669).
    pub fn execute_upgrade(env: Env) -> Result<(), Error> {
        let wasm_hash: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::PendingWasm)
            .ok_or(Error::NoUpgradePending)?;
        let proposal_time: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::UpgradeTime)
            .ok_or(Error::NoUpgradePending)?;

        let now = env.ledger().timestamp();
        if now < proposal_time.saturating_add(UPGRADE_TIMELOCK_SECS) {
            return Err(Error::TimelockNotElapsed);
        }

        env.storage().persistent().remove(&DataKey::PendingWasm);
        env.storage().persistent().remove(&DataKey::UpgradeTime);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("executed")),
            (wasm_hash.clone(), now),
        );

        env.deployer().update_current_contract_wasm(wasm_hash);
        Ok(())
    }

    // ── cancel_upgrade ────────────────────────────────────────────────────
    /// Cancel a pending WASM upgrade proposal (issue #669).
    pub fn cancel_upgrade(env: Env, admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();

        if !env.storage().persistent().has(&DataKey::PendingWasm) {
            return Err(Error::NoUpgradePending);
        }

        env.storage().persistent().remove(&DataKey::PendingWasm);
        env.storage().persistent().remove(&DataKey::UpgradeTime);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("canceled")),
            env.ledger().timestamp(),
        );
        Ok(())
    }

    // ── internal helpers ──────────────────────────────────────────────────
    fn assert_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&ADMIN) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }

    fn assert_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if *caller != admin {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn is_paused_raw(env: &Env) -> bool {
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if !paused {
            return false;
        }
        let expires_at: u64 = env.storage().instance().get(&PAUSE_EXP).unwrap_or(0);
        if expires_at == 0 {
            return true;
        }
        let now = env.ledger().timestamp();
        now < expires_at
    }

    fn assert_not_paused(env: &Env) -> Result<(), Error> {
        if Self::is_paused_raw(env) {
            return Err(Error::ContractPaused);
        }
        Ok(())
    }

    fn next_id(env: &Env, key: DataKey) -> Result<u64, Error> {
        let id: u64 = env.storage().instance().get(&key).unwrap_or(0u64);
        let next = id.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
        env.storage().instance().set(&key, &next);
        Ok(next)
    }

    /// Pure arithmetic health-factor computation (zero storage access).
    ///
    /// Formula: `(collateral_value × liq_thr_bps) / outstanding`
    fn compute_health_factor_with_thr(loan: &LoanRecord, liq_thr: u32) -> Result<i128, Error> {
        let total_debt = loan.outstanding
            .checked_add(loan.interest_accrued)
            .ok_or(Error::InvalidAmount)?;
        if total_debt == 0 {
            return Ok(i128::MAX);
        }
        let numerator = loan
            .total_collateral_value
            .checked_mul(liq_thr as i128)
            .ok_or(Error::InvalidAmount)?;
        let denominator = loan.outstanding.checked_mul(10_000).ok_or(Error::InvalidAmount)?;
        Ok(numerator * 10_000 / denominator)
    }

    #[allow(dead_code)]
    fn calculate_utilization(env: &Env) -> Result<u32, Error> {
        let total_borrowed: i128 = env.storage().instance().get(&TOTAL_BORROWED).unwrap_or(0);
        let total_liquidity: i128 = env.storage().instance().get(&TOTAL_LIQUIDITY).unwrap_or(1);
        if total_liquidity <= 0 {
            return Ok(0);
        }
        let utilization = total_borrowed
            .checked_mul(10_000)
            .ok_or(Error::InvalidAmount)?
            / total_liquidity;
        Ok(utilization.min(10_000) as u32)
    }

    #[allow(dead_code)]
    fn calculate_interest_rate(env: &Env, utilization_bps: u32) -> Result<u32, Error> {
        let base: u32 = env.storage().instance().get(&BASE_RATE).unwrap_or(200);
        let slope1: u32 = env.storage().instance().get(&SLOPE1).unwrap_or(500);
        let slope2: u32 = env.storage().instance().get(&SLOPE2).unwrap_or(4500);
        let kink: u32 = env.storage().instance().get(&KINK).unwrap_or(8000);

        let rate = if utilization_bps <= kink {
            let slope1_component = (slope1 as u64)
                .checked_mul(utilization_bps as u64)
                .unwrap_or(u64::MAX)
                / 10_000;
            base.checked_add(slope1_component as u32).unwrap_or(u32::MAX)
        } else {
            let slope1_component = (slope1 as u64)
                .checked_mul(kink as u64)
                .unwrap_or(u64::MAX)
                / 10_000;
            let excess_util = utilization_bps.saturating_sub(kink);
            let slope2_component = (slope2 as u64)
                .checked_mul(excess_util as u64)
                .unwrap_or(u64::MAX)
                / 10_000;
            base.checked_add(slope1_component as u32)
                .and_then(|r| r.checked_add(slope2_component as u32))
                .unwrap_or(u32::MAX)
        };

        Ok(rate)
    }
}
