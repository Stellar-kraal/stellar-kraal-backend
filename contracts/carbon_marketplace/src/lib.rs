#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};

mod oracle {
    soroban_sdk::contractimport!(
        file = "../target/wasm32-unknown-unknown/release/carbon_oracle.wasm"
    );
}

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {
    /// Purchase credits using the aggregated median price from the multi-oracle contract.
    pub fn calculate_purchase_cost(env: Env, oracle_id: Address, amount: u64) -> u64 {
        let oracle_client = oracle::Client::new(&env, &oracle_id);
        
        // Read aggregated median price
        let median_price = oracle_client.get_median_price();
        
        // Total cost is price per credit * amount
        median_price * amount
    }
}

#[cfg(test)]
mod test;
