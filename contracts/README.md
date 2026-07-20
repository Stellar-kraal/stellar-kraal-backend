# contracts/

This directory is reserved for the StellarKraal Soroban contract crates
(livestock collateral registry, loan/credit lifecycle, appraisal oracle
integration, etc.). No contract crates exist in this checkout yet — the
backend currently talks to a Soroban contract deployed and versioned
outside this repo (see `src/services/soroban.service.ts` and `CONTRACT_ID`
in `.env.example`).

## Mutation testing scaffolding

Issue #31 asks for `cargo-mutants` coverage-quality assessment across "all
four contracts." Since no contract crates live in this repo yet, the
scaffolding below is domain-agnostic and activates automatically once real
crates are added under `contracts/<crate-name>/`:

- [`mutants.toml`](mutants.toml) — cargo-mutants config (applies to every
  crate found under this workspace once one exists).
- [`../.github/workflows/mutation-testing.yml`](../.github/workflows/mutation-testing.yml) —
  CI job that runs on merges to `main`, computes a mutation score per crate,
  posts it as a commit status, and fails the build on new surviving mutants
  in security-critical paths.
- [`../docs/testing/security-critical-paths.json`](../docs/testing/security-critical-paths.json) —
  glob list of paths considered security-critical (auth checks, arithmetic,
  state transitions) per crate. Empty until real crates land — fill in as
  each contract is added.
- [`../docs/testing/mutation-baseline.json`](../docs/testing/mutation-baseline.json) —
  allowlist of accepted surviving mutants, used by CI to distinguish
  "already known, triaged" survivors from newly introduced ones.
- [`../docs/testing/mutation-scores.md`](../docs/testing/mutation-scores.md) —
  baseline report template and instructions for interpreting scores and
  adding kill targets.

## Adding a new contract crate

1. Create `contracts/<crate-name>/` with a standard Soroban SDK crate
   (`Cargo.toml`, `src/lib.rs`).
2. Add it as a workspace member in a root `contracts/Cargo.toml` (create one
   if this is the first crate).
3. Add its security-critical globs to `docs/testing/security-critical-paths.json`.
4. Run `cargo mutants` locally against the crate, triage survivors, and
   record the initial baseline in `docs/testing/mutation-scores.md` and
   `docs/testing/mutation-baseline.json`.
5. The `mutation-testing.yml` workflow will then pick the crate up
   automatically on the next merge to `main` (it discovers crates by
   globbing `contracts/*/Cargo.toml`).
