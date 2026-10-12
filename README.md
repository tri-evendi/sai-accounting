# SAI Accounting

Bookkeeping and accounting system for businesses in Indonesia — double-entry journals and general ledger, receivables and payables, IDR plus foreign currencies, and the operational documents around them (contracts, invoices, delivery orders, inventory). One installation can hold several companies, each with genuinely separate books.

> The first installation was **PT Subur Anugerah Indonesia**; that name survives only as the fallback in `src/lib/constants.ts` and must never be printed for another tenant — see `docs/MULTI-COMPANY.md` and `tests/company-identity.test.ts`.

## Dokumentasi

**Indeks lengkap: [`docs/README.md`](./docs/README.md).**

**Arsitektur & peta layanan:** [`docs/arsitektur/`](./docs/arsitektur/) — potret
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
- MySQL / MariaDB + Prisma
- NextAuth (credentials)
- Ant Design v6 (tanpa Tailwind sejak issue #203 — gaya sebaris di atas token AntD)
- **Bun** sebagai pemasang paket & peluncur skrip; **Node** tetap runtime-nya

## Prasyarat

- **Node.js 20.19+ / 22.12+ / 24+** — Prisma 7 menolak versi di bawahnya
- **Bun 1.2+** — `curl -fsSL https://bun.sh/install | bash`

Bun yang memasang dependensi dan menjalankan skrip (`bun run <skrip>`), tapi
`next build`, `tsc`, Prisma, dan skrip `tsx` tetap dieksekusi **Node** lewat
shebang binary-nya. Itu disengaja: batas memori `NODE_OPTIONS=--max-old-space-size`
yang dipakai proyek ini hanya berlaku di V8, dan akan hilang diam-diam kalau ada
yang memaksakan runtime Bun (`bun --bun …` atau `bun skrip.ts`).

> `bun test` **bukan** perintah tes proyek ini — itu test runner bawaan Bun dan
> ia mengabaikan `vitest.config.ts`. Pakai **`bun run test`**.

Jika `bun install` gagal dengan *"Prisma only supports Node.js versions…"*
padahal `node -v` terlihat baru: `PATH` Anda mendahulukan Node lama. Bun
menjalankan skrip lifecycle dengan `node` dari `PATH` dan tidak mewarisi
alias/fungsi shell nvm — periksa dengan `env node -v`.

## Quick start (development)

```bash
cp .env.example .env
# Edit DATABASE_URL and AUTH_SECRET

**Server deploy:** see [PRODUCTION.md](./PRODUCTION.md) §Updates — Docker Compose + image dari GHCR. Itu **satu-satunya** jalur: perkakas standalone/PM2 pra-Docker dicabut 12 Okt 2026, dan tidak ada langkah build di server lagi.

bun run setup          # install, migrate, seed demo data, build
bun run dev            # http://localhost:3000
```

> Setelah menarik perubahan yang menyentuh `package.json`, jalankan **`bun
> install`** lagi sebelum `bun run dev`. `node_modules` yang lebih tua dari
> `package.json` gagal DIAM-DIAM sampai halamannya disentuh — contoh nyata:
> tanpa `nodemailer`, Turbopack tetap me-resolve `import("nodemailer")` di
> `src/lib/mailer-core.ts` walau transport `file` tidak pernah memakainya,
> dan `/api/auth/register` menjawab 500. (`scripts/check-env.mjs` memeriksa
> ini pada start produksi.)

Demo logins (after seed): see terminal output from seed — e.g. `admin` / `admin123`.

To seed manually:

```bash
ALLOW_SEED=true bun run db:seed
```

## Production

Produksi berjalan di **Docker Compose**, dan image-nya dibangun di **runner
GitHub** — bukan di server.

**Menggelar rilis baru:** [PRODUCTION.md](./PRODUCTION.md) **§Updates**. Itu
satu-satunya jalur yang hidup.

```bash
git pull
docker compose pull app-customer app-operator migrate job-scheduler job-conformance job-backup
docker compose run --rm migrate bun run db:migrate:all   # bila rilisnya membawa migration
docker compose up -d
```

> ⚠ **Jangan membangun di server.** Kotak produksi ~3,6 GB berbagi dengan lima
> aplikasi lain; `next build` di sana pernah menghabiskan ~19 menit dengan
> iowait 58–92%, dan separuh health probe menjawab 503 selama rebuild. Lihat
> `AGENTS.md`.

**Jangan pernah** menjalankan `db:seed` di produksi.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server |
| `bun run verify` | **Gerbang**: typecheck + lint + test. Wajib hijau sebelum merge |
| `bun run build` | Production build |
| `bun run db:migrate:all` | **Terapkan migration ke SEMUA basis data** (kendali → platform → setiap PT) |
| `bun run db:generate` | Bangkitkan ketiga klien Prisma |
| `bun run setup` | Dev setup (includes demo seed) |
| `bun run create-admin` | Create first user |
| `bun run db:seed` | Demo data (requires `ALLOW_SEED=true`) |

> ⚠ **`bun run db:migrate` (tunggal) berbahaya di pemasangan multi-PT.** Ia
> menerapkan migration ke **satu** basis data — yang ditunjuk `DATABASE_URL` —
> dan **migration 0042 menghapus tabel `users` dari basis data perusahaan**.
> Pakai **`db:migrate:all`**, yang aman terhadap urutan. Alasan lengkapnya di
> `package.json` dan `docs/arsitektur/07-INFRASTRUKTUR-DEPLOY.md` §6.

Daftar lengkap (53 skrip) ada di `package.json`, masing-masing dengan catatan
alasannya.

## Roles

| Role | Access |
|------|--------|
| **managing_director** (Direktur Utama) | Full access + users + audit log |
| **administrator** (System Administrator) | Full access — identical to Managing Director |
| **finance_manager** (Manajer Keuangan) | Contracts, finance, inventory, etc. |
| **warehouse_head** (Kepala Gudang) | Inventory & stock only |

Role keys were standardised in migration `0032_standard_role_positions`
(`bos` → `managing_director`, `core` → `finance_manager`, `ptg` → `warehouse_head`).
Custom roles beyond these four are created from `/permissions` — see `docs/RBAC.md`.

Users with `status = 0` use their password as-is. `status = 1` forces a password change on next login (new users / password reset).

## Security

- JWT sessions (24 jam), bcrypt passwords, otorisasi berbasis **izin** (bukan
  perbandingan string peran) — `docs/RBAC.md`
- Rate-limited login dan ganti sandi
- Validasi unggahan berkas (tipe, ukuran, magic bytes); berkas disajikan lewat
  route berpenjaga, **bukan** sebagai statis
- **Jejak audit di TABEL**, bukan berkas: `audit_logs` di tiap buku PT, dan
  `tenant_audit_logs` di basis data kendali. (Sebelumnya
  `data/audit/audit.jsonl`; dipindahkan oleh migration 0044 +
  `bun run migrate:audit`.)
- Header keamanan + HSTS di produksi; CSP **tanpa `unsafe-eval`** di produksi —
  `tests/security-headers.test.ts` menjaganya
- Konsol operator di **hostname terpisah**, gagal-tertutup: tanpa
  `OPERATOR_HOST`, `/operator` 404 di mana pun

## License

Private — internal use only.
