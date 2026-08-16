//! Upgrade safety tests for all Soroban contracts.
//!
//! This module tests that upgrading contracts preserves state and invariants.
//! Each test:
//! 1. Deploys a "v1" version of a contract
//! 2. Seeds it with test data
//! 3. Upgrades to a "v2" stub (with additive storage changes)
//! 4. Asserts that all pre-upgrade state is readable and all invariants hold

mod stellarkraal_upgrade_tests;
mod carbon_oracle_upgrade_tests;
mod carbon_marketplace_upgrade_tests;
