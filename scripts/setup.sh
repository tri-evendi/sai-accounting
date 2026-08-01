#!/bin/bash
set -e

echo "═══════════════════════════════════════════════"
echo "  SAI Accounting — New Environment Setup"
echo "═══════════════════════════════════════════════"
echo ""

# 1. Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is not installed"; exit 1; }
command -v bun >/dev/null 2>&1 || {
  echo "ERROR: bun is not installed (this project uses bun as its package manager)"
  echo "  Install it with: curl -fsSL https://bun.sh/install | bash"
  exit 1
}
echo "  Node.js: $(node -v)"
echo "  Bun:     $(bun -v)"

# Prisma 7 menolak Node di bawah 20.19. Yang dipakai di sini adalah `node` dari
# PATH — BUKAN alias/fungsi shell milik nvm, karena subproses tidak mewarisi
# fungsi shell. Kalau PATH mendahulukan Node lama (mis. baris `export
# PATH="/opt/homebrew/opt/node@18/bin:$PATH"` di ~/.zshrc), `bun install` akan
# gagal di skrip preinstall Prisma dengan pesan "Please upgrade your Node.js
# version" — meski `node -v` di prompt interaktif terlihat baru.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  echo "ERROR: Node $(node -v) terlalu lama — Prisma 7 butuh 20.19+ / 22.12+ / 24+."
  echo "  Periksa urutan PATH: $(command -v node)"
  exit 1
fi
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
bun install
echo ""

# 4. Generate Prisma client
echo "Generating Prisma client..."
bunx prisma generate
echo ""

# 5. Run database migration
echo "Running database migrations..."
bunx prisma migrate deploy
echo ""

# 6. Seed the database (development demo data only)
echo "Seeding database with demo data (ALLOW_SEED=true)..."
ALLOW_SEED=true bunx tsx prisma/seed.ts
echo ""

# 7. Build
echo "Building the application..."
bun run build
echo ""

echo "═══════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Start the app:  bun run dev"
echo "  Production:     bun run start"
echo "═══════════════════════════════════════════════"
