use soroban_sdk::{testutils::Address as _, Address, Env, String};
use soroban_sdk::client::Client as _;
use carbon_credit::{CarbonCredit, CarbonCreditClient};

fn setup<'e>() -> (:Env, CarbonCreditClient<'e>, :Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CarbonCredit);
    let client = CarbonCreditClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.__constructor(&admin);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    (env, client, admin, user1, user2)
}

#[test]
fn test_metadata() {
    let (env, client, _admin, _u1, _u2) = setup();
    assert_eq!(client.name(), String::from_slice(&env, bCarbon Credit));
    assert_eq!(client.symbol(), String::from_slice(&env, bCRBN));
    assert_eq!(client.decimals(), 7u32);
}

#[test]
fn test_balance_and_mint() {
    let (_env, client, _admin, user1, _user2) = setup();
    assert_eq!(client.balance(&user1), 0);
    client.mint(&user1, &1000).unwrap();
    assert_eq!(client.balance(&user1), 1000);
}

#[test]
fn test_transfer() {
    let (_env, client, _admin, user1, user2) = setup();
    client.mint(&user1, &1000).unwrap();
    client.transfer(&user1, &user2, &500).unwrap();
    assert_eq!(client.balance(&user1), 500);
    assert_eq!(client.balance(&user2), 500);
    assert(client.transfer(&user1, &user2, &600).is_err());
}

#[test]
fn test_approve_and_allowance() {
    let (_env, client, _admin, user1, user2) = setup();
    client.mint(&user1, &1000).unwrap();
    let owner_client = client.with_source_account(&user1);
    owner_client.approve(&user2, &300, &100000).unwrap();
    assert_eq!(client.allowance(&user1, &user2), 300);
}

#[test]
fn test_transfer_from() {
    let (_env, client, _admin, user1, user2) = setup();
    client.mint(&user1, &1000).unwrap();
    let owner_client = client.with_source_account(&user1);
    owner_client.approve(&user2, &300, &100000).unwrap();
    let spender_client = client.with_source_account(&user2);
    spender_client.transfer_from(&user1, &user2, &200).unwrap();
    assert_eq!(client.balance(&user1), 800);
    assert_eq!(client.balance(&user2), 200);
    assert_eq!(client.allowance(&user1, &user2), 100);
}

#[test]
fn test_burn() {
    let (_env, client, _admin, user1, _user2) = setup();
    client.mint(&user1, &1000).unwrap();
    client.burn(&user1, &300).unwrap();
    assert_eq!(client.balance(&user1), 700);
}

#[test]
fn test_admin() {
    let (env, client, _admin, _u1, _u2) = setup();
    let new_admin = Address::generate(&env);
    client.set_admin(&new_admin).unwrap();
    assert_eq!(client.admin().unwrap(), new_admin);
}
