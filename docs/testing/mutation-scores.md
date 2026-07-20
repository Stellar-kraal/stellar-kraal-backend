# Mutation Testing — Scores & Methodology

**Relates to:** Issue #31 — Mutation testing for Soroban contract test suite coverage quality assessment
**CI workflow:** [`.github/workflows/mutation-testing.yml`](../../.github/workflows/mutation-testing.yml)
**Tooling:** [`cargo-mutants`](https://mutants.rs/)

---

## Status

No contract crates exist in this repository yet — see [`contracts/README.md`](../../contracts/README.md).
This document, the CI workflow, and the config files below are scaffolding
that activates automatically once contract crates are added under
`contracts/<crate-name>/`. There is no mutation score baseline to report
until then; the table in [Baseline scores](#baseline-scores) is a template.

## What mutation testing measures

Code coverage answers "did the tests execute this line?" It does not answer
"would the tests notice if this line were wrong?" Mutation testing answers
the second question: `cargo-mutants` systematically rewrites small pieces
of the contract source (e.g. `+` → `-`, `==` → `!=`, deletes a `require_auth`
call, replaces a return value with a default) and re-runs the test suite
against each mutated build. A mutant that makes a test fail was **caught**
(good — the suite would catch this class of bug). A mutant that the suite
doesn't notice **survived** (a gap — a real bug shaped like this mutant
would ship undetected).

## How the score is computed

For each crate, `cargo-mutants` sorts every generated mutant into one of
four buckets, written one per line to `mutants.out/{caught,missed,timeout,unviable}.txt`:

| Bucket | Meaning |
|---|---|
| `caught` | A test failed against the mutated build — detected. |
| `missed` | All tests passed against the mutated build — **not** detected. |
| `timeout` | The mutated build hung/exceeded the test timeout — treated as detected (the mutation changed behavior enough to matter). |
| `unviable` | The mutated code didn't compile — not a meaningful test of the suite, excluded from the score entirely. |

```
detected = caught + timeout
tested   = detected + missed
score    = detected / tested * 100
```

This is computed by [`scripts/mutation-testing/score.sh`](../../scripts/mutation-testing/score.sh),
which reads the plain-text output files rather than `outcomes.json` —
the JSON schema has changed across `cargo-mutants` releases, while the
text file format has stayed stable.

## Interpreting a score

- **A low score is a map, not a verdict.** It tells you *where* the test
  suite has gaps; it doesn't mean the code is broken. Read the actual
  `missed.txt` entries before acting on the number.
- **100% is not the goal.** Some mutants are semantically equivalent to
  the original code (e.g. mutating an unreachable branch, or a `Debug`-only
  code path) and can never be killed by a behavioral test. Chasing 100%
  produces brittle tests that assert on implementation details instead of
  behavior. This is explicitly out of scope for Issue #31.
- **Security-critical paths get a stricter bar.** Authorization checks,
  arithmetic on balances/amounts, and state-transition logic are where a
  missed mutant is most likely to represent an exploitable bug, not a
  cosmetic one. These paths are called out separately (see below) and held
  to a ≥80% mutation score, enforced by CI.

## Security-critical paths & CI enforcement

[`docs/testing/security-critical-paths.json`](security-critical-paths.json)
lists, per crate, glob patterns (relative to `contracts/<crate>/src/`)
considered security-critical. The CI workflow runs
[`scripts/mutation-testing/check-survivors.sh`](../../scripts/mutation-testing/check-survivors.sh)
against every PR touching `contracts/**`: any surviving mutant whose file
matches one of those globs fails the job **unless** it's already recorded
in [`docs/testing/mutation-baseline.json`](mutation-baseline.json).

## Adding a new kill target

When you add a test intended to kill a specific surviving mutant:

1. Find the mutant's description in `mutants.out/missed.txt` (format:
   `<file>:<line>:<col>: <description>`, e.g.
   `src/lib.rs:42:5: replace + with - in transfer`).
2. Write the smallest test that would fail if that specific mutation were
   applied — usually an assertion on the exact value/behavior the mutation
   would corrupt, not a broad "does it run" test.
3. Re-run `cargo mutants --file src/lib.rs` (scope to the changed file to
   keep the loop fast) and confirm the mutant moved from `missed.txt` to
   `caught.txt`.
4. If a survivor is a confirmed equivalent mutant (cannot be killed by any
   behavioral test) rather than a real gap, add it to
   `mutation-baseline.json` under `contracts.<crate>` with a comment in the
   PR explaining why, so a reviewer can sign off.

## Running locally

```bash
cargo install cargo-mutants   # one-time
cd contracts/<crate-name>
cargo mutants                 # full run, can take a while
cargo mutants --file src/auth.rs   # scope to one file while iterating
```

## Baseline scores

_No contract crates exist yet — this table is a template to fill in as
each crate's initial baseline is established (see
[`contracts/README.md`](../../contracts/README.md#adding-a-new-contract-crate),
step 4)._

| Crate | Baseline date | Caught | Missed | Timeout | Unviable | Score | Security-critical score |
|---|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | | | |
