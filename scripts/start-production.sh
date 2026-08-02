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

# Sengaja TIDAK memakai `npx`/`bunx`: skrip ini ikut terkirim di dalam bundel
# standalone ke server yang boleh jadi tidak punya npm MAUPUN bun — hanya Node.
# Memanggil binary lokal langsung membuat start-up tidak bergantung pada
# package manager apa pun (shebang-nya `#!/usr/bin/env node`).
if [[ ! -x "$ROOT/node_modules/.bin/next" ]]; then
  echo "ERROR: server.js tidak ada dan node_modules/.bin/next juga tidak."
  echo "  Bundel standalone semestinya punya server.js; untuk checkout penuh"
  echo "  jalankan 'bun install' lebih dulu."
  exit 1
fi

exec "$ROOT/node_modules/.bin/next" start -p "$PORT"
