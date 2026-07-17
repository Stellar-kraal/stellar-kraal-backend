//! SEP-41 Token Interface conformance tests for `carbon_credit`.
//!
//! These tests verify every required SEP-41 entry point against the interface
//! defined in https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
//! (as exposed by `soroban_sdk::token::TokenInterface` / `TokenClient`).

#![cfg(test)]

use carbon_credit::{CarbonCredit, CarbonCreditClient};
use carbon_registry::{CarbonRegistry, CarbonRegistryClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    token::TokenClient,
    Address, Env, IntoVal, String, Symbol, Val,
};

fn env() -> Env {
    let e = Env::default();
    e.mock_all_auths();
    e
}

fn name(e: &Env) -> String {
    String::from_str(e, "StellarKraal Carbon Credit")
}

fn symbol(e: &Env) -> String {
    String::from_str(e, "SKCC")
}

/// Deploy a credit contract with a verified project and minted supply for `holder`.
fn setup_with_minted<'a>(e: &'a Env, holder: &Address, amount: i128) -> CarbonCreditClient<'a> {
    let reg = CarbonRegistryClient::new(e, &e.register(CarbonRegistry, ()));
    let admin = Address::generate(e);
    let marketplace = Address::generate(e);
    reg.initialize(&admin, &marketplace);

    let owner = Address::generate(e);
    let project_id =
        reg.register_project(&owner, &symbol_short!("TEST"), &1_000_000_i128, &2024_u32);
    reg.verify_project(&project_id);

    let credit = CarbonCreditClient::new(e, &e.register(CarbonCredit, ()));
    credit.initialize(
        &admin,
        &reg.address,
        &marketplace,
        &7u32,
        &name(e),
        &symbol(e),
    );
    credit.mint(holder, &project_id, &amount);
    credit
}

fn as_token<'a>(e: &'a Env, credit: &CarbonCreditClient<'_>) -> TokenClient<'a> {
    TokenClient::new(e, &credit.address)
}

fn count_topic0(e: &Env, topic0: Symbol) -> u32 {
    let expected_topic = topic0.to_val();
    e.events()
        .all()
        .iter()
        .filter(|(_c, topics, _d)| {
            !topics.is_empty() && topics.get_unchecked(0).shallow_eq(&expected_topic)
        })
        .count() as u32
}

fn last_event_data_for_topic0(e: &Env, topic0: Symbol) -> Option<Val> {
    let expected_topic = topic0.to_val();
    let mut last = None;
    for (_c, topics, data) in e.events().all().iter() {
        if !topics.is_empty() && topics.get_unchecked(0).shallow_eq(&expected_topic) {
            last = Some(data);
        }
    }
    last
}

#[test]
fn sep41_decimals_name_symbol() {
    let e = env();
    let credit = setup_with_minted(&e, &Address::generate(&e), 1);
    let token = as_token(&e, &credit);

    assert_eq!(token.decimals(), 7);
    assert_eq!(token.name(), name(&e));
    assert_eq!(token.symbol(), symbol(&e));
}

#[test]
fn sep41_balance_returns_i128() {
    let e = env();
    let holder = Address::generate(&e);
    let credit = setup_with_minted(&e, &holder, 250);
    let token = as_token(&e, &credit);

    assert_eq!(token.balance(&holder), 250);
    assert_eq!(token.balance(&Address::generate(&e)), 0);
}

#[test]
fn sep41_transfer_moves_balance_and_emits_event() {
    let e = env();
    let from = Address::generate(&e);
    let to = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);

    token.transfer(&from, &to, &40);

    // Assert events immediately — subsequent host invokes can rotate the buffer.
    assert_eq!(count_topic0(&e, symbol_short!("transfer")), 1);
    let data = last_event_data_for_topic0(&e, symbol_short!("transfer")).unwrap();
    assert!(data.shallow_eq(&40_i128.into_val(&e)));

    assert_eq!(token.balance(&from), 60);
    assert_eq!(token.balance(&to), 40);
}

#[test]
fn sep41_approve_and_allowance() {
    let e = env();
    let from = Address::generate(&e);
    let spender = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);

    let expiration = e.ledger().sequence() + 100;
    token.approve(&from, &spender, &50, &expiration);

    assert_eq!(count_topic0(&e, symbol_short!("approve")), 1);
    // Data payload is [amount, expiration_ledger] per SEP-41 (tuple published as event data).
    assert!(last_event_data_for_topic0(&e, symbol_short!("approve")).is_some());

    assert_eq!(token.allowance(&from, &spender), 50);
}

#[test]
fn sep41_transfer_from_consumes_allowance() {
    let e = env();
    let from = Address::generate(&e);
    let spender = Address::generate(&e);
    let to = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);

    let expiration = e.ledger().sequence() + 100;
    token.approve(&from, &spender, &40, &expiration);
    token.transfer_from(&spender, &from, &to, &25);

    assert_eq!(count_topic0(&e, symbol_short!("transfer")), 1);
    assert_eq!(token.balance(&from), 75);
    assert_eq!(token.balance(&to), 25);
    assert_eq!(token.allowance(&from, &spender), 15);
}

#[test]
fn sep41_burn_reduces_balance_and_emits_event() {
    let e = env();
    let from = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);

    token.burn(&from, &30);

    assert_eq!(count_topic0(&e, symbol_short!("burn")), 1);
    let data = last_event_data_for_topic0(&e, symbol_short!("burn")).unwrap();
    assert!(data.shallow_eq(&30_i128.into_val(&e)));

    assert_eq!(token.balance(&from), 70);
    assert_eq!(credit.total_supply_global(), 70);
}

#[test]
fn sep41_burn_from_consumes_allowance() {
    let e = env();
    let from = Address::generate(&e);
    let spender = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);

    let expiration = e.ledger().sequence() + 100;
    token.approve(&from, &spender, &50, &expiration);
    token.burn_from(&spender, &from, &20);

    assert_eq!(count_topic0(&e, symbol_short!("burn")), 1);
    assert_eq!(token.balance(&from), 80);
    assert_eq!(token.allowance(&from, &spender), 30);
}

#[test]
fn sep41_mint_extension_emits_mint_event() {
    let e = env();
    let holder = Address::generate(&e);
    let _credit = setup_with_minted(&e, &holder, 10);

    assert_eq!(count_topic0(&e, symbol_short!("mint")), 1);
    let data = last_event_data_for_topic0(&e, symbol_short!("mint")).unwrap();
    assert!(data.shallow_eq(&10_i128.into_val(&e)));
}

#[test]
fn sep41_expired_allowance_is_zero() {
    let e = env();
    let from = Address::generate(&e);
    let spender = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);

    let past = e.ledger().sequence();
    token.approve(&from, &spender, &50, &(past + 1));

    e.ledger().set_sequence_number(past + 10);

    assert_eq!(token.allowance(&from, &spender), 0);
}

#[test]
fn sep41_token_client_covers_full_interface() {
    let e = env();
    let from = Address::generate(&e);
    let credit = setup_with_minted(&e, &from, 100);
    let token = as_token(&e, &credit);
    let spender = Address::generate(&e);
    let to = Address::generate(&e);

    assert_eq!(token.decimals(), 7);
    assert_eq!(token.name(), name(&e));
    assert_eq!(token.symbol(), symbol(&e));
    assert_eq!(token.balance(&from), 100);
    assert_eq!(token.allowance(&from, &spender), 0);

    let expiration = e.ledger().sequence() + 50;
    token.approve(&from, &spender, &10, &expiration);
    token.transfer(&from, &to, &5);
    token.transfer_from(&spender, &from, &to, &5);
    token.burn(&from, &5);
    token.approve(&from, &spender, &5, &expiration);
    token.burn_from(&spender, &from, &5);

    assert_eq!(token.balance(&from), 80);
    assert_eq!(token.balance(&to), 10);
}
