# SAI Accounting

Bookkeeping and accounting system for businesses in Indonesia — double-entry journals and general ledger, receivables and payables, IDR plus foreign currencies, and the operational documents around them (contracts, invoices, delivery orders, inventory). One installation can hold several companies, each with genuinely separate books.

> The first installation was **PT Subur Anugerah Indonesia**; that name survives only as the fallback in `src/lib/constants.ts` and must never be printed for another tenant — see `docs/MULTI-COMPANY.md` and `tests/company-identity.test.ts`.

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

**Server deploy:** see [HOSTING.md](./HOSTING.md) (simple VPS hosting).

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

See **[PRODUCTION.md](./PRODUCTION.md)** for the full deployment guide.

```bash
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET, AUTH_URL=https://your-domain.com

bun run setup:prod
bun run create-admin -- --username admin --password 'YourSecurePassword12!'
bun run start:prod
```

**Never run `db:seed` on production.**

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server |
| `bun run build` | Production build |
| `bun run start:prod` | Run production server |
| `bun run setup` | Dev setup (includes demo seed) |
| `bun run setup:prod` | Production setup (migrate + build, no seed) |
| `bun run create-admin` | Create first user (production) |
| `bun run db:migrate` | Apply Prisma migrations |
| `bun run db:seed` | Demo data (requires `ALLOW_SEED=true`) |

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

- JWT sessions, bcrypt passwords, role-based routes
- Rate-limited login and password change
- File upload validation (type, size, magic bytes)
- Audit log: `data/audit/audit.jsonl` (finance, stock, password changes)
- Security headers + HSTS in production

## License

Private — internal use only.
