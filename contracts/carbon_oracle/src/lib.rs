#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

mod test;

#[contract]
pub struct CarbonOracle;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    MaxAgeLedgers,
    Oracles, // Stores Vec<Address> for registered oracles
    Price(Address), // Stores (u64, u32) representing (price, ledger_seq)
}

#[contractimpl]
impl CarbonOracle {
    /// Initialize the oracle with an admin and maximum age of ledgers for a submission to be valid.
    pub fn init(env: Env, admin: Address, max_age_ledgers: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::MaxAgeLedgers, &max_age_ledgers);
        env.storage().instance().set(&DataKey::Oracles, &Vec::<Address>::new(&env));
    }

    /// Admin-gated function to register a new oracle.
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("unauthorized");
        }

        let mut oracles: Vec<Address> = env.storage().instance().get(&DataKey::Oracles).unwrap();
        if !oracles.contains(oracle.clone()) {
            oracles.push_back(oracle);
            env.storage().instance().set(&DataKey::Oracles, &oracles);
        }
    }

    /// Admin-gated function to remove an oracle.
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("unauthorized");
        }

        let mut oracles: Vec<Address> = env.storage().instance().get(&DataKey::Oracles).unwrap();
        if let Some(index) = oracles.first_index_of(oracle.clone()) {
            oracles.remove(index);
            env.storage().instance().set(&DataKey::Oracles, &oracles);
        }
        
        // Remove their price submission if it exists
        env.storage().persistent().remove(&DataKey::Price(oracle));
    }

    /// Allows a registered oracle to submit a new price.
    pub fn submit_price(env: Env, oracle: Address, price: u64) {
        oracle.require_auth();

        let oracles: Vec<Address> = env.storage().instance().get(&DataKey::Oracles).unwrap();
        if !oracles.contains(oracle.clone()) {
            panic!("unauthorized oracle");
        }

        let current_ledger = env.ledger().sequence();
        env.storage().persistent().set(&DataKey::Price(oracle), &(price, current_ledger));
    }

    /// Computes the median price from all registered oracles that have submitted a price within the max_age_ledgers window.
    pub fn get_median_price(env: Env) -> u64 {
        let oracles: Vec<Address> = env.storage().instance().get(&DataKey::Oracles).unwrap();
        let max_age: u32 = env.storage().instance().get(&DataKey::MaxAgeLedgers).unwrap();
        let current_ledger = env.ledger().sequence();

        let mut valid_prices = Vec::<u64>::new(&env);

        for oracle in oracles.iter() {
            if let Some((price, ledger_seq)) = env.storage().persistent().get(&DataKey::Price(oracle.clone())) {
                if current_ledger >= ledger_seq && current_ledger - ledger_seq <= max_age {
                    valid_prices.push_back(price);
                }
            }
        }

        let len = valid_prices.len();
        if len == 0 {
            panic!("no valid oracle submissions");
        }

        // Sort the prices manually
        let mut prices_array = [0u64; 20]; // Assuming max 20 oracles for simple sorting in WASM
        if len > 20 {
            panic!("too many oracles");
        }

        for i in 0..len {
            prices_array[i as usize] = valid_prices.get(i).unwrap();
        }

        // Simple bubble sort
        for i in 0..len {
            for j in 0..len - 1 - i {
                if prices_array[j as usize] > prices_array[(j + 1) as usize] {
                    prices_array.swap(j as usize, (j + 1) as usize);
                }
            }
        }

        // Calculate median
        if len % 2 == 1 {
            prices_array[(len / 2) as usize]
        } else {
            let mid1 = prices_array[((len / 2) - 1) as usize];
            let mid2 = prices_array[(len / 2) as usize];
            (mid1 + mid2) / 2
        }
    }
}
