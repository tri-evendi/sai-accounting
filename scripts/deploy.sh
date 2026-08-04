#!/usr/bin/env bash
# Deploy: BUILD FIRST, stop `web` only at the swap.
#
# WHY THIS SHAPE. On this 1.9 GB box `next build` thrashes, so the habit had
# been: stop production, build, bring it back. That makes every deploy a
# downtime window as long as the BUILD (23 min for the last one) — and on
# 2026-08-03 the session that stopped `web` died mid-build, so the "bring it
# back" step never ran and the app stayed down 14 hours. `restart:
# unless-stopped` does not save you there: an explicit `stop` IS the "unless".
#
# Here the old container keeps serving for the whole build. It is stopped only
# once a new image exists, so downtime is the SWAP (recreate + migrate),
# not the compile. A build that fails or is killed costs nothing: `web` was
# never touched.
#
# The swap is also guarded — the EXIT trap below brings `web` back if anything
# between stop and healthy goes wrong. Run it detached so a dying terminal or
# agent session cannot orphan the swap halfway:
#
#   setsid nohup ./scripts/deploy.sh > /tmp/deploy.log 2>&1 &
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SWAP_STARTED=0
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}

log() { printf '%s  %s\n' "$(date +%H:%M:%S)" "$*"; }
mem() { free -m | awk '/^Mem:/{printf "mem %sMB free of %sMB", $7, $2} /^Swap:/{printf ", swap %sMB used\n", $3}'; }

# If we die after `web` was taken down, put it back before leaving. Covers a
# failed migration, a killed shell, a hung image — the exact hole that left
# production down overnight.
restore() {
  local code=$?
  if [[ $SWAP_STARTED -eq 1 ]]; then
    local state
    state="$(docker inspect sai-web --format '{{.State.Status}}' 2>/dev/null || echo missing)"
    if [[ "$state" != "running" ]]; then
      echo
      log "!! DEPLOY LEFT web $state — attempting to bring it back"
      docker compose up -d web 2>&1 | tail -5 || true
      log "!! state now: $(docker inspect sai-web --format '{{.State.Status}}' 2>/dev/null || echo missing)"
      log "!! if this says anything but 'running', production is DOWN — fix by hand"
    fi
  fi
  exit $code
}
trap restore EXIT HUP INT TERM

# ── Preflight ──────────────────────────────────────────────────────────────
[[ -f .env ]] || { echo "ERROR: .env missing"; exit 1; }

log "HEAD $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)"
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "note: working tree is dirty — the image is built from the tree, not from HEAD"
fi

FREE_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
if (( FREE_GB < 3 )); then
  log "ERROR: only ${FREE_GB}GB free on / — a build needs more headroom"
  exit 1
fi
log "disk ${FREE_GB}GB free · $(mem)"

# ── 1. Build, with the old container still serving ─────────────────────────
log "building web + migrate (production stays UP)"
BUILD_START=$SECONDS
docker compose build web migrate
log "build ok in $(( (SECONDS - BUILD_START) / 60 ))m$(( (SECONDS - BUILD_START) % 60 ))s · $(mem)"

# ── 2. Swap ────────────────────────────────────────────────────────────────
# Everything below is the downtime window. Compose stops the old `web`, runs
# `migrate` to completion (`service_completed_successfully`), then starts the
# new `web`. Migrations run here, inside the window, on purpose: the old code
# must never serve against a schema it was not built for.
log "── swap: stopping web, migrating, starting new image ──"
SWAP_STARTED=1
SWAP_START=$SECONDS
docker compose up -d

# ── 3. Verify ──────────────────────────────────────────────────────────────
# Resolve the migrate container by compose service, not by its generated name —
# the name carries the project prefix and changes with the directory.
MIG_ID=$(docker compose ps -aq migrate | head -1)
MIG_CODE=$(docker inspect "$MIG_ID" --format '{{.State.ExitCode}}' 2>/dev/null || echo "?")
if [[ "$MIG_CODE" != "0" ]]; then
  log "!! migrate exited $MIG_CODE — logs:"
  docker logs "$MIG_ID" 2>&1 | tail -20
  exit 1
fi
log "migrations applied:"
docker logs "$MIG_ID" 2>&1 | grep -E 'Applying migration|No pending migrations|Ringkasan' | sed 's/^/    /'

log "waiting for web to report healthy (timeout ${HEALTH_TIMEOUT}s)"
until [[ "$(docker inspect sai-web --format '{{.State.Health.Status}}' 2>/dev/null)" == "healthy" ]]; do
  (( SECONDS - SWAP_START > HEALTH_TIMEOUT )) && { log "!! web never became healthy"; docker logs --tail 30 sai-web; exit 1; }
  sleep 3
done

SWAP_STARTED=0   # past the danger zone; the trap has nothing left to rescue
log "healthy · downtime $(( SECONDS - SWAP_START ))s"

DOMAIN=$(grep -E '^APP_DOMAIN=' .env | cut -d= -f2- | tr -d '"')
if [[ -n "${DOMAIN:-}" ]]; then
  log "https://${DOMAIN}/api/health → $(curl -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}/api/health")"
fi
log "done"
