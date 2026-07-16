# Contract Size / Cost / ABI Gate

Scripts backing the `contract-gate` job in [`.github/workflows/contracts-ci.yml`](../../.github/workflows/contracts-ci.yml) (Issue 38). Runs on every PR touching `contracts/**` and compares the PR's head commit against its base commit on three axes, posting one PR comment with the combined result.

| Check | Threshold | Bypass |
|---|---|---|
| WASM binary size | fails if head is **>10%** larger than base | `contract-size-override` label (justification recorded in the PR description) |
| Simulation cost (CPU instructions, per scenario) | fails if any scenario is **>15%** higher than base | none — fix the regression or justify inline in the code |
| ABI compatibility (contract entry points) | fails on any **removed** entry point or a **changed parameter count** on an existing one | none |

If the base commit has no `contracts/stellarkraal` at all (e.g. the PR that first adds it), every check falls back to "no baseline — informational only" and never blocks.

## Scripts

- **`extract_abi.py <path/to/lib.rs>`** — source-level extractor. Finds the single `#[contractimpl] impl … { }` block and returns `{fn_name: arg_count}` as JSON for every `pub fn` inside it. This is a name/arity-level check (sufficient to catch removed or renamed entry points, per the issue's acceptance criteria) — it is **not** a full type-level ABI diff. If the contract ever needs stronger guarantees (e.g. catching a parameter's *type* changing while its count stays the same), replace this with `stellar-cli`'s WASM-embedded spec extraction instead.
- **`compare_gate.py`** — takes the head (required) and base (optional) WASM path, cost-report JSON, and ABI JSON, and produces:
  - `report.md` — the Markdown posted as the PR comment
  - `summary.json` — machine-readable `{"blocking": bool, ...}` the workflow reads to decide whether to fail the job

## Where the numbers come from

- **Size**: `cargo build --release --target wasm32-unknown-unknown`, then the `.wasm` file's byte size. No external tooling.
- **Cost**: the `report_instruction_costs` test in [`../stellarkraal/src/tests.rs`](../stellarkraal/src/tests.rs) — it runs the same six scenarios as the existing `bench_*_instruction_count` tests, but unconditionally prints every result as `CONTRACT_COST_REPORT_JSON:[...]` instead of only asserting a fixed ceiling on failure. The workflow greps that line out of `cargo test`'s output. This intentionally avoids a `stellar-cli` dependency — `env.budget().cpu_instruction_cost()` (from `soroban-sdk`'s `testutils`) is the same mechanism the contract's own benchmark tests already use and is proven to work in this repo's test suite.
- **ABI**: `extract_abi.py`, described above.

## Local reproduction

```bash
cd contracts/stellarkraal
cargo build --release --target wasm32-unknown-unknown   # → ../target/wasm32-unknown-unknown/release/stellarkraal.wasm
cargo test report_instruction_costs -- --nocapture       # prints CONTRACT_COST_REPORT_JSON:[...]
python3 ../ci/extract_abi.py src/lib.rs                  # prints the ABI JSON
```

## Known simplifications

- The base commit used for comparison is `github.event.pull_request.base.sha` (the PR's recorded base ref), not a computed merge-base. This matches the base branch tip at the time of the PR's last sync, which is adequate for this gate but is not a true three-way merge-base.
- A base-build failure for any reason *other than* a missing `contracts/stellarkraal` (e.g. a pre-existing break already on `main`) is treated the same as "no baseline" rather than blocking the PR — the intent is to never punish a PR for a problem it didn't introduce. If `main` is broken, that should surface via the regular `contracts` job on `push`, not via this gate.
