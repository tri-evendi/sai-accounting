# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# SAI LuckyHands — Next.js 16 (standalone) + Prisma 7 + MariaDB
#
# Stages:
#   base     → node + system libs (openssl for Prisma engines)
#   deps     → install all npm deps (incl. dev, needed for build)
#   builder  → prisma generate + next build (standalone output)
#   migrator → runs `prisma migrate deploy` (has full deps + CLI)
#   runner   → lean production image, runs server.js as non-root
# ─────────────────────────────────────────────────────────────

# Node 22 (Debian slim) — reliable for native modules: bcrypt, mariadb, sharp.
FROM node:22-bookworm-slim AS base
# openssl + ca-certificates are required by Prisma's engines at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1


# ─── Dependencies ────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# Deterministic install of the full dependency set (build needs devDeps).
RUN npm ci


# ─── Build ───────────────────────────────────────────────────
FROM base AS builder
ENV NODE_ENV=production
# Placeholders so module-load code (e.g. src/lib/prisma.ts) doesn't throw while
# Next collects page/route data at build time. No DB connection is made here,
# and these are overridden by the real runtime env (env_file) at container start.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build" \
    AUTH_SECRET="build-time-placeholder" \
    AUTH_URL="http://localhost:3000"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client into src/generated/prisma, then build standalone.
RUN npx prisma generate \
    && npm run build


# ─── Migrator (used by the `migrate` compose service) ────────
# Keeps the full node_modules + Prisma CLI + schema so `migrate deploy` works.
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]


# ─── Runtime ─────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Standalone output already bundles the minimal node_modules it needs.
# server.js is emitted at the repo root of the standalone bundle.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Runtime-writable dirs. Creating + chowning them here means Docker named
# volumes mounted at these paths inherit `node` ownership on first use.
RUN mkdir -p ./public/uploads ./data/audit \
    && chown -R node:node /app

USER node
EXPOSE 3000

# Basic liveness check — any HTTP response (even a 3xx auth redirect) means up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
