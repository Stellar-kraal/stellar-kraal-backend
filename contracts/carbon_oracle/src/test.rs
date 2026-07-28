#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Env};

#[test]
fn test_single_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle1 = Address::generate(&env);

    let contract_id = env.register_contract(None, CarbonOracle);
    let client = CarbonOracleClient::new(&env, &contract_id);

    client.init(&admin, &100);
    client.add_oracle(&admin, &oracle1);

    client.submit_price(&oracle1, &1050);
    let median = client.get_median_price();
    assert_eq!(median, 1050);
}

#[test]
fn test_two_oracles_with_outlier() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);

    let contract_id = env.register_contract(None, CarbonOracle);
    let client = CarbonOracleClient::new(&env, &contract_id);

    client.init(&admin, &100);
    client.add_oracle(&admin, &oracle1);
    client.add_oracle(&admin, &oracle2);
    client.add_oracle(&admin, &oracle3);

    client.submit_price(&oracle1, &1000);
    client.submit_price(&oracle2, &1050);
    client.submit_price(&oracle3, &5000); // Outlier

    // Median of [1000, 1050, 5000] is 1050
    let median = client.get_median_price();
    assert_eq!(median, 1050);
}

#[test]
#[should_panic]
fn test_all_oracles_stale() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle1 = Address::generate(&env);

    let contract_id = env.register_contract(None, CarbonOracle);
    let client = CarbonOracleClient::new(&env, &contract_id);

    client.init(&admin, &10); // max age = 10
    client.add_oracle(&admin, &oracle1);

    // Initial sequence is 0 by default. Set it to 10
    env.ledger().with_mut(|li| {
        li.sequence_number = 10;
    });

    client.submit_price(&oracle1, &1000);

    // Advance ledger beyond max_age (10 + 10 + 1 = 21)
    env.ledger().with_mut(|li| {
        li.sequence_number = 21;
    });

    // Should panic because submission is stale
    client.get_median_price();
}

#[test]
fn test_oracle_added_removed_mid_operation() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);

    let contract_id = env.register_contract(None, CarbonOracle);
    let client = CarbonOracleClient::new(&env, &contract_id);

    client.init(&admin, &100);
    client.add_oracle(&admin, &oracle1);
    client.submit_price(&oracle1, &1000);

    assert_eq!(client.get_median_price(), 1000);

    // Add oracle 2
    client.add_oracle(&admin, &oracle2);
    client.submit_price(&oracle2, &1200);

    // Median of 1000, 1200 is 1100
    assert_eq!(client.get_median_price(), 1100);

    // Remove oracle 1
    client.remove_oracle(&admin, &oracle1);

    // Median should now just be oracle2's price
    assert_eq!(client.get_median_price(), 1200);
}

#[test]
#[should_panic]
fn test_unauthorized_add_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let oracle1 = Address::generate(&env);

    let contract_id = env.register_contract(None, CarbonOracle);
    let client = CarbonOracleClient::new(&env, &contract_id);

    client.init(&admin, &100);
    client.add_oracle(&attacker, &oracle1);
}
