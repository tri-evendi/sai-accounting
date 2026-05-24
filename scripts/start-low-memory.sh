#!/usr/bin/env bash
# Start with a smaller Node heap — for shared hosting with limited RAM.
# Build on your Mac first (npm run build:upload). Do not build on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV=production
# Cap V8 heap (MB). Raise to 512 only if you see "heap out of memory" in logs.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=384}"
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-2}"
export DB_CONNECTION_LIMIT="${DB_CONNECTION_LIMIT:-2}"

node scripts/check-env.mjs
node scripts/ensure-runtime-dirs.mjs

PORT="${PORT:-3000}"

if [[ -f "$ROOT/server.js" ]]; then
  exec node server.js
fi

exec npx next start -p "$PORT"
