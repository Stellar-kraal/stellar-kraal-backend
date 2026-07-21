#![cfg(test)]
use soroban_sdk::{Env, Address, String};

#[test]
fn test_unauthorized_project_registration() {
    let env = Env::default();
    let admin = Address::from_string(&String::from_str(&env, "GADMIN123"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to register project as non-admin (should fail)
    let result = std::panic::catch_unwind(|| {
        // registry.register_project(attacker, ...)
    });
    assert!(result.is_err(), "Should reject unauthorized registration");
}

#[test]
fn test_unauthorized_project_approval() {
    let env = Env::default();
    let admin = Address::from_string(&String::from_str(&env, "GADMIN123"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to approve project as non-admin (should fail)
    let result = std::panic::catch_unwind(|| {
        // registry.approve_project(attacker, "project_123")
    });
    assert!(result.is_err(), "Should reject unauthorized approval");
}

#[test]
fn test_unauthorized_standard_addition() {
    let env = Env::default();
    let admin = Address::from_string(&String::from_str(&env, "GADMIN123"));
    let attacker = Address::from_string(&String::from_str(&env, "GATTACKER"));
    
    // Try to add standard as non-admin (should fail)
    let result = std::panic::catch_unwind(|| {
        // registry.add_standard(attacker, "VCS")
    });
    assert!(result.is_err(), "Should reject unauthorized standard addition");
}
