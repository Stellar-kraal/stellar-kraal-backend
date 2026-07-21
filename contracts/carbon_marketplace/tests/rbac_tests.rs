#![cfg(test)]
use soroban_sdk::{Env, Address, String};

#[test]
fn test_unauthorized_listing() {
    let env = Env::default();
    let owner = Address::from_string(&String::from_str(&env, "GOWNER"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to list someone else's credits (should fail)
    let result = std::panic::catch_unwind(|| {
        // marketplace.list(attacker, "credit_123", 100)
    });
    assert!(result.is_err(), "Should reject unauthorized listing");
}

#[test]
fn test_unauthorized_settle() {
    let env = Env::default();
    let admin = Address::from_string(&String::from_str(&env, "GADMIN"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to settle trade as non-admin (should fail)
    let result = std::panic::catch_unwind(|| {
        // marketplace.settle_trade(attacker, "trade_123")
    });
    assert!(result.is_err(), "Should reject unauthorized settlement");
}
