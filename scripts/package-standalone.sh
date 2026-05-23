#!/bin/bash
# Build a minimal deploy bundle in dist/sai-standalone/
# Upload that folder to your server, add .env, then: node server.js
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/sai-standalone"
STANDALONE="$ROOT/.next/standalone"

cd "$ROOT"

echo "→ prisma generate"
npx prisma generate

echo "→ next build (standalone)"
NODE_ENV=production npm run build

if [ ! -f "$STANDALONE/server.js" ]; then
  echo "ERROR: .next/standalone/server.js not found. Check output: 'standalone' in next.config.ts"
  exit 1
fi

echo "→ assembling dist/sai-standalone"
rm -rf "$OUT"
mkdir -p "$OUT"

cp -R "$STANDALONE/." "$OUT/"
cp -R "$ROOT/public" "$OUT/public"
mkdir -p "$OUT/.next"
cp -R "$ROOT/.next/static" "$OUT/.next/static"
mkdir -p "$OUT/data/audit" "$OUT/public/uploads"

cat > "$OUT/.env.example" <<'EOF'
DATABASE_URL="mysql://user:pass@localhost:3306/your_db"
AUTH_SECRET="paste-output-of-openssl-rand-base64-32"
AUTH_URL="https://your-domain.com"
PORT=3000
TZ="Asia/Jakarta"
EOF

echo ""
echo "═══════════════════════════════════════════════"
echo "  Standalone bundle ready:"
echo "    $OUT"
echo ""
echo "  Upload to server:"
echo "    rsync -avz dist/sai-standalone/ user@server:/var/www/sai/"
echo ""
echo "  On server:"
echo "    cd /var/www/sai"
echo "    cp .env.example .env   # edit with your existing DB + secrets"
echo "    node server.js"
echo "    # or: PORT=3000 node server.js"
echo "═══════════════════════════════════════════════"
