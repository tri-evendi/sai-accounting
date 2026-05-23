#!/bin/bash
set -euo pipefail

echo "═══════════════════════════════════════════════"
echo "  SAI Management — Production Setup"
echo "═══════════════════════════════════════════════"
echo ""

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and configure it first."
  exit 1
fi

if grep -q 'AUTH_SECRET=""' .env || ! grep -q '^AUTH_SECRET=.' .env; then
  echo "ERROR: Set AUTH_SECRET in .env (openssl rand -base64 32)"
  exit 1
fi

if grep -q 'username:password' .env; then
  echo "ERROR: Update DATABASE_URL in .env with real MySQL credentials"
  exit 1
fi

if grep -q 'AUTH_URL="http://localhost' .env; then
  echo "WARNING: AUTH_URL still points to localhost."
  echo "         Set AUTH_URL to your production HTTPS URL before go-live."
  echo ""
fi

echo "Installing dependencies..."
npm ci
echo ""

echo "Generating Prisma client..."
npx prisma generate
echo ""

echo "Running database migrations (no demo seed)..."
npx prisma migrate deploy
echo ""

echo "Creating runtime directories..."
mkdir -p data/audit public/uploads
chmod 755 data/audit public/uploads 2>/dev/null || true
echo "  ✓ data/audit"
echo "  ✓ public/uploads"
echo ""

echo "Building production bundle..."
NODE_ENV=production npm run build
echo ""

echo "═══════════════════════════════════════════════"
echo "  Production setup complete"
echo ""
echo "  Next steps:"
echo "    1. Create admin:  npm run create-admin -- --username admin --password 'YOUR_SECURE_PASSWORD'"
echo "    2. Start server:  npm run start:prod"
echo ""
echo "  Do NOT run db:seed on production."
echo "═══════════════════════════════════════════════"
