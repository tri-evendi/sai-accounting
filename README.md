# SAI Accounting

Bookkeeping and accounting system for businesses in Indonesia — double-entry journals and general ledger, receivables and payables, IDR plus foreign currencies, and the operational documents around them (contracts, invoices, delivery orders, inventory). One installation can hold several companies, each with genuinely separate books.

> The first installation was **PT Subur Anugerah Indonesia**; that name survives only as the fallback in `packages/core/src/constants.ts` and must never be printed for another tenant — see `docs/MULTI-COMPANY.md` and `tests/company-identity.test.ts`.

## Dokumentasi

Indeks lengkap: [`docs/README.md`](./docs/README.md).

**Arsitektur & peta layanan:** [`docs/arsitektur/`](./docs/arsitektur/), potret
keadaan yang berjalan (komponen, layanan, dependensi, API, aliran data,
infrastruktur, penilaian, peta jalan). Mulai dari
[indeksnya](./docs/arsitektur/README.md).

Dokumen domain: [`docs/MULTI-COMPANY.md`](./docs/MULTI-COMPANY.md) ·
[`docs/MULTI-TENANT.md`](./docs/MULTI-TENANT.md) ·
[`docs/RBAC.md`](./docs/RBAC.md) · [`docs/DATABASE.md`](./docs/DATABASE.md) ·
[`docs/MODUL-USAHA.md`](./docs/MODUL-USAHA.md) ·
[`docs/KOMERSIALISASI.md`](./docs/KOMERSIALISASI.md) ·
[`docs/PRICING.md`](./docs/PRICING.md) ·
[`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md). Aturan kerja: [`AGENTS.md`](./AGENTS.md).

## Stack

- Next.js 16 (App Router)
- PostgreSQL 17 + PgBouncer + Prisma (`@prisma/adapter-pg`), sejak 15 Okt 2026; sebelumnya MariaDB
- NextAuth (credentials)
- Ant Design v6 (tanpa Tailwind sejak issue #203; gaya sebaris di atas token AntD)
- Bun sebagai pemasang paket & peluncur skrip; Node tetap runtime-nya

## Prasyarat

- Node.js 20.19+ / 22.12+ / 24+ (Prisma 7 menolak versi di bawahnya)
- Bun 1.2+ — `curl -fsSL https://bun.sh/install | bash`

Bun memasang dependensi dan menjalankan skrip (`bun run <skrip>`), tetapi
`next build`, `tsc`, Prisma, dan skrip `tsx` tetap dieksekusi Node lewat
shebang binary-nya. Ini disengaja: batas memori `NODE_OPTIONS=--max-old-space-size`
hanya berlaku di V8, dan hilang tanpa peringatan bila runtime Bun dipaksakan
(`bun --bun …` atau `bun skrip.ts`).

> Perintah tes proyek ini adalah `bun run test`. `bun test` menjalankan test
> runner bawaan Bun, yang mengabaikan `vitest.config.mts`.

Jika `bun install` gagal dengan *"Prisma only supports Node.js versions…"*
padahal `node -v` terlihat baru, `PATH` Anda mendahulukan Node lama. Bun
menjalankan skrip lifecycle dengan `node` dari `PATH` dan tidak mewarisi
alias/fungsi shell nvm. Periksa dengan `env node -v`.

## Quick start (development)

```bash
cp .env.example .env   # isi DATABASE_URL, CONTROL_DATABASE_URL, (PLATFORM_DATABASE_URL), AUTH_SECRET
bun install
bun run db:migrate:all # kendali → platform → setiap PT
bun run db:generate    # ketiga klien Prisma
bun run dev            # http://localhost:3000  (konsol operator: bun run dev:operator → :3001)
```

> `.env.example` masih memuat contoh URL `mysql://`, padahal mesinnya
> PostgreSQL; tulis `postgres://…`. `bun run setup` (`scripts/setup.sh`) belum
> diperbarui: ia hanya menerapkan migration ke satu `DATABASE_URL` dan masih
> menyebut MySQL. Pakai langkah di atas.

> Setelah menarik perubahan yang menyentuh `package.json`, jalankan `bun
> install` lagi. `node_modules` yang lebih tua dari `package.json` baru gagal
> saat halamannya dibuka (`scripts/check-env.mjs` memeriksa ini pada start
> produksi).

Demo logins (after seed): see terminal output from seed — e.g. `admin` / `admin123`.

To seed manually:

```bash
ALLOW_SEED=true bun run db:seed
```

## Production

Produksi berjalan di Docker Compose, dan image-nya dibangun di runner GitHub,
tidak di server.

**Menggelar rilis baru:** [PRODUCTION.md](./PRODUCTION.md) §Updates:
`pull` → (migrate bila ada migration baru) → `up -d`. Itu satu-satunya jalur
penggelaran; langkahnya tidak disalin di sini supaya hanya ada satu versi.

> ⚠ **Jangan membangun di server.** Kotak produksi ~3,6 GB berbagi dengan lima
> aplikasi lain (per Okt 2026). `next build` di sana pernah memakan ~19 menit
> dengan iowait 58–92%, dan separuh health probe menjawab 503 selama rebuild.
> Lihat `AGENTS.md`.

Jangan menjalankan `db:seed` di produksi.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server (aplikasi pelanggan) |
| `bun run dev:operator` | Development server konsol operator (`apps/operator`, port 3001) |
| `bun run verify` | Gerbang: typecheck + lint + test. Wajib hijau sebelum merge |
| `bun run build` | Production build aplikasi pelanggan |
| `bun run build:operator` | Production build konsol operator |
| `bun run db:migrate:all` | Terapkan migration ke semua basis data (kendali → platform → setiap PT) |
| `bun run db:generate` | Bangkitkan ketiga klien Prisma |
| `bun run create-admin` | Create first user |
| `bun run db:seed` | Demo data (requires `ALLOW_SEED=true`) |

> `bun run db:migrate` (tunggal) hanya menerapkan migration company ke satu
> basis data, yaitu yang ditunjuk `DATABASE_URL`. Selalu pakai
> `db:migrate:all`. Alasannya di `package.json` dan
> `docs/arsitektur/07-INFRASTRUKTUR-DEPLOY.md` §6.

Daftar lengkap skrip ada di `package.json`, masing-masing dengan catatan
alasannya.

## Roles

| Role | Access |
|------|--------|
| **managing_director** (Direktur Utama) | Full access + users + audit log |
| **administrator** (System Administrator) | Full access — identical to Managing Director |
| **finance_manager** (Manajer Keuangan) | Contracts, finance, inventory, etc. |
| **warehouse_head** (Kepala Gudang) | Inventory & stock only |

Custom roles beyond these four are created from `/permissions` — see `docs/RBAC.md`.

Users with `must_change_password = true` must change their password on next login (new users / password reset); `false` uses the password as-is.

## Security

- Sesi JWT (24 jam), kata sandi bcrypt, otorisasi berbasis izin, tanpa
  perbandingan string peran (`docs/RBAC.md`)
- Rate-limited login dan ganti sandi
- Validasi unggahan berkas (tipe, ukuran, magic bytes); berkas disajikan lewat
  route berpenjaga, tidak sebagai berkas statis
- Jejak audit disimpan di tabel: `audit_logs` di tiap buku PT,
  `tenant_audit_logs` di basis data kendali, dan `operator_audit_logs` di
  basis data platform
- Header keamanan + HSTS di produksi; CSP tanpa `unsafe-eval` di produksi,
  dijaga `tests/security-headers.test.ts`
- Konsol operator adalah aplikasi tersendiri (`apps/operator`, image
  `-operator`) di hostname terpisah (`ops.saiaccounting.id`), tanpa awalan
  `/operator` (`/`, `/tenants`, `/login`, …). Ia gagal-tertutup: tanpa
  `OPERATOR_HOST` ia menjawab 404 di mana pun

## License

Private — internal use only.
