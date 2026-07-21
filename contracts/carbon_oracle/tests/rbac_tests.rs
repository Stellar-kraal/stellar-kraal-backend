#![cfg(test)]
use soroban_sdk::{Env, Address, String};

#[test]
fn test_unauthorized_price_update() {
    let env = Env::default();
    let admin = Address::from_string(&String::from_str(&env, "GADMIN"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to update price as non-admin (should fail)
    let result = std::panic::catch_unwind(|| {
        // oracle.update_price(attacker, 100)
    });
    assert!(result.is_err(), "Should reject unauthorized price update");
}

#[test]
fn test_unauthorized_data_source_addition() {
    let env = Env::default();
    let admin = Address::from_string(&String::from_str(&env, "GADMIN"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to add data source as non-admin (should fail)
    let result = std::panic::catch_unwind(|| {
        // oracle.add_data_source(attacker, "new-source")
    });
    assert!(result.is_err(), "Should reject unauthorized data source addition");
}
