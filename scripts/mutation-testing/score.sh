#!/usr/bin/env bash
# Compute a mutation score from a cargo-mutants output directory.
#
# Usage: score.sh <mutants-out-dir>
#
# cargo-mutants writes one mutant description per line to caught.txt,
# missed.txt, timeout.txt and unviable.txt inside its output directory.
# That plain-text format has been stable across cargo-mutants releases,
# unlike the outcomes.json schema, so this script reads those files
# rather than parsing JSON.
#
# Mutation score = detected / tested, where:
#   detected = caught + timeout   (a timeout means the mutant changed
#                                   behavior enough to hang/exceed the
#                                   test timeout — treated as detected)
#   tested   = detected + missed  (unviable mutants don't compile, so
#                                   they exercise nothing and are excluded)
#
# Prints key=value pairs on stdout: caught, timeout, missed, unviable,
# tested, score (percentage, two decimal places).
set -euo pipefail

outdir="${1:?usage: score.sh <mutants-out-dir>}"

count_lines() {
  local f="$1"
  if [ -f "$f" ]; then
    wc -l < "$f" | tr -d ' '
  else
    echo 0
  fi
}

caught=$(count_lines "$outdir/caught.txt")
missed=$(count_lines "$outdir/missed.txt")
timeout=$(count_lines "$outdir/timeout.txt")
unviable=$(count_lines "$outdir/unviable.txt")

detected=$((caught + timeout))
tested=$((detected + missed))

if [ "$tested" -eq 0 ]; then
  score="0.00"
else
  score=$(awk -v d="$detected" -v t="$tested" 'BEGIN { printf "%.2f", (d / t) * 100 }')
fi

echo "caught=$caught"
echo "missed=$missed"
echo "timeout=$timeout"
echo "unviable=$unviable"
echo "tested=$tested"
echo "score=$score"
