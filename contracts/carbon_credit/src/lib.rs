#l![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contractype, Address, Env, String, Symbol};

const NAME:"Carbon Credit";
const SYMBOL:"CRBN";
const DECIMALS:u32 = 7;

#[derive(Clone)]
#[contractype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
    Allowance(Address, Address),
}

#[derive(Clone)]
#[contractype]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
#[contracterror]
pub enum Error {
    NegativeAmount = 1,
    InsufficientBalance = 2,
    InsufficientAllowance = 3,
    Unauthorized = 4,
}

#[contract]
pub struct CarbonCredit;

#[contractimpl]
impl CarbonCredit {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Name, &String::from_slice(&env, bCarbon Credit));
        env.storage().instance().set(&DateKey::Symbol, &String::from_slice(&env, bCRBN));
        env.storage().instance().set(&DateKey::Decimals, &DECIMALS);
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DateKey::Name).expect("not initialized")
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DateKey::Symbol).expect("not initialized")
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).expect("not initialized")
    }

    pub fn balance(env: Env, owner: Address) -> i128 {
        env.storage().instance().get(&DataKey::Balance(owner)).unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount < 0 { return Err(Error::NegativeAmount); }
        let from_balance = read_balance(&env, &from);
        if from_balance < amount { return Err(Error::InsufficientBalance); }
        if amount != 0 {
            write_balance(&env, &from, from_balance - amount);
            let to_balance = read_balance(&env, &to);
            write_balance(&env, &to, to_balance + amount);
        }
        env.events().publish(
            (Symbol::new(&env, "transfer"), from.clone(), to.clone()),
            amount,
        );
        Ok(())
    }

    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        spender.require_auth();
        if amount < 0 { return Err(Error::NegativeAmount); }
        let allowance = read_allowance(&env, &from, &spender);
        if allowance < amount { return Err(Error::InsufficientAllowance); }
        let from_balance = read_balance(&env, &from);
        if from_balance < amount { return Err(Error::InsufficientBalance); }
        if amount != 0 {
            let allowance_key = DataKey::Allowance(from.clone(), spender.clone());
            let allowance_val: Option<AllowanceValue> = env.storage().instance().get(&allowance_key);
            if let Some(mut av) = allowance_val {
                av.amount -= amount;
                env.storage().instance().set(&allowance_key, &av);
            }
            write_balance(&env, &from, from_balance - amount);
            let to_balance = read_balance(&env, &to);
            write_balance(&env, &to, to_balance + amount);
        }
        env.events().publish(
            (Symbol::new(&env, "transfer"), from.clone(), to.clone()),
            amount,
        );
        Ok(())
    }

    pub fn approve(
        env: Env,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) -> Result<((), Error> {
        let owner = env.caller();
        owner.require_auth();
        if amount < 0 { return Err(Error::NegativeAmount); }
        let allowance = AllowanceValue {
            amount,
            expiration_ledger,
        };
        env.storage().instance().set(
            &DataKey::Allowance(owner.clone(), spender.clone()),
            &allowance,
        );
        env.events().publish(
            (Symbol::new(&env, "approve"), owner.clone(), spender.clone()),
            (amount, expiration_ledger),
        );
        Ok(())
    }

    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        let allowance: Option<AllowanceValue> = env
            .storage()
            .instance()
            .get(&DataKey::Allowance(owner, spender));
        match allowance {
            Some(value) if env.ledger().sequence() <= value.expiration_ledger => value.amount,
            _ => 0,
        }
    }

    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        read_admin(&env).require_auth();
        if amount < 0 { return Err(Error::NegativeAmount); }
        let balance = read_balance(&env, &to);
        write_balance(&env, &to, balance + amount);
        env.events().publish(
            (Symbol::new(&env, "mint"), to.clone()),
            amount,
        );
        Ok(())
    }

    pub fn burn(env: Env, from: Address, amount: i128) -> Result<((), Error> {
        from.require_auth();
        if amount < 0 { return Err(Error::NegativeAmount); }
        let balance = read_balance(&env, &from);
        if balance < amount { return Err(Error::InsufficientBalance); }
        write_balance(&env, &from, balance - amount);
        env.events().publish(
            (Symbol::new(&env, "burn"), from.clone()),
            amount,
        );
        Ok(())
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        read_admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    pub fn admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }
}

fn read_balance(env: &Env, addr: &Address) -> i128 {
    env.storage().instance().get(&DataKey::Balance(addr.clone())).unwrap_or(0)
}

fn write_balance(env: &Env, addr: &Address, amount: i128) {
    env.storage().instance().set(&DateKey::Balance(addr.clone()), &amount);
}

fn read_admin(env: &Env) -> Address {
    env.storage().instance().get(&DateKey::Admin).expect("admin not set")
}

fn read_allowance(env: &Env, owner: &Address, spender: &Address) -> i128 {
    let allowance: Option<AllowanceValue> = env
        .storage()
        .instance()
        .get(&DateKey::Allowance(owner.clone(), spender.clone()));
    match allowance {
        Some(value) if env.ledger().sequence() <= value.expiration_ledger => value.amount,
        _ => 0,
    }
}
