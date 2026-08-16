# Smart Contract Upgrade Checklist

## 1. Storage Key Stability
- [ ] Do not rename existing storage keys
- [ ] Do not change the type of storage values
- [ ] Do not remove storage keys
- [ ] Additive changes only (new keys can be added)
- [ ] Verify no storage key collisions

## 2. Storage Type Compatibility
- [ ] Maintain exact struct layouts (no added fields)
- [ ] No enum variant changes or reordering
- [ ] New types require new storage keys
- [ ] No field reordering in structs

## 3. Entry-Point ABI Compatibility
- [ ] No removal of existing functions
- [ ] No removal of function parameters
- [ ] No changing parameter types
- [ ] New parameters require new functions
- [ ] Return types must remain compatible

## 4. Error Enum Stability
- [ ] No renumbering of error variants
- [ ] No removal of error variants
- [ ] New errors added at the end only

## 5. Init/Upgrade Functions
- [ ] init must check for existing state
- [ ] upgrade must preserve existing state
- [ ] Test pre-upgrade state accessibility
- [ ] Test all invariants after upgrade

## 6. Timelock Enforcement
- [ ] 24-hour timelock between proposal and execution
- [ ] Only admins can propose upgrades
- [ ] Ability to cancel pending upgrades
- [ ] Multi-sig for critical upgrades

## 7. Testing Requirements
- [ ] Upgrade test harness covering all contracts
- [ ] Pre-upgrade state seeding
- [ ] Post-upgrade state verification
- [ ] Negative tests for broken upgrades
- [ ] CI runs upgrade tests

## 8. Upgrade Execution Process
1. Propose Upgrade (admin submits WASM hash)
2. Wait 24-hour timelock
3. Execute Upgrade
4. Verify with upgrade tests
5. Monitor post-upgrade

## 9. Rollback Plan
- [ ] Known good WASM available
- [ ] Emergency upgrade path
- [ ] Pause capability during upgrades
