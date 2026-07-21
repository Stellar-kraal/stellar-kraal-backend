#!/usr/bin/env bash
#
# oracle-bridge/scripts/backup-restore-check.sh
#
# Verifies that "restoring from a backup produces a functional bridge,"
# using mock secrets — no live network or real Stellar account required.
# Runs directly with Node (no Docker) so it's fast enough to run on every
# PR touching oracle-bridge/**.
#
#   1. Start a primary instance against a scratch state/backup dir.
#   2. Wait for it to take at least one backup.
#   3. Stop it.
#   4. Restore that backup into a *fresh* state dir (simulating a brand new
#      instance recovering from nothing but the backup).
#   5. Start a new instance pointed at the restored state dir and confirm
#      its /health endpoint reports ok with the expected contract ID —
#      i.e. the restored instance is actually functional, not just that a
#      JSON file exists on disk.
#
# Usage: ./oracle-bridge/scripts/backup-restore-check.sh
# Run from oracle-bridge/ after `npm run build`.
#
set -euo pipefail

WORKDIR="$(mktemp -d)"
trap 'kill "${PRIMARY_PID:-0}" "${RESTORED_PID:-0}" 2>/dev/null || true; rm -rf "$WORKDIR"' EXIT

export CONTRACT_ID="CCONTRACTCHECK00000000000000000000000000000000000000"
export SIGNING_KEY_SECRET_REF="mock://oracle-bridge/signing-key"
export SECRETS_PROVIDER="mock"
export DRY_RUN="true"
export BACKUP_DIR="$WORKDIR/backups"
export BACKUP_INTERVAL_MS="2000"
export SUBMIT_INTERVAL_MS="3000"

log() { echo "[backup-restore-check] $*"; }

wait_for_health() {
  local port="$1" timeout_s="$2" waited=0
  while ! curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; do
    if [ "$waited" -ge "$timeout_s" ]; then
      log "TIMEOUT waiting for health on port ${port}"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

log "Starting primary instance..."
BRIDGE_ROLE=primary STATE_DIR="$WORKDIR/state-primary" PORT=4100 \
  node dist/index.js > "$WORKDIR/primary.log" 2>&1 &
PRIMARY_PID=$!
wait_for_health 4100 20

log "Waiting for at least one backup snapshot..."
waited=0
until [ -f "$WORKDIR/backups/latest.json" ]; do
  if [ "$waited" -ge 20 ]; then
    log "TIMEOUT waiting for backup file"
    cat "$WORKDIR/primary.log"
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done
log "Backup confirmed present"

log "Stopping primary..."
kill "$PRIMARY_PID" 2>/dev/null || true
wait "$PRIMARY_PID" 2>/dev/null || true

log "Restoring into a fresh state directory..."
STATE_DIR="$WORKDIR/state-restored" node dist/cli/restore.js
if [ ! -f "$WORKDIR/state-restored/state.json" ]; then
  log "FAIL: restore did not produce a state.json"
  exit 1
fi

log "Starting a new instance from the restored state..."
STATE_DIR="$WORKDIR/state-restored" PORT=4101 node dist/index.js > "$WORKDIR/restored.log" 2>&1 &
RESTORED_PID=$!
wait_for_health 4101 20

RESPONSE="$(curl -sf http://localhost:4101/health)"
log "Restored instance health: ${RESPONSE}"

GOT_CONTRACT_ID="$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['contractId'])")"
if [ "$GOT_CONTRACT_ID" != "$CONTRACT_ID" ]; then
  log "FAIL: restored instance reports contractId=${GOT_CONTRACT_ID}, expected ${CONTRACT_ID}"
  exit 1
fi

log "PASS: restoring from backup produced a functional, healthy bridge instance"
