//! # Transfer Collateral Module
//!
//! Provides the `transfer_collateral` function which allows a collateral owner
//! to transfer an unlocked collateral record to a new owner.
//!
//! ## Acceptance criteria (planned)
//! - Only the current owner can initiate the transfer.
//! - Collateral must not be locked to an active loan (`loan_id == 0`).
//! - The new owner must authorise receipt of the collateral.
//! - Emits a `collateral/transferred` event on success.
//!
//! ## Usage
//!
//! ```bash
//! stellar contract invoke \
//!   --id "$CONTRACT_ID" \
//!   --fn transfer_collateral \
//!   --arg u64:$COLLATERAL_ID \
//!   --arg address:$NEW_OWNER \
//!   --source "$CURRENT_OWNER" \
//!   --network testnet
//! ```

// TODO: implement transfer_collateral(collateral_id: u64, new_owner: Address) -> Result<(), Error>
// Signature mirrors the existing register_livestock / request_loan pattern.
// Tracked in: https://github.com/teslims2/StellarKraal-/issues (new issue)
