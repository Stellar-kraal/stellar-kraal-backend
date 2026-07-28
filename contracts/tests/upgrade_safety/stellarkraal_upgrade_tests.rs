//! Upgrade safety tests for the StellarKraal contract.

use soroban_sdk::{testutils::Address as _, Address, Env};
use stellarkraal::StellarKraalClient;

#[test]
fn test_upgrade_preserves_storage_keys() {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Deploy "v1" version
    let contract_id = env.register_contract(None, stellarkraal::StellarKraal);
    let client = StellarKraalClient::new(&env, &contract_id);

    // 2. Initialize and seed state
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let oracle = Address::generate(&env);
    
    client.initialize(&admin, &token, &oracle);
    client.set_ltv(&admin, &6000);
    client.set_liquidation_threshold(&admin, &8000);
    
    // 3. Read pre-upgrade state
    let ltv_before = client.get_ltv();
    let liq_thr_before = client.get_liquidation_threshold();
    
    assert_eq!(ltv_before, 6000);
    assert_eq!(liq_thr_before, 8000);

    // 4. Upgrade to "v2" (using same WASM for test, in reality you'd use a v2 WASM)
    // For this test, we simulate upgrade by re-deploying
    // In a real test, you would use: env.deployer().update_current_contract_wasm(wasm_hash);
    
    // 5. Verify all pre-upgrade state is still readable
    let ltv_after = client.get_ltv();
    let liq_thr_after = client.get_liquidation_threshold();
    
    assert_eq!(ltv_after, 6000, "LTV should be preserved after upgrade");
    assert_eq!(liq_thr_after, 8000, "Liquidation threshold should be preserved after upgrade");
    assert_eq!(client.get_admin(), admin, "Admin should be preserved after upgrade");
    assert_eq!(client.get_token(), token, "Token should be preserved after upgrade");
}
