# SAI Accounting

Bookkeeping and accounting system for businesses in Indonesia — double-entry journals and general ledger, receivables and payables, IDR plus foreign currencies, and the operational documents around them (contracts, invoices, delivery orders, inventory). One installation can hold several companies, each with genuinely separate books.

> The first installation was **PT Subur Anugerah Indonesia**; that name survives only as the fallback in `packages/core/src/constants.ts` and must never be printed for another tenant — see `docs/MULTI-COMPANY.md` and `tests/company-identity.test.ts`.

## Documentation

Full index: [`docs/README.md`](./docs/README.md).

**Architecture & service map:** [`docs/arsitektur/`](./docs/arsitektur/), a
snapshot of what is actually running (components, services, dependencies, APIs,
data flow, infrastructure, assessment, roadmap). Start from
[its index](./docs/arsitektur/README.md).

Domain documents: [`docs/MULTI-COMPANY.md`](./docs/MULTI-COMPANY.md) ·
[`docs/MULTI-TENANT.md`](./docs/MULTI-TENANT.md) ·
[`docs/RBAC.md`](./docs/RBAC.md) · [`docs/DATABASE.md`](./docs/DATABASE.md) ·
[`docs/MODUL-USAHA.md`](./docs/MODUL-USAHA.md) ·
[`docs/KOMERSIALISASI.md`](./docs/KOMERSIALISASI.md) ·
[`docs/PRICING.md`](./docs/PRICING.md) ·
[`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md). On-premise:
[`docs/ONPREM-SERAH-TERIMA.md`](./docs/ONPREM-SERAH-TERIMA.md) (handover
template) · [`docs/ONPREM-PINDAH-DARI-SAAS.md`](./docs/ONPREM-PINDAH-DARI-SAAS.md)
(moving a SaaS tenant on-premise). Working rules: [`AGENTS.md`](./AGENTS.md).

## Stack

- Next.js 16 (App Router)
- PostgreSQL 17 + PgBouncer + Prisma (`@prisma/adapter-pg`) since 15 Oct 2026; MariaDB before that (retired from code and compose in #636, 22 Oct 2026)
- NextAuth (credentials)
- Ant Design v6 (no Tailwind since issue #203; inline styles on top of AntD tokens)
- Bun as package installer & script runner; Node remains the runtime

## Prerequisites

- Node.js 20.19+ / 22.12+ / 24+ (Prisma 7 refuses anything older)
- Bun 1.2+ — `curl -fsSL https://bun.sh/install | bash`

Bun installs dependencies and runs scripts (`bun run <script>`), but
`next build`, `tsc`, Prisma, and the `tsx` scripts still execute on Node through
their binaries' shebangs. This is deliberate: the `NODE_OPTIONS=--max-old-space-size`
memory cap only applies to V8, and silently disappears if the Bun runtime is
forced (`bun --bun …` or `bun script.ts`).

> The test command for this project is `bun run test`. `bun test` runs Bun's
> built-in test runner, which ignores `vitest.config.mts`.

If `bun install` fails with *"Prisma only supports Node.js versions…"* even
though `node -v` looks recent, your `PATH` puts an old Node first. Bun runs
lifecycle scripts with the `node` found on `PATH` and does not inherit nvm's
shell aliases/functions. Check with `env node -v`.

## Quick start (development)

```bash
cp .env.example .env   # fill in DATABASE_URL, CONTROL_DATABASE_URL, (PLATFORM_DATABASE_URL), AUTH_SECRET
bun install
bun run db:migrate:all # control → platform → every company
bun run db:generate    # all three Prisma clients
bun run dev            # http://localhost:3000  (operator console: bun run dev:operator → :3001)
```

> `mysql://` URLs are rejected at start-up: MariaDB was retired in #636
> (22 Oct 2026). `bun run setup` (`scripts/setup.sh`) only applies migrations to
> a single `DATABASE_URL`; use the steps above.

> After pulling changes that touch `package.json`, run `bun install` again. A
> `node_modules` older than the new `package.json` only fails once the affected
> page is opened (`scripts/check-env.mjs` checks this on production start).

Demo logins (after seed): see terminal output from seed — e.g. `admin` / `admin123`.

To seed manually:

```bash
ALLOW_SEED=true bun run db:seed
```

## Production

Production runs on Docker Compose, and the images are built on GitHub runners,
not on the server.

**Deploying a new release:** [PRODUCTION.md](./PRODUCTION.md) §Updates:
`pull` → (migrate if there are new migrations) → `up -d`. That is the only
deployment path; the steps are not copied here so that only one version exists.

> ⚠ **Never build on the server.** The production box (2 vCPU, 8 GB) is shared
> with five other applications (as of Oct 2026). A `next build` there once took ~19 minutes
> with 58–92% iowait, and half the health probes answered 503 during the rebuild.
> See `AGENTS.md`.

Do not run `db:seed` in production.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server (customer app) |
| `bun run dev:operator` | Operator console development server (`apps/operator`, port 3001) |
| `bun run verify` | Gate: typecheck + lint + test. Must be green before merge |
| `bun run build` | Production build of the customer app |
| `bun run build:operator` | Production build of the operator console |
| `bun run db:migrate:all` | Apply migrations to every database (control → platform → every company) |
| `bun run db:generate` | Generate all three Prisma clients |
| `bun run create-admin` | Create first user |
| `bun run db:seed` | Demo data (requires `ALLOW_SEED=true`) |

> `bun run db:migrate` (single) only applies the company migrations to one
> database, the one `DATABASE_URL` points to. Always use `db:migrate:all`. The
> reasoning is in `package.json` and `docs/arsitektur/02-LAYANAN-INFRA.md`

The full list of scripts is in `package.json`, each with a note explaining why it
exists.

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

- JWT sessions (24 hours), bcrypt passwords, permission-based authorization with
  no role-string comparisons (`docs/RBAC.md`)
- Rate-limited login and password change
- File upload validation (type, size, magic bytes); files are served through
  guarded routes, never as static files
- Audit trails are stored in tables: `audit_logs` in each company's books,
  `tenant_audit_logs` in the control database, and `operator_audit_logs` in the
  platform database
- Security headers + HSTS in production; CSP without `unsafe-eval` in production,
  guarded by `tests/security-headers.test.ts`
- The operator console is a separate application (`apps/operator`, image
  `-operator`) on its own hostname (`ops.saiaccounting.id`), with no `/operator`
  prefix (`/`, `/tenants`, `/login`, …). It is fail-closed: without
  `OPERATOR_HOST` it answers 404 everywhere

## License

Private — internal use only.
