#!/usr/bin/env bash
# Run ON the server inside the project folder (after git pull or upload).
# Installs deps, migrates DB, builds, restarts PM2 if present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV=production

echo "→ Checking .env"
if [[ ! -f .env ]]; then
  echo "ERROR: Create .env first (cp .env.example .env and edit it)."
  exit 1
fi

echo "→ npm ci"
npm ci

echo "→ Prisma generate + migrate"
npx prisma generate
npx prisma migrate deploy

echo "→ Runtime directories"
node scripts/ensure-runtime-dirs.mjs

echo "→ Production build"
npm run build

echo "→ Environment check"
node scripts/check-env.mjs

if command -v pm2 >/dev/null 2>&1 && pm2 describe sai-management >/dev/null 2>&1; then
  echo "→ Restarting PM2 (sai-management)"
  pm2 restart sai-management
else
  echo ""
  echo "Build complete. Start with:"
  echo "  npm run start:prod"
  echo "Or install PM2 once:"
  echo "  pm2 start ecosystem.config.cjs && pm2 save"
fi

echo ""
echo "Done."
