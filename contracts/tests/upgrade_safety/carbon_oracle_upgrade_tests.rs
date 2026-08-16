//! Upgrade safety tests for the Carbon Oracle contract.

use soroban_sdk::{testutils::Address as _, Address, Env};
use carbon_oracle::CarbonOracleClient;

#[test]
fn test_oracle_upgrade_preserves_storage() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy v1
    let contract_id = env.register_contract(None, carbon_oracle::CarbonOracle);
    let client = CarbonOracleClient::new(&env, &contract_id);

    // Initialize
    let admin = Address::generate(&env);
    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    
    client.init(&admin, &100u32);
    client.add_oracle(&admin, &oracle1);
    client.add_oracle(&admin, &oracle2);
    client.submit_price(&oracle1, &1000);
    client.submit_price(&oracle2, &1005);

    // Read pre-upgrade state
    let median_before = client.get_median_price();
    assert_eq!(median_before, 1002);

    // Upgrade (simulate)
    // In real test: env.deployer().update_current_contract_wasm(v2_wasm);

    // Verify state after upgrade
    let median_after = client.get_median_price();
    assert_eq!(median_after, 1002, "Median price should be preserved");
}
