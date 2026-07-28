# Deployment Runbook

This document details the automated and manual deployment procedures for the StellarKraal Soroban contracts and NestJS backend.

## Deployment Pipeline Architecture

StellarKraal uses a three-stage GitHub Actions deployment pipeline (`mainnet-deployment.yml`):

1. **Testnet**: Automatically triggered on pushes to `main`. Deploys the latest code to the Stellar testnet environment.
2. **Staging**: Automatically triggered after a successful Testnet deployment. Mimics the Mainnet environment for final end-to-end validation.
3. **Mainnet**: Triggered after successful Staging deployment but **requires explicit manual approval** from an authorized maintainer in GitHub (Environments -> Mainnet).

### Blue/Green Contract Deployment Strategy

To ensure zero-downtime and reduce risk, we use a Blue/Green deployment strategy for Soroban smart contracts:

1. **Deploy New (Blue) Contract**: The new WASM contract is deployed to the network alongside the existing (Green) contract. It is assigned a new `CONTRACT_ID`.
2. **Pre-Deployment Smoke Tests**: The pipeline runs isolated smoke tests against the new Blue contract to ensure it operates correctly before any user traffic is routed to it.
3. **Migrate Traffic**: The NestJS backend is updated to point its `CONTRACT_ID` environment variable to the new Blue contract.
4. **Post-Deployment Health Checks**: A series of health checks confirm the backend is successfully interacting with the Blue contract.
5. **Decommissioning**: Once the Blue contract is verified in production, the old Green contract may be decommissioned or locked.

### Automated Rollback

If the **Post-Deployment Health Check** fails at any point within a 5-minute monitoring window:

1. The pipeline catches the failure.
2. An automated rollback is triggered.
3. The backend is immediately reverted to point back to the previous (Green) `CONTRACT_ID`.
4. The deployment pipeline fails, alerting the engineering team via Slack/Email.

---

## Manual Deployment Runbook (Emergencies)

In the event of a critical pipeline failure or emergency incident, deployments can be handled manually outside the pipeline.

### Prerequisites
- Node.js 20+
- Rust toolchain and `stellar-cli`
- Required secrets (`ADMIN_SECRET`, `RPC_URL`)

### Step 1: Deploy the Soroban Contract
```bash
cargo build --manifest-path contracts/stellarkraal/Cargo.toml --target wasm32-unknown-unknown --release
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellarkraal.wasm \
  --source-account admin \
  --network mainnet
```
Note the returned `CONTRACT_ID`.

### Step 2: Validate the New Contract
Run read-only queries against the new `CONTRACT_ID` to ensure it was deployed correctly:
```bash
stellar contract invoke \
  --id <NEW_CONTRACT_ID> \
  --source-account admin \
  --network mainnet \
  -- get_state
```

### Step 3: Migrate Traffic
Update your backend infrastructure (e.g., AWS Parameter Store, Kubernetes ConfigMap, or `.env` files) to use the new `CONTRACT_ID`:
```env
CONTRACT_ID=<NEW_CONTRACT_ID>
```
Restart the NestJS backend to apply the changes.

### Step 4: Emergency Rollback
If the new contract behaves unexpectedly:
1. Revert the `CONTRACT_ID` in the backend environment to the previous version.
2. Restart the NestJS backend.
3. Investigate the failure off-chain.
