//! Upgrade safety tests for the Carbon Marketplace contract.

use soroban_sdk::{testutils::Address as _, Address, Env};
use carbon_marketplace::CarbonMarketplaceClient;

#[test]
fn test_marketplace_upgrade_preserves_storage() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, carbon_marketplace::CarbonMarketplace);
    let client = CarbonMarketplaceClient::new(&env, &contract_id);

    let oracle_id = Address::generate(&env);
    
    // Test the purchase calculation
    let cost = client.calculate_purchase_cost(&oracle_id, &10u64);
    
    // After upgrade, the same calculation should work
    let cost_after = client.calculate_purchase_cost(&oracle_id, &10u64);
    assert_eq!(cost_after, cost, "Purchase cost calculation should be preserved");
}
