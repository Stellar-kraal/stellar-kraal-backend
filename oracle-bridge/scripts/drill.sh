#!/usr/bin/env bash
#
# oracle-bridge/scripts/drill.sh
#
# Automated disaster-recovery drill for the oracle bridge.
#
#   1. Bring up primary + standby (if not already running).
#   2. Wait for the primary to be healthy and have taken at least one backup.
#   3. Simulate primary failure by stopping its container.
#   4. Promote the standby.
#   5. Wait for the standby to report role=primary and healthy.
#   6. Assert the whole thing completed in under 15 minutes (900s) —
#      the acceptance criterion — and print the measured time.
#
# Usage: ./oracle-bridge/scripts/drill.sh
# Run from the repository root (where docker-compose.yml lives).
#
set -euo pipefail

PROMOTION_BUDGET_SECONDS=900
PRIMARY_PORT="${PRIMARY_PORT:-4000}"
STANDBY_PORT="${STANDBY_PORT:-4001}"
COMPOSE="docker compose"

log() { echo "[drill] $*"; }

wait_for_health() {
  local port="$1" label="$2" want_role="$3" timeout_s="$4"
  local waited=0
  while true; do
    if resp=$(curl -sf "http://localhost:${port}/health" 2>/dev/null); then
      role=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('role',''))" 2>/dev/null || echo "")
      if [ -z "$want_role" ] || [ "$role" = "$want_role" ]; then
        log "${label} healthy (role=${role}) after ${waited}s"
        return 0
      fi
    fi
    if [ "$waited" -ge "$timeout_s" ]; then
      log "TIMEOUT waiting for ${label} (wanted role=${want_role}) after ${timeout_s}s"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

log "=== Oracle Bridge DR Drill ==="

log "Bringing up primary + standby..."
$COMPOSE up -d oracle-bridge-primary oracle-bridge-standby

log "Waiting for primary to be healthy..."
wait_for_health "$PRIMARY_PORT" "primary" "primary" 60

log "Waiting for primary to have taken at least one backup..."
waited=0
until $COMPOSE exec -T oracle-bridge-primary sh -c 'test -f /data/backups/latest.json' 2>/dev/null; do
  if [ "$waited" -ge 60 ]; then
    log "TIMEOUT waiting for primary's first backup"
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done
log "First backup confirmed present after ${waited}s"

log "Waiting for standby to be healthy..."
wait_for_health "$STANDBY_PORT" "standby" "standby" 60

log ">>> Simulating primary failure (docker compose stop) <<<"
DRILL_START=$(date +%s)
$COMPOSE stop oracle-bridge-primary >/dev/null

log "Promoting standby..."
$COMPOSE exec -T oracle-bridge-standby npm run promote

log "Waiting for standby to report role=primary..."
wait_for_health "$STANDBY_PORT" "standby (now primary)" "primary" 120

DRILL_END=$(date +%s)
ELAPSED=$((DRILL_END - DRILL_START))

log "=== Result ==="
log "Promotion completed in ${ELAPSED}s (budget: ${PROMOTION_BUDGET_SECONDS}s)"

if [ "$ELAPSED" -gt "$PROMOTION_BUDGET_SECONDS" ]; then
  log "FAIL: promotion exceeded the 15-minute budget"
  exit 1
fi

log "PASS: standby promoted to primary within budget (${ELAPSED}s / ${PROMOTION_BUDGET_SECONDS}s)"
