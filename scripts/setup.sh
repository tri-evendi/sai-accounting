#!/bin/bash
set -e

echo "═══════════════════════════════════════════════"
echo "  SAI Management — New Environment Setup"
echo "═══════════════════════════════════════════════"
echo ""

# 1. Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is not installed"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "ERROR: npx is not available"; exit 1; }
echo "  Node.js: $(node -v)"
echo ""

# 2. Check .env
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "  IMPORTANT: Edit .env and configure:"
  echo "    1. DATABASE_URL — your MySQL connection string"
  echo "    2. AUTH_SECRET  — run: openssl rand -base64 32"
  echo ""
  echo "  Then re-run this script."
  exit 1
fi

# Check AUTH_SECRET is set
if grep -q 'AUTH_SECRET=""' .env; then
  echo "ERROR: AUTH_SECRET is empty in .env"
  echo "  Generate one with: openssl rand -base64 32"
  exit 1
fi

# Check DATABASE_URL is not placeholder
if grep -q 'username:password' .env; then
  echo "ERROR: DATABASE_URL still has placeholder credentials in .env"
  echo "  Update it with your actual MySQL connection string."
  exit 1
fi

# 3. Install dependencies
echo "Installing dependencies..."
npm install
echo ""

# 4. Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate
echo ""

# 5. Run database migration
echo "Running database migrations..."
npx prisma migrate deploy
echo ""

# 6. Seed the database (development demo data only)
echo "Seeding database with demo data (ALLOW_SEED=true)..."
ALLOW_SEED=true npx tsx prisma/seed.ts
echo ""

# 7. Build
echo "Building the application..."
npm run build
echo ""

echo "═══════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Start the app:  npm run dev"
echo "  Production:     npm start"
echo "═══════════════════════════════════════════════"
