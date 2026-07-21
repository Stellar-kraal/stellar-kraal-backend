# Role-Based Access Control (RBAC) Matrix

## Overview
This document maps every privileged entry point across the four contracts and verifies that authorization checks are applied consistently.

## Contract 1: Carbon Registry

| Function | Required Authority | Auth Check | Test Exists | Notes |
|----------|-------------------|------------|-------------|-------|
| `register_project()` | Registry admin | `require_auth(admin)` | ✅ | Project registration |
| `approve_project()` | Registry admin | `require_auth(admin)` | ✅ | Project approval |
| `reject_project()` | Registry admin | `require_auth(admin)` | ✅ | Project rejection |
| `update_verification()` | Registry admin | `require_auth(admin)` | ✅ | Update verification status |
| `add_standard()` | Registry admin | `require_auth(admin)` | ✅ | Add carbon standard |
| `remove_standard()` | Registry admin | `require_auth(admin)` | ✅ | Remove carbon standard |
| `transfer_ownership()` | Current owner | `require_auth(owner)` | ✅ | Ownership transfer |

## Contract 2: Carbon Credit

| Function | Required Authority | Auth Check | Test Exists | Notes |
|----------|-------------------|------------|-------------|-------|
| `mint_credits()` | Issuer | `require_auth(issuer)` | ✅ | Mint new credits |
| `burn_credits()` | Issuer | `require_auth(issuer)` | ✅ | Burn credits |
| `retire_credits()` | Credit owner | `require_auth(owner)` | ✅ | Retire credits |
| `transfer_credits()` | Credit owner | `require_auth(owner)` | ✅ | Transfer credits |
| `set_issuer()` | Current issuer | `require_auth(issuer)` | ✅ | Update issuer |
| `approve_credit()` | Credit owner | `require_auth(owner)` | ✅ | Approve credit |
| `freeze_credits()` | Admin | `require_auth(admin)` | ✅ | Freeze credits |

## Contract 3: Carbon Marketplace

| Function | Required Authority | Auth Check | Test Exists | Notes |
|----------|-------------------|------------|-------------|-------|
| `list_credits()` | Credit owner | `require_auth(owner)` | ✅ | List credits for sale |
| `delist_credits()` | Credit owner | `require_auth(owner)` | ✅ | Remove listing |
| `buy_credits()` | Buyer | `require_auth(buyer)` | ✅ | Purchase credits |
| `cancel_order()` | Order creator | `require_auth(creator)` | ✅ | Cancel order |
| `settle_trade()` | Marketplace admin | `require_auth(admin)` | ✅ | Settle trade |
| `set_fee()` | Marketplace admin | `require_auth(admin)` | ✅ | Update fee rate |
| `pause_trading()` | Marketplace admin | `require_auth(admin)` | ✅ | Pause marketplace |
| `unpause_trading()` | Marketplace admin | `require_auth(admin)` | ✅ | Unpause marketplace |

## Contract 4: Carbon Oracle

| Function | Required Authority | Auth Check | Test Exists | Notes |
|----------|-------------------|------------|-------------|-------|
| `update_price()` | Oracle admin | `require_auth(admin)` | ✅ | Update carbon price |
| `set_aggregator()` | Oracle admin | `require_auth(admin)` | ✅ | Set price aggregator |
| `add_data_source()` | Oracle admin | `require_auth(admin)` | ✅ | Add data source |
| `remove_data_source()` | Oracle admin | `require_auth(admin)` | ✅ | Remove data source |
| `update_threshold()` | Oracle admin | `require_auth(admin)` | ✅ | Update volatility threshold |
| `set_circuit_breaker()` | Oracle admin | `require_auth(admin)` | ✅ | Set circuit breaker |

## Summary

### Findings

| Finding | Severity | Status |
|---------|----------|--------|
| All functions have appropriate require_auth checks | ✅ | Mitigated |
| No unauthorized access paths identified | ✅ | Mitigated |
| Single admin key in each contract | ⚠️ | Documented |
| No multi-sig admin scheme | ⚠️ | Recommended |

### Recommendations

1. **Multi-sig Admin**: Implement multi-sig for admin functions
2. **Time Locks**: Add time locks for critical operations
3. **Audit Trail**: Log all admin actions
4. **Emergency Pause**: Add emergency pause mechanism
5. **Role Rotation**: Implement role rotation schedule

### Centralization Risks (TODO)

```rust
// TODO(security): Consider multi-sig admin scheme
// Current: Single admin key can control all privileged functions
// Recommended: 2-of-3 or 3-of-5 multi-sig for critical operations
# .github/workflows/rbac-lint.yml
# Enforces that require_auth is used on all privileged functions
