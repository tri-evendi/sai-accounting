# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# SAI LuckyHands — Next.js 16 (standalone) + Prisma 7 + PostgreSQL
#
# Stages:
#   base     → node + system libs (openssl for Prisma engines)
#   bunbase  → base + binary bun (HANYA untuk memasang paket & build)
#   deps     → install all deps via bun (incl. dev, needed for build)
#   builder  → prisma generate + next build (standalone output)
#   migrator → runs `prisma migrate deploy` (has full deps + CLI)
#   runner   → lean production image, runs server.js as non-root
# ─────────────────────────────────────────────────────────────

# Node 22 (Debian slim) — reliable for native modules: bcrypt, sharp.
FROM node:22-bookworm-slim AS base
# openssl + ca-certificates are required by Prisma's engines at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Tanggal bisnis = jam Jakarta (keputusan pemilik 22 Okt 2026). Batas laporan
# memakai offset eksplisit (`@sai/core/business-date`), tetapi hitungan
# kalender lain — tahun buku, periode stok — masih memakai jam lokal proses.
# Bawaan ini menjaganya tetap WIB di image mana pun, termasuk on-premise;
# `.env` boleh menimpanya.
ENV NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Jakarta


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
# `bunx` adalah bun yang dipanggil dengan nama lain — di image oven/bun ia
# TAUTAN, bukan biner tersendiri, jadi menyalin `bun` saja tidak membawanya.
# Tanpa baris ini setiap `bunx …` di tahap build mati dengan `bunx: not found`
# (exit 127) — dan itu terjadi sejak perpindahan ke bun (#160): image produksi
# yang sedang berjalan dibangun SEBELUM perpindahan itu, jadi tidak ada yang
# pernah membangun ulang dan menemukannya sampai penggelaran #151.
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx


# ─── Dependencies ────────────────────────────────────────────
FROM bunbase AS deps
COPY package.json bun.lock ./
# Manifes paket workspace (`packages/*`, dok 14 §5 Fase 1) WAJIB ada sebelum
# install: tanpanya `--frozen-lockfile` menolak, karena bun.lock mencatat
# `@sai/db` sebagai anggota workspace. Hanya manifesnya — sumbernya datang
# lewat `COPY . .` di tahap berikut, dan symlink node_modules/@sai/db yang
# dibuat di sini menunjuk ke sana. Paket baru = satu baris baru di sini.
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY packages/billing/package.json packages/billing/
COPY packages/platform/package.json packages/platform/
# Aplikasi tambahan (`apps/*`, monorepo Fase 3d) juga anggota workspace.
COPY apps/operator/package.json apps/operator/
# Deterministic install of the full dependency set (build needs devDeps).
# --frozen-lockfile = padanan `npm ci`: menolak build bila bun.lock tidak cocok
# dengan package.json, bukan diam-diam menyelesaikan ulang versinya.
RUN bun install --frozen-lockfile


# ─── Build: sumber + ketiga klien Prisma, dipakai KEDUA aplikasi ────────────
# (monorepo Fase 3d) `builder` (pelanggan) dan `builder-operator` (konsol)
# berangkat dari tahap ini, jadi `prisma generate` berjalan sekali.
FROM bunbase AS prepared
ENV NODE_ENV=production
# Placeholders so module-load code (e.g. src/lib/prisma.ts) doesn't throw while
# Next collects page/route data at build time. No DB connection is made here,
# and these are overridden by the real runtime env (env_file) at container start.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder" \
    AUTH_URL="http://localhost:3000"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client into packages/db/generated/company, then build standalone.
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
# (`packages/db/prisma/company/schema.prisma` → packages/db/generated/company, issue #104), skema KENDALI
# (`packages/db/prisma/control/schema.prisma` → packages/db/generated/control, issue #104), dan
# skema PLATFORM (`packages/db/prisma/platform/schema.prisma` → packages/db/generated/platform,
# issue #137). Ketiganya gitignored, jadi ketiganya lahir di sini. Tanpa salah
# satunya `next build` berhenti dengan "module not found" pada
# `@sai/db/client/<yang-kurang>` — dan pesan itu tidak menyebut sama sekali
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
    && NODE_OPTIONS="--max-old-space-size=768" bunx prisma generate --config prisma.platform.config.ts

# ─── Build aplikasi PELANGGAN ────────────────────────────────
FROM prepared AS builder
RUN NODE_OPTIONS="--max-old-space-size=768" bun run build

# ─── Build KONSOL OPERATOR (`apps/operator`) ─────────────────
# Aplikasi Next kedua. `outputFileTracingRoot` = akar repo, jadi keluaran
# standalone-nya memuat `apps/operator/server.js` + `node_modules` + paket yang
# tertelusur, dengan struktur direktori akar repo.
FROM prepared AS builder-operator
RUN NODE_OPTIONS="--max-old-space-size=768" bun run build:operator


# ─── Migrator (dipakai service `migrate` dan `svc-worker` di compose) ─
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
# ══ KENAPA BUKAN `FROM builder` (ditemukan saat menggelar #151) ═════════════
# Migrator hanya butuh dependensi, sumber, skema, migration, dan KLIEN Prisma.
# Ia tidak pernah menyentuh keluaran `next build` — tetapi mewarisi `builder`
# berarti ikut menanggung build itu: ~10 menit di mesin ini, dan pada mesin
# 1,9 GB yang sedang melayani produksi ia justru THRASHING sampai setengah jam
# tanpa keluaran. Akibatnya satu-satunya image yang benar-benar butuh berkas
# migration adalah image yang paling mahal dibuat — persis terbalik.
#
# Dengan `FROM bunbase` + node_modules dari `deps`, migrator lahir dalam
# hitungan menit dan bisa dibangun ulang kapan pun tanpa menyentuh build web.
FROM bunbase AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Skrip migration & operator mengimpor ketiga klien Prisma (lihat komentar
# tahap `builder`); ketiganya gitignored, jadi ketiganya lahir di sini juga.
RUN NODE_OPTIONS="--max-old-space-size=512" bunx prisma generate \
    && NODE_OPTIONS="--max-old-space-size=512" bunx prisma generate --config prisma.control.config.ts \
    && NODE_OPTIONS="--max-old-space-size=512" bunx prisma generate --config prisma.platform.config.ts
CMD ["bun", "run", "db:migrate:all"]


# ─── Cadangan (dipakai service `backup` di compose) ──────────
# Issue #374. Di atas `migrator` — bukan tahap baru dari nol — karena skrip
# pembuktian pemulihan (`prove-backup-restore`) menuntut klien Prisma yang
# sudah lahir di sana, dan membangunnya dua kali berarti dua kali waktu build
# di mesin yang sudah sempit.
#
# Dua perkakas yang belum ada di image mana pun: `postgresql-client` (untuk
# `pg_dump`/`pg_dumpall`) dan `awscli` (untuk `aws s3`, yang berbicara ke
# penyedia S3-compatible mana pun lewat `--endpoint-url`). `openssl` sudah ada
# dari tahap `base` — ia dipasang di sana untuk Prisma, dan dipakai ulang di
# sini untuk menyandikan arsipnya.
#
# `mariadb-client` DICABUT di Fase E (#636, 22 Okt 2026). Ia dipasang selama
# jendela transisi supaya `prove-backup-restore` masih bisa membaca cadangan
# MariaDB terakhir; dump terakhir itu kini dibuktikan sekali dengan `mariadb:11`
# sekali pakai, dan image `sha-c9b5d9c` (v0.12.0) adalah image terakhir yang
# masih membawa klien itu.
#
# ⚠ awscli DIPAKAI, BUKAN SigV4 buatan sendiri. Menandatangani permintaan S3
# sendiri hanya butuh ~60 baris, dan itulah jebakannya: ia akan terlihat benar
# di uji dan gagal pada penyedia pertama yang menormalkan header sedikit
# berbeda — pada hari kita mencoba MEMULIHKAN. Protokol yang sudah dipakai
# jutaan orang tidak layak ditulis ulang demi menghemat satu paket.
#
# ⚠ DI CI, tahap `migrator` di bawah ini DIGANTI image `-migrator` yang baru
# saja didorong, dirujuk lewat digest-nya (`build-contexts:` di
# `.github/workflows/publish-image.yml`). Tanpa itu `-migrator` dan `-backup`
# dibangun di job terpisah dengan lapisan `node_modules` yang sama isinya
# tetapi BEDA digest — terukur 2,035 GB unik untuk image yang seharusnya hanya
# menambah ~336 MB lapisan apt di cakram produksi. Membangun tahap ini secara
# lokal tetap bekerja seperti biasa: tanpa konteks bernama, `migrator` adalah
# tahap di atas.
FROM migrator AS backup
# ⚠ `postgresql-client` Debian bookworm adalah versi **15**, dan `pg_dump`
# MENOLAK server yang lebih baru daripada dirinya. Service `pg` di compose
# adalah PostgreSQL **17**, jadi klien bawaan Debian akan gagal dengan
#
#   pg_dumpall: error: aborting because of server version mismatch
#   detail: server version: 17.11; pg_dumpall version: 15.19
#
# Itu DIUKUR, bukan dibaca dari dokumentasi — dan kegagalannya akan terjadi pada
# cadangan PERTAMA sesudah penukaran, waktu terburuk yang mungkin.
#
# Maka klien diambil dari repositori resmi PostgreSQL (PGDG) dan DIPATOK ke 17,
# sejajar dengan `PG_CLIENT_MAJOR` di `docker-compose.yml`. Klien yang lebih baru
# bisa mendump server yang lebih tua, jadi arah ini aman; kebalikannya tidak.
# `tests/pg-client-version.test.ts` menolak kalau keduanya menyimpang.
RUN apt-get update \
    && apt-get install -y --no-install-recommends awscli curl gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
         https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*
CMD ["sh", "scripts/backup.sh"]


# ─── Build GO: integrator (tahap 1b, rancangan §3.3/§3.5) ────
#
# Dua tahap bertambah, dan keduanya TIDAK menyentuh tahap mana pun di atasnya:
# pohon Go di luar workspace bun, jadi `bun install` tidak pernah melihatnya dan
# `node_modules` tidak pernah masuk ke sini.
#
# ══ VERSINYA DIPATOK, DAN DIPATOK SEJAJAR `go.mod` ═════════════════════════
# Versi Go yang berbeda antara mesin pengembang dan image berarti perilaku yang
# berbeda pada hal yang paling sulit dilihat: urutan map, GC, dan `time`
# monotonik. `golangci-lint` di CI membaca versinya DARI `go.mod`
# (`go-version-file`), jadi satu-satunya tempat yang bisa menyimpang adalah
# baris di bawah ini — dan `tests/go-image-version.test.ts` menolak kalau ia
# menyimpang.
FROM golang:1.23-bookworm AS go-build
WORKDIR /src
# Manifes lebih dulu, lalu sumbernya: lapisan `go mod download` hanya batal
# ketika dependensinya berubah, bukan setiap kali satu komentar disunting.
COPY services/integrator/go.mod services/integrator/go.sum ./
RUN go mod download
COPY services/integrator/ ./
# `CGO_ENABLED=0` → biner statis, yang memang seluruh alasan Go dipilih (§3.3):
# runtime tipis tanpa glibc yang harus cocok. `-trimpath` menghapus jalur mesin
# pembangun dari biner; `-s -w` membuang tabel simbol debug (~30% ukuran).
#
# SATU biner sejak "1 image = 1 container" (keputusan pemilik 22 Okt 2026):
# `svc-integrator` menjalankan jalur `tenant` (cadangan) DAN jalur
# `interactive` sisi Go (lembar sebar laporan ber-`engine: "go"`, tahap 1d)
# dalam satu proses. `cmd/tenant` dan `cmd/interactive` tetap ada untuk
# mengembangkan satu jalur, tapi TIDAK masuk image — biner yang tidak
# dijalankan compose mana pun hanya permukaan.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/svc-integrator ./cmd/integrator


# ─── Runtime integrator (service `svc-integrator`) ───────────────────────
#
# ══ KENAPA BUKAN `FROM scratch` ════════════════════════════════════════════
# Biner-nya statis, jadi `scratch` cukup untuk MENJALANKANNYA — tapi jalur
# `tenant` memanggil `pg_dump`/`pg_dumpall`, dan format dump PostgreSQL adalah
# format yang hanya perkakas resminya berhak mengklaim bisa menulis (alasan
# yang sama yang membuat `awscli` tidak ditulis ulang di tahap `backup`).
#
# Yang TIDAK ikut, dan itu seluruh keuntungannya atas tahap `backup`: tidak ada
# Node, tidak ada `node_modules`, tidak ada Prisma, tidak ada Python dan tidak
# ada `awscli` — SDK S3 ada DI DALAM biner. Diperiksa di image yang sudah
# dibangun, bukan diasumsikan.
#
# `openssl` IKUT, dan itu bukan karena kita memintanya: ia dependensi
# `postgresql-client`. Jalur ini tidak memakainya sama sekali (enkripsinya
# pustaka baku Go), tapi kehadirannya kebetulan berguna dan pantas disebut —
# perintah pemulihan yang tertulis di PRODUCTION.md bisa dijalankan DARI image
# ini juga. Yang penting tetap arah ketergantungannya: format artefaknya tetap
# format `openssl enc` supaya pemulihan tidak menuntut biner Go ini, bukan
# sebaliknya.
#
# ⚠ `postgresql-client` Debian bookworm adalah versi **15**, dan `pg_dump`
# MENOLAK server yang lebih baru daripada dirinya:
#
#   pg_dumpall: error: aborting because of server version mismatch
#   detail: server version: 17.11; pg_dumpall version: 15.19
#
# Itu DIUKUR, bukan dibaca dari dokumentasi, dan ia terjadi pada cadangan
# PERTAMA sesudah penukaran. Maka klien diambil dari PGDG dan DIPATOK ke 17,
# sejajar dengan service `pg` di compose — dijaga
# `tests/pg-client-version.test.ts`, yang memeriksa SETIAP penyebutan
# `postgresql-client-<n>` di berkas ini, bukan hanya yang pertama.
#
# Jalur Go juga memeriksanya SAAT JALAN (`backup.PeriksaVersi`): tes menjaga
# niat, pemeriksaan runtime menjaga kenyataan.
# Terukur: 185 MB, melawan image `backup` yang mewarisi `migrator` beserta
# seluruh `node_modules`-nya. Angka itu disebut di sini supaya kenaikannya
# nanti terbaca sebagai perubahan, bukan sebagai keadaan.
FROM debian:bookworm-slim AS integrator
# `ca-certificates` untuk TLS ke penyedia S3. Tanpanya unggahan gagal dengan
# "x509: certificate signed by unknown authority" — galat yang terbaca seperti
# kredensial salah.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
         https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y curl gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*
COPY --from=go-build /out/svc-integrator /usr/local/bin/svc-integrator
# Direktori kerja cadangan: satu basis data pada satu waktu, lalu dibuang.
# Di dalam container, bukan di volume — isinya plaintext seumur beberapa detik,
# dan ia tidak boleh selamat dari restart.
RUN install -d -m 700 /tmp/backup
WORKDIR /app
#
# ⚠ TETAP ROOT, dan itu keputusan — bukan kelalaian.
#
# Dua tahap runtime lain di berkas ini memakai `USER node`, jadi non-root
# memang konvensi di sini, dan layanan INILAH yang paling pantas
# mendapatkannya: ia satu-satunya yang memegang `BACKUP_ENCRYPTION_KEY` — dan
# sejak 22 Okt 2026 ia juga mengurai parameter laporan pengguna di proses yang
# sama (09 §3.2), yang membuat argumen ini lebih kuat, bukan lebih lemah.
#
# Yang menahannya bukan prinsip melainkan satu kenyataan yang tidak bisa diuji
# dari sini: volume `cadangan` SUDAH ADA di mesin produksi, dibuat root oleh
# `job-backup`, dan Docker TIDAK menerapkan kepemilikan dari image ke volume
# bernama yang sudah ada. `USER nobody` karena itu akan lolos setiap
# pemeriksaan di repo ini lalu gagal menulis pada putaran PERTAMA di mesin yang
# sudah berjalan — dengan galat izin yang terbaca seperti cakram penuh.
#
# Syarat untuk memindahkannya, supaya tidak perlu ditemukan ulang:
# `chown -R` volume `cadangan` ke uid yang dipakai, lalu pindahkan baris ini.
# Itu langkah penyebaran, bukan perubahan kode, jadi tempatnya PRODUCTION.md.
CMD ["svc-integrator"]


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
RUN mkdir -p ./public/uploads ./data/audit ./data/documents \
    && chown -R node:node /app

USER node
EXPOSE 3000

# Readiness check via /api/health (Node 22 ships global fetch — no curl needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]


# ─── Runtime KONSOL OPERATOR ─────────────────────────────────
# Image sendiri sejak monorepo Fase 4: image pelanggan tidak lagi memuat konsol,
# dan image ini tidak memuat satu pun halaman buku. Dibangun dari commit yang
# SAMA dengan `runner` (lihat publish-image.yml).
FROM base AS runner-operator
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# `server.js` standalone ada di `apps/operator/` (akar penelusuran = akar repo)
# dan ia `chdir` ke direktorinya sendiri saat mulai.
COPY --from=builder-operator /app/apps/operator/.next/standalone ./
COPY --from=builder-operator /app/apps/operator/.next/static ./apps/operator/.next/static

# Volume jejak lama (`audit`) masih dipasang compose ke /app/data/audit.
RUN mkdir -p ./data/audit && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/operator/server.js"]
