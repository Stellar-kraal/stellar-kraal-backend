use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

use crate::{CarbonCredit, CarbonCreditClient, CreditError};

fn make_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn token_name(env: &Env) -> String {
    String::from_str(env, "StellarKraal Carbon Credit")
}

fn token_symbol(env: &Env) -> String {
    String::from_str(env, "SKCC")
}

fn deploy_credit(env: &Env) -> (CarbonCreditClient<'_>, Address, Address, Address) {
    let registry = Address::generate(env);
    let marketplace = Address::generate(env);
    let admin = Address::generate(env);
    let client = CarbonCreditClient::new(env, &env.register(CarbonCredit, ()));
    client.initialize(
        &admin,
        &registry,
        &marketplace,
        &7u32,
        &token_name(env),
        &token_symbol(env),
    );
    (client, admin, registry, marketplace)
}

fn fake_project_id(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[1u8; 32])
}

#[test]
fn test_initialize_succeeds() {
    let env = make_env();
    let (client, _, _, _) = deploy_credit(&env);
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.name(), token_name(&env));
    assert_eq!(client.symbol(), token_symbol(&env));
    assert_eq!(client.balance(&Address::generate(&env)), 0);
}

#[test]
fn test_initialize_twice_fails() {
    let env = make_env();
    let (client, admin, registry, marketplace) = deploy_credit(&env);
    let res = client.try_initialize(
        &admin,
        &registry,
        &marketplace,
        &7u32,
        &token_name(&env),
        &token_symbol(&env),
    );
    assert_eq!(res, Err(Ok(CreditError::AlreadyInitialized)));
}

#[test]
fn test_mint_increases_balance_and_supply() {
    use carbon_registry::{CarbonRegistry, CarbonRegistryClient};
    use soroban_sdk::symbol_short;

    let env = make_env();

    let reg_client = CarbonRegistryClient::new(&env, &env.register(CarbonRegistry, ()));
    let reg_admin = Address::generate(&env);
    let marketplace_addr = Address::generate(&env);
    reg_client.initialize(&reg_admin, &marketplace_addr);

    let owner = Address::generate(&env);
    let project_id =
        reg_client.register_project(&owner, &symbol_short!("TEST"), &1000_i128, &2024_u32);
    reg_client.verify_project(&project_id);

    let credit_client = CarbonCreditClient::new(&env, &env.register(CarbonCredit, ()));
    let credit_admin = Address::generate(&env);
    credit_client.initialize(
        &credit_admin,
        &reg_client.address,
        &marketplace_addr,
        &7u32,
        &token_name(&env),
        &token_symbol(&env),
    );

    let recipient = Address::generate(&env);
    credit_client.mint(&recipient, &project_id, &100_i128);

    assert_eq!(credit_client.balance_of(&recipient, &project_id), 100);
    assert_eq!(credit_client.total_supply(&project_id), 100);
    assert_eq!(credit_client.balance(&recipient), 100);
    assert_eq!(credit_client.total_supply_global(), 100);
}

#[test]
fn test_mint_zero_amount_fails() {
    let env = make_env();
    let (client, _, _, _) = deploy_credit(&env);
    let recipient = Address::generate(&env);
    let res = client.try_mint(&recipient, &fake_project_id(&env), &0_i128);
    assert_eq!(res, Err(Ok(CreditError::InvalidAmount)));
}

#[test]
fn test_mint_negative_amount_fails() {
    let env = make_env();
    let (client, _, _, _) = deploy_credit(&env);
    let recipient = Address::generate(&env);
    let res = client.try_mint(&recipient, &fake_project_id(&env), &-1_i128);
    assert_eq!(res, Err(Ok(CreditError::InvalidAmount)));
}

#[test]
fn test_transfer_project_moves_balance() {
    use carbon_registry::{CarbonRegistry, CarbonRegistryClient};
    use soroban_sdk::symbol_short;

    let env = make_env();
    let reg_client = CarbonRegistryClient::new(&env, &env.register(CarbonRegistry, ()));
    let reg_admin = Address::generate(&env);
    let marketplace_addr = Address::generate(&env);
    reg_client.initialize(&reg_admin, &marketplace_addr);

    let owner = Address::generate(&env);
    let project_id =
        reg_client.register_project(&owner, &symbol_short!("TEST"), &1000_i128, &2024_u32);
    reg_client.verify_project(&project_id);

    let client = CarbonCreditClient::new(&env, &env.register(CarbonCredit, ()));
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &reg_client.address,
        &marketplace_addr,
        &7u32,
        &token_name(&env),
        &token_symbol(&env),
    );

    let from = Address::generate(&env);
    let to = Address::generate(&env);
    client.mint(&from, &project_id, &100_i128);
    client.transfer_project(&from, &to, &project_id, &40_i128);

    assert_eq!(client.balance_of(&from, &project_id), 60);
    assert_eq!(client.balance_of(&to, &project_id), 40);
    assert_eq!(client.balance(&from), 60);
    assert_eq!(client.balance(&to), 40);
}

#[test]
fn test_transfer_project_insufficient_balance_fails() {
    use carbon_registry::{CarbonRegistry, CarbonRegistryClient};
    use soroban_sdk::symbol_short;

    let env = make_env();
    let reg_client = CarbonRegistryClient::new(&env, &env.register(CarbonRegistry, ()));
    let reg_admin = Address::generate(&env);
    let marketplace_addr = Address::generate(&env);
    reg_client.initialize(&reg_admin, &marketplace_addr);

    let owner = Address::generate(&env);
    let project_id =
        reg_client.register_project(&owner, &symbol_short!("TEST"), &1000_i128, &2024_u32);
    reg_client.verify_project(&project_id);

    let client = CarbonCreditClient::new(&env, &env.register(CarbonCredit, ()));
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &reg_client.address,
        &marketplace_addr,
        &7u32,
        &token_name(&env),
        &token_symbol(&env),
    );

    let from = Address::generate(&env);
    let to = Address::generate(&env);
    client.mint(&from, &project_id, &10_i128);
    let res = client.try_transfer_project(&from, &to, &project_id, &11_i128);
    assert_eq!(res, Err(Ok(CreditError::InsufficientBalance)));
}

#[test]
fn test_burn_project_reduces_balance_and_supply() {
    use carbon_registry::{CarbonRegistry, CarbonRegistryClient};
    use soroban_sdk::symbol_short;

    let env = make_env();
    let reg_client = CarbonRegistryClient::new(&env, &env.register(CarbonRegistry, ()));
    let reg_admin = Address::generate(&env);
    let marketplace_addr = Address::generate(&env);
    reg_client.initialize(&reg_admin, &marketplace_addr);

    let owner = Address::generate(&env);
    let project_id =
        reg_client.register_project(&owner, &symbol_short!("TEST"), &1000_i128, &2024_u32);
    reg_client.verify_project(&project_id);

    let client = CarbonCreditClient::new(&env, &env.register(CarbonCredit, ()));
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &reg_client.address,
        &marketplace_addr,
        &7u32,
        &token_name(&env),
        &token_symbol(&env),
    );

    let holder = Address::generate(&env);
    client.mint(&holder, &project_id, &100_i128);
    client.burn_project(&holder, &project_id, &30_i128);

    assert_eq!(client.balance_of(&holder, &project_id), 70);
    assert_eq!(client.total_supply(&project_id), 70);
    assert_eq!(client.balance(&holder), 70);
    assert_eq!(client.total_supply_global(), 70);
}

#[test]
fn test_burn_project_more_than_balance_fails() {
    use carbon_registry::{CarbonRegistry, CarbonRegistryClient};
    use soroban_sdk::symbol_short;

    let env = make_env();
    let reg_client = CarbonRegistryClient::new(&env, &env.register(CarbonRegistry, ()));
    let reg_admin = Address::generate(&env);
    let marketplace_addr = Address::generate(&env);
    reg_client.initialize(&reg_admin, &marketplace_addr);

    let owner = Address::generate(&env);
    let project_id =
        reg_client.register_project(&owner, &symbol_short!("TEST"), &1000_i128, &2024_u32);
    reg_client.verify_project(&project_id);

    let client = CarbonCreditClient::new(&env, &env.register(CarbonCredit, ()));
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &reg_client.address,
        &marketplace_addr,
        &7u32,
        &token_name(&env),
        &token_symbol(&env),
    );

    let holder = Address::generate(&env);
    client.mint(&holder, &project_id, &10_i128);
    let res = client.try_burn_project(&holder, &project_id, &11_i128);
    assert_eq!(res, Err(Ok(CreditError::InsufficientBalance)));
}
