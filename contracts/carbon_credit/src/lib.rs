//! # carbon_credit
//!
//! SEP-41 compliant fungible token for StellarKraal carbon credits, with
//! optional project-attribution extensions used by the marketplace.
//!
//! ## SEP-41 compliance status
//!
//! This contract **implements the SEP-41 Token Interface** (`soroban_sdk::token::TokenInterface`):
//! `allowance`, `approve`, `balance`, `transfer`, `transfer_from`, `burn`,
//! `burn_from`, `decimals`, `name`, and `symbol`.
//!
//! Required SEP-41 events (`approve`, `transfer`, `burn`) are emitted in the
//! formats defined by [SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md).
//! Minting is intentionally outside the Token Interface (per SEP-41) but emits
//! the recommended `mint` event.
//!
//! See `docs/compliance/sep41-audit.md` for the full compliance matrix.
//!
//! ## Project-scoped extensions (intentional)
//!
//! Carbon credits are also tracked per project via `balance_of`, `mint`,
//! `transfer_project`, `burn_project`, `retire`, and `batch_transfer`. These are
//! **not** part of SEP-41; they keep project attribution for registry/marketplace
//! flows while keeping the SEP-41 balance as the fungible source of truth.

#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    IntoVal, String, Symbol, Val,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

const CONFIG: Symbol = symbol_short!("CONFIG");
const METADATA: Symbol = symbol_short!("METADATA");
const SUPPLY: Symbol = symbol_short!("SUPPLY");

fn balance_key(id: &Address) -> (Symbol, Address) {
    (symbol_short!("BALANCE"), id.clone())
}

fn allowance_key(from: &Address, spender: &Address) -> (Symbol, Address, Address) {
    (symbol_short!("ALLOW"), from.clone(), spender.clone())
}

fn project_balance_key(e: &Env, owner: &Address, project_id: &BytesN<32>) -> Val {
    (symbol_short!("PBAL"), owner.clone(), project_id.clone()).into_val(e)
}

fn project_supply_key(e: &Env, project_id: &BytesN<32>) -> Val {
    (symbol_short!("PSUP"), project_id.clone()).into_val(e)
}

fn retired_supply_key(e: &Env, project_id: &BytesN<32>) -> Val {
    (symbol_short!("RSUP"), project_id.clone()).into_val(e)
}

// ── Data types ────────────────────────────────────────────────────────────────

/// Credit contract configuration stored in instance storage.
#[contracttype]
#[derive(Clone)]
pub struct CreditConfig {
    pub admin: Address,
    /// Address of the carbon_registry contract.
    pub registry: Address,
    /// Address of the carbon_marketplace contract (authorized minter / project burner).
    pub marketplace: Address,
}

/// SEP-41 token metadata.
#[contracttype]
#[derive(Clone)]
pub struct TokenMetadata {
    pub decimal: u32,
    pub name: String,
    pub symbol: String,
}

/// Allowance with expiration ledger (SEP-41).
#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

/// Mirror of registry's CarbonProject — needed to decode cross-contract return values.
#[contracttype]
#[derive(Clone)]
pub struct CarbonProject {
    pub owner: Address,
    pub name: Symbol,
    pub total_credits: i128,
    pub issued_credits: i128,
    pub status: ProjectStatus,
    pub vintage_year: u32,
}

/// Mirror of registry's ProjectStatus enum.
#[contracttype]
#[derive(Clone, PartialEq)]
#[repr(u32)]
pub enum ProjectStatus {
    Pending = 0,
    Verified = 1,
    Suspended = 2,
    Retired = 3,
}

// ── Error codes ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum CreditError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InsufficientBalance = 4,
    ProjectNotVerified = 5,
    InvalidAmount = 6,
    RegistryError = 7,
    InsufficientAllowance = 8,
    NegativeNotAllowed = 9,
    ExpirationInvalid = 10,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonCredit;

#[contractimpl]
impl CarbonCredit {
    // ── Initialization ──────────────────────────────────────────────────────

    /// Initialize the contract with admin, registry, marketplace, and SEP-41 metadata.
    pub fn initialize(
        e: Env,
        admin: Address,
        registry: Address,
        marketplace: Address,
        decimal: u32,
        name: String,
        symbol: String,
    ) -> Result<(), CreditError> {
        if e.storage().instance().has(&CONFIG) {
            return Err(CreditError::AlreadyInitialized);
        }
        admin.require_auth();

        let cfg = CreditConfig {
            admin: admin.clone(),
            registry,
            marketplace,
        };
        e.storage().instance().set(&CONFIG, &cfg);
        e.storage().instance().set(
            &METADATA,
            &TokenMetadata {
                decimal,
                name,
                symbol,
            },
        );
        e.storage().instance().set(&SUPPLY, &0_i128);
        Ok(())
    }

    // ── SEP-41 TokenInterface ───────────────────────────────────────────────

    /// Returns the allowance for `spender` to transfer from `from`.
    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        Self::read_allowance(&e, &from, &spender).amount
    }

    /// Set the allowance by `amount` for `spender` to transfer/burn from `from`.
    ///
    /// # Events
    /// Emits `["approve", from, spender], data = [amount, expiration_ledger]`
    pub fn approve(e: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        Self::ensure_initialized(&e);

        if amount < 0 {
            panic!("negative amount is not allowed");
        }

        let ledger = e.ledger().sequence();
        if amount > 0 && expiration_ledger < ledger {
            panic!("expiration_ledger must be >= current ledger when amount > 0");
        }

        Self::write_allowance(&e, &from, &spender, amount, expiration_ledger);
        Self::emit_approve(&e, &from, &spender, amount, expiration_ledger);
    }

    /// Returns the SEP-41 balance of `id`.
    pub fn balance(e: Env, id: Address) -> i128 {
        Self::read_balance(&e, &id)
    }

    /// Transfer `amount` from `from` to `to` (SEP-41).
    ///
    /// # Events
    /// Emits `["transfer", from, to], data = amount`
    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::ensure_initialized(&e);
        Self::spend_balance(&e, &from, amount);
        Self::receive_balance(&e, &to, amount);
        Self::emit_transfer(&e, &from, &to, amount);
    }

    /// Transfer `amount` from `from` to `to`, consuming `spender`'s allowance.
    ///
    /// # Events
    /// Emits `["transfer", from, to], data = amount`
    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        Self::ensure_initialized(&e);
        Self::consume_allowance(&e, &from, &spender, amount);
        Self::spend_balance(&e, &from, amount);
        Self::receive_balance(&e, &to, amount);
        Self::emit_transfer(&e, &from, &to, amount);
    }

    /// Burn `amount` from `from` (SEP-41). Caller must be `from`.
    ///
    /// # Events
    /// Emits `["burn", from], data = amount`
    pub fn burn(e: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::ensure_initialized(&e);
        Self::spend_balance(&e, &from, amount);
        Self::decrease_total_supply(&e, amount);
        Self::emit_burn(&e, &from, amount);
    }

    /// Burn `amount` from `from`, consuming `spender`'s allowance.
    ///
    /// # Events
    /// Emits `["burn", from], data = amount`
    pub fn burn_from(e: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        Self::ensure_initialized(&e);
        Self::consume_allowance(&e, &from, &spender, amount);
        Self::spend_balance(&e, &from, amount);
        Self::decrease_total_supply(&e, amount);
        Self::emit_burn(&e, &from, amount);
    }

    /// Returns the number of decimals used to represent amounts of this token.
    pub fn decimals(e: Env) -> u32 {
        Self::load_metadata(&e).decimal
    }

    /// Returns the name for this token.
    pub fn name(e: Env) -> String {
        Self::load_metadata(&e).name
    }

    /// Returns the symbol for this token.
    pub fn symbol(e: Env) -> String {
        Self::load_metadata(&e).symbol
    }

    // ── Project-scoped extensions (intentional, not SEP-41) ─────────────────

    /// Mint `amount` credits to `to` for the given project.
    ///
    /// Only the marketplace may call this function. Emits a SEP-41 `mint` event.
    /// Also credits the SEP-41 fungible balance of `to`.
    pub fn mint(
        e: Env,
        to: Address,
        project_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), CreditError> {
        let cfg = Self::load_config(&e)?;
        cfg.marketplace.require_auth();

        if amount <= 0 {
            return Err(CreditError::InvalidAmount);
        }

        // Registry verification (domain rule; not part of SEP-41).
        let project: CarbonProject = e.invoke_contract(
            &cfg.registry,
            &Symbol::new(&e, "get_project"),
            soroban_sdk::vec![&e, project_id.clone().into_val(&e)],
        );
        if project.status != ProjectStatus::Verified {
            return Err(CreditError::ProjectNotVerified);
        }

        Self::receive_balance(&e, &to, amount);
        Self::increase_total_supply(&e, amount);

        let bkey = project_balance_key(&e, &to, &project_id);
        let current: i128 = e.storage().persistent().get(&bkey).unwrap_or(0);
        let new_balance = current
            .checked_add(amount)
            .ok_or(CreditError::InvalidAmount)?;
        e.storage().persistent().set(&bkey, &new_balance);

        let skey = project_supply_key(&e, &project_id);
        let current_supply: i128 = e.storage().persistent().get(&skey).unwrap_or(0);
        let new_supply = current_supply
            .checked_add(amount)
            .ok_or(CreditError::InvalidAmount)?;
        e.storage().persistent().set(&skey, &new_supply);

        Self::emit_mint(&e, &to, amount);
        Ok(())
    }

    /// Transfer credits from `from` to `to` within the same project.
    ///
    /// Extension entry point (not SEP-41). Also updates SEP-41 balances and
    /// emits a SEP-41 `transfer` event.
    pub fn transfer_project(
        e: Env,
        from: Address,
        to: Address,
        project_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), CreditError> {
        from.require_auth();
        let _ = Self::load_config(&e)?;

        if amount <= 0 {
            return Err(CreditError::InvalidAmount);
        }
        if from == to {
            return Ok(());
        }

        let from_key = project_balance_key(&e, &from, &project_id);
        let from_bal: i128 = e.storage().persistent().get(&from_key).unwrap_or(0);
        if from_bal < amount {
            return Err(CreditError::InsufficientBalance);
        }

        let to_key = project_balance_key(&e, &to, &project_id);
        let to_bal: i128 = e.storage().persistent().get(&to_key).unwrap_or(0);

        e.storage()
            .persistent()
            .set(&from_key, &(from_bal - amount));
        e.storage().persistent().set(
            &to_key,
            &(to_bal
                .checked_add(amount)
                .ok_or(CreditError::InvalidAmount)?),
        );

        Self::spend_balance(&e, &from, amount);
        Self::receive_balance(&e, &to, amount);
        Self::emit_transfer(&e, &from, &to, amount);
        Ok(())
    }

    /// Burn `amount` credits from `from` for a project (marketplace-authorized).
    ///
    /// Extension entry point (not SEP-41). Also updates SEP-41 balances and
    /// emits a SEP-41 `burn` event.
    pub fn burn_project(
        e: Env,
        from: Address,
        project_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), CreditError> {
        let cfg = Self::load_config(&e)?;
        cfg.marketplace.require_auth();

        if amount <= 0 {
            return Err(CreditError::InvalidAmount);
        }

        let bkey = project_balance_key(&e, &from, &project_id);
        let current: i128 = e.storage().persistent().get(&bkey).unwrap_or(0);
        if current < amount {
            return Err(CreditError::InsufficientBalance);
        }
        e.storage().persistent().set(&bkey, &(current - amount));

        let skey = project_supply_key(&e, &project_id);
        let current_supply: i128 = e.storage().persistent().get(&skey).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&skey, &current_supply.saturating_sub(amount));

        Self::spend_balance(&e, &from, amount);
        Self::decrease_total_supply(&e, amount);
        Self::emit_burn(&e, &from, amount);
        Ok(())
    }

    /// Retire `amount` credits from `from` for a project (holder-authorized).
    pub fn retire(
        e: Env,
        from: Address,
        project_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), CreditError> {
        from.require_auth();
        let _ = Self::load_config(&e)?;

        if amount <= 0 {
            return Err(CreditError::InvalidAmount);
        }

        let bkey = project_balance_key(&e, &from, &project_id);
        let current: i128 = e.storage().persistent().get(&bkey).unwrap_or(0);
        if current < amount {
            return Err(CreditError::InsufficientBalance);
        }
        e.storage().persistent().set(&bkey, &(current - amount));

        let skey = project_supply_key(&e, &project_id);
        let current_supply: i128 = e.storage().persistent().get(&skey).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&skey, &current_supply.saturating_sub(amount));

        let rkey = retired_supply_key(&e, &project_id);
        let current_retired: i128 = e.storage().persistent().get(&rkey).unwrap_or(0);
        let new_retired = current_retired
            .checked_add(amount)
            .ok_or(CreditError::InvalidAmount)?;
        e.storage().persistent().set(&rkey, &new_retired);

        Self::spend_balance(&e, &from, amount);
        Self::decrease_total_supply(&e, amount);
        Self::emit_burn(&e, &from, amount);
        Ok(())
    }

    /// Batch project-scoped transfers.
    pub fn batch_transfer(
        e: Env,
        from: Address,
        transfers: soroban_sdk::Vec<(Address, BytesN<32>, i128)>,
    ) -> Result<(), CreditError> {
        from.require_auth();
        for i in 0..transfers.len() {
            let t = transfers.get(i).unwrap();
            Self::transfer_project(e.clone(), from.clone(), t.0, t.1, t.2)?;
        }
        Ok(())
    }

    /// Return the credit balance of `owner` for a specific project (extension).
    pub fn balance_of(e: Env, owner: Address, project_id: BytesN<32>) -> i128 {
        e.storage()
            .persistent()
            .get(&project_balance_key(&e, &owner, &project_id))
            .unwrap_or(0)
    }

    /// Return the total supply of credits for a project (extension).
    pub fn total_supply(e: Env, project_id: BytesN<32>) -> i128 {
        e.storage()
            .persistent()
            .get(&project_supply_key(&e, &project_id))
            .unwrap_or(0)
    }

    /// Return global SEP-41 total supply.
    pub fn total_supply_global(e: Env) -> i128 {
        e.storage().instance().get(&SUPPLY).unwrap_or(0)
    }

    /// Return the retired supply of credits for a project (extension).
    pub fn retired_supply(e: Env, project_id: BytesN<32>) -> i128 {
        e.storage()
            .persistent()
            .get(&retired_supply_key(&e, &project_id))
            .unwrap_or(0)
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    fn ensure_initialized(e: &Env) {
        if !e.storage().instance().has(&CONFIG) {
            panic!("not initialized");
        }
    }

    fn load_config(e: &Env) -> Result<CreditConfig, CreditError> {
        e.storage()
            .instance()
            .get(&CONFIG)
            .ok_or(CreditError::NotInitialized)
    }

    fn load_metadata(e: &Env) -> TokenMetadata {
        e.storage()
            .instance()
            .get(&METADATA)
            .unwrap_or_else(|| panic!("not initialized"))
    }

    fn read_balance(e: &Env, id: &Address) -> i128 {
        e.storage().persistent().get(&balance_key(id)).unwrap_or(0)
    }

    fn write_balance(e: &Env, id: &Address, amount: i128) {
        e.storage().persistent().set(&balance_key(id), &amount);
    }

    fn receive_balance(e: &Env, id: &Address, amount: i128) {
        if amount < 0 {
            panic!("negative amount is not allowed");
        }
        if amount == 0 {
            return;
        }
        let balance = Self::read_balance(e, id);
        let new_balance = balance.checked_add(amount).expect("balance overflow");
        Self::write_balance(e, id, new_balance);
    }

    fn spend_balance(e: &Env, id: &Address, amount: i128) {
        if amount < 0 {
            panic!("negative amount is not allowed");
        }
        let balance = Self::read_balance(e, id);
        if balance < amount {
            panic!("insufficient balance");
        }
        Self::write_balance(e, id, balance - amount);
    }

    fn read_allowance(e: &Env, from: &Address, spender: &Address) -> AllowanceValue {
        let key = allowance_key(from, spender);
        let allowance: AllowanceValue =
            e.storage()
                .persistent()
                .get(&key)
                .unwrap_or(AllowanceValue {
                    amount: 0,
                    expiration_ledger: 0,
                });
        if allowance.amount > 0 && allowance.expiration_ledger < e.ledger().sequence() {
            return AllowanceValue {
                amount: 0,
                expiration_ledger: 0,
            };
        }
        allowance
    }

    fn write_allowance(
        e: &Env,
        from: &Address,
        spender: &Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        let key = allowance_key(from, spender);
        e.storage().persistent().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger,
            },
        );
    }

    fn consume_allowance(e: &Env, from: &Address, spender: &Address, amount: i128) {
        let allowance = Self::read_allowance(e, from, spender);
        if allowance.amount < amount {
            panic!("insufficient allowance");
        }
        Self::write_allowance(
            e,
            from,
            spender,
            allowance.amount - amount,
            allowance.expiration_ledger,
        );
    }

    fn increase_total_supply(e: &Env, amount: i128) {
        let supply: i128 = e.storage().instance().get(&SUPPLY).unwrap_or(0);
        e.storage().instance().set(
            &SUPPLY,
            &(supply.checked_add(amount).expect("supply overflow")),
        );
    }

    fn decrease_total_supply(e: &Env, amount: i128) {
        let supply: i128 = e.storage().instance().get(&SUPPLY).unwrap_or(0);
        e.storage()
            .instance()
            .set(&SUPPLY, &(supply.saturating_sub(amount)));
    }

    fn emit_approve(
        e: &Env,
        from: &Address,
        spender: &Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        // SEP-41: topics ["approve", from, spender], data = [amount, expiration_ledger]
        e.events().publish(
            (symbol_short!("approve"), from.clone(), spender.clone()),
            (amount, expiration_ledger),
        );
    }

    fn emit_transfer(e: &Env, from: &Address, to: &Address, amount: i128) {
        e.events().publish(
            (symbol_short!("transfer"), from.clone(), to.clone()),
            amount,
        );
    }

    fn emit_burn(e: &Env, from: &Address, amount: i128) {
        e.events()
            .publish((symbol_short!("burn"), from.clone()), amount);
    }

    fn emit_mint(e: &Env, to: &Address, amount: i128) {
        e.events()
            .publish((symbol_short!("mint"), to.clone()), amount);
    }
}

#[cfg(test)]
mod tests;
