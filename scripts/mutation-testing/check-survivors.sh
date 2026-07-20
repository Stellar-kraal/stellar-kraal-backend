#!/usr/bin/env bash
# Fail if a crate has a surviving (missed) mutant in a security-critical
# path that isn't already triaged in the baseline allowlist.
#
# Usage:
#   check-survivors.sh <crate> <mutants-out-dir> \
#     <security-critical-paths.json> <mutation-baseline.json>
#
# <crate>                    Directory name under contracts/, e.g. loan_manager
# <mutants-out-dir>          cargo-mutants output dir (contains missed.txt)
# <security-critical-paths.json>  See docs/testing/security-critical-paths.json
# <mutation-baseline.json>        See docs/testing/mutation-baseline.json
#
# Exits 1 and prints the offending mutant lines if any survivor in a
# security-critical path is not present in the baseline allowlist for
# this crate. Exits 0 (no-op) if the crate has no configured
# security-critical paths yet.
set -euo pipefail

crate="${1:?usage: check-survivors.sh <crate> <mutants-out-dir> <security-critical-paths.json> <mutation-baseline.json>}"
outdir="${2:?usage: check-survivors.sh <crate> <mutants-out-dir> <security-critical-paths.json> <mutation-baseline.json>}"
critical_paths_file="${3:?usage: check-survivors.sh <crate> <mutants-out-dir> <security-critical-paths.json> <mutation-baseline.json>}"
baseline_file="${4:?usage: check-survivors.sh <crate> <mutants-out-dir> <security-critical-paths.json> <mutation-baseline.json>}"

missed_file="$outdir/missed.txt"
if [ ! -f "$missed_file" ]; then
  echo "No missed.txt found in $outdir — nothing to check."
  exit 0
fi

mapfile -t patterns < <(jq -r --arg c "$crate" '.contracts[$c] // [] | .[]' "$critical_paths_file")
mapfile -t baseline < <(jq -r --arg c "$crate" '.contracts[$c] // [] | .[]' "$baseline_file")

if [ "${#patterns[@]}" -eq 0 ]; then
  echo "No security-critical paths configured for crate '$crate' — skipping check."
  exit 0
fi

is_baselined() {
  local line="$1" b
  for b in "${baseline[@]}"; do
    [ "$b" = "$line" ] && return 0
  done
  return 1
}

matches_critical_path() {
  local relfile="$1" p
  for p in "${patterns[@]}"; do
    # shellcheck disable=SC2053
    if [[ "$relfile" == $p ]]; then
      return 0
    fi
  done
  return 1
}

blocking=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  file="${line%%:*}"
  relfile="${file#src/}"
  if matches_critical_path "$relfile" && ! is_baselined "$line"; then
    blocking+=("$line")
  fi
done < "$missed_file"

if [ "${#blocking[@]}" -gt 0 ]; then
  echo "Blocking surviving mutants in security-critical paths for '$crate':"
  printf '  %s\n' "${blocking[@]}"
  echo ""
  echo "Either add a test that kills each mutant above, or — if a maintainer"
  echo "confirms it's an acceptable/equivalent survivor — record it in"
  echo "$baseline_file under contracts.$crate."
  exit 1
fi

echo "No new surviving mutants in security-critical paths for '$crate'."
exit 0
