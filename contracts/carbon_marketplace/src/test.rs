#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

#[test]
fn test_marketplace_reads_median() {
    let env = Env::default();
    env.mock_all_auths();
    
    // Deploy oracle
    let admin = Address::generate(&env);
    let oracle_id = env.register_contract(None, carbon_oracle::CarbonOracle);
    let oracle_client = oracle::Client::new(&env, &oracle_id);

    // Setup multi-oracle
    oracle_client.init(&admin, &100);
    
    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);

    oracle_client.add_oracle(&admin, &oracle1);
    oracle_client.add_oracle(&admin, &oracle2);
    oracle_client.add_oracle(&admin, &oracle3);

    oracle_client.submit_price(&oracle1, &1000);
    oracle_client.submit_price(&oracle2, &1050);
    oracle_client.submit_price(&oracle3, &5000); // Outlier

    // Deploy marketplace
    let marketplace_id = env.register_contract(None, CarbonMarketplace);
    let marketplace_client = CarbonMarketplaceClient::new(&env, &marketplace_id);

    // Median should be 1050. Purchasing 3 credits should cost 3150
    let cost = marketplace_client.calculate_purchase_cost(&oracle_id, &3);
    assert_eq!(cost, 3150);
}
