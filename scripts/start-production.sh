#!/usr/bin/env bash
# Simple production start — works on Node 18+ (no --env-file flag).
# Next.js also reads .env / .env.production from the project root on start.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV=production

node scripts/check-env.mjs
node scripts/ensure-runtime-dirs.mjs

PORT="${PORT:-3000}"

if [[ -f "$ROOT/server.js" ]]; then
  exec node server.js
fi

exec npx next start -p "$PORT"
