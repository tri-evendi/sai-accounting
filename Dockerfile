# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# SAI LuckyHands — Next.js 16 (standalone) + Prisma 7 + MariaDB
#
# Stages:
#   base     → node + system libs (openssl for Prisma engines)
#   bunbase  → base + binary bun (HANYA untuk memasang paket & build)
#   deps     → install all deps via bun (incl. dev, needed for build)
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


# ─── Bun (pemasang paket + peluncur skrip) ───────────────────
# Binary tunggal disalin dari image resmi — lebih murah daripada curl+unzip, dan
# versinya terkunci di sini, bukan "apa pun yang terbaru saat build".
#
# Bun TIDAK menggantikan Node. Node tetap runtime yang menjalankan `next build`,
# `tsc`, dan Prisma (semua binary-nya ber-shebang `#!/usr/bin/env node`), dan
# itulah sebabnya `NODE_OPTIONS=--max-old-space-size=...` di tahap builder MASIH
# BERLAKU — Bun memakai JavaScriptCore yang mengabaikan flag tersebut. Stage
# `runner` sengaja TIDAK memuat bun: image produksi cuma perlu `node server.js`.
#
# Node di base image WAJIB >= 20.19/22.12/24.0 — skrip preinstall Prisma 7
# menolak yang lebih tua, dan bun (beda dari npm) tidak menyuntikkan Node-nya
# sendiri ke depan PATH untuk skrip lifecycle.
FROM base AS bunbase
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun


# ─── Dependencies ────────────────────────────────────────────
FROM bunbase AS deps
COPY package.json bun.lock ./
# Deterministic install of the full dependency set (build needs devDeps).
# --frozen-lockfile = padanan `npm ci`: menolak build bila bun.lock tidak cocok
# dengan package.json, bukan diam-diam menyelesaikan ulang versinya.
RUN bun install --frozen-lockfile


# ─── Build ───────────────────────────────────────────────────
FROM bunbase AS builder
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
#
# `--max-old-space-size=768` WAJIB, bukan penyetelan halus. Mesin ini punya RAM
# ~1,9 GB yang sebagian besar sudah dipakai container yang sedang melayani, jadi
# hanya ~600 MB benar-benar bebas. Tanpa batas heap, fase "Running TypeScript"
# milik `next build` tumbuh sampai kernel membunuhnya — build berhenti dengan
# **exit code 137** (OOM), bukan galat yang menjelaskan dirinya sendiri.
#
# Dengan batas ini Node memilih GC agresif ketimbang membesar; nilai 768 MB
# diverifikasi langsung di mesin ini lewat `NODE_OPTIONS=--max-old-space-size=768
# bunx tsc --noEmit` yang lolos, sementara tanpa batas justru dibunuh.
#
# Beban tipe naik tajam sejak fondasi i18n: kunci kamus adalah dot-path bertipe,
# jadi TypeScript mengevaluasi union berisi ~2.400 literal string. Itu memang
# mahal di memori — jangan heran kalau batas ini perlu ditinjau lagi saat kamus
# bertambah besar.
#
# TIGA klien Prisma di-generate, dan ketiganya wajib: skema PERUSAHAAN
# (`prisma/schema.prisma` → src/generated/prisma, issue #104), skema KENDALI
# (`prisma/control/schema.prisma` → src/generated/control, issue #104), dan
# skema PLATFORM (`prisma/platform/schema.prisma` → src/generated/platform,
# issue #137). Ketiganya gitignored, jadi ketiganya lahir di sini. Tanpa salah
# satunya `next build` berhenti dengan "module not found" pada
# `@/generated/<yang-kurang>/client` — dan pesan itu tidak menyebut sama sekali
# bahwa yang kurang adalah satu perintah generate.
#
# Klien PLATFORM sempat tertinggal di sini padahal kodenya sudah mengimpornya:
# `src/lib/platform-db.ts` dipakai webhook pembayaran, penagihan tenant, dan
# konsol operator — semuanya ikut dikompilasi `next build`, jadi build gagal
# SEBELUM satu baris pun dijalankan. Basis data platform boleh TIDAK ADA saat
# runtime (penagihan mati ≠ aplikasi mati), tetapi KLIEN-nya tetap wajib ada
# saat build; keduanya hal yang berbeda dan mudah tertukar.
RUN NODE_OPTIONS="--max-old-space-size=768" bunx prisma generate \
    && NODE_OPTIONS="--max-old-space-size=768" bunx prisma generate --config prisma.control.config.ts \
    && NODE_OPTIONS="--max-old-space-size=768" bunx prisma generate --config prisma.platform.config.ts \
    && NODE_OPTIONS="--max-old-space-size=768" bun run build


# ─── Migrator (dipakai service `migrate` di compose) ─────────
# Menyimpan node_modules penuh + Prisma CLI + skema, jadi migration bisa jalan.
#
# ══ KENAPA BUKAN `prisma migrate deploy` LANGSUNG (issue #104) ═══════════════
# Perintah itu menerapkan migration ke SATU basis data, yaitu yang ditunjuk
# `DATABASE_URL`. Sejak buku besar menjadi satu basis data per perusahaan, itu
# bukan lagi "basis data aplikasi" — dan yang lebih berbahaya: migration 0042
# MENGHAPUS tabel `users` dari basis data perusahaan.
#
# Bila `docker compose up` dijalankan SEBELUM langkah adopsi (yang menyalin
# pengguna ke basis data kendali), perintah lama itu akan menghapus seluruh akun
# beserta hash kata sandinya, dan satu-satunya jalan pulang adalah cadangan.
# Container yang naik otomatis tidak boleh punya kemampuan itu.
#
# `db:migrate:all` aman terhadap urutan: ia menerapkan migration kendali lebih
# dulu, lalu HANYA ke perusahaan yang SUDAH TERDAFTAR di registry. Pemasangan
# yang belum diadopsi tidak punya satu pun perusahaan terdaftar, jadi tidak ada
# yang disentuh — skripnya berhenti dan menyebutkan perintah adopsi yang harus
# dijalankan lebih dulu.
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["bun", "run", "db:migrate:all"]


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

# Readiness check via /api/health (Node 22 ships global fetch — no curl needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
