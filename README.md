# SAI Management

Internal system for **PT Subur Anugerah Indonesia** — contracts, invoices, inventory (stock), finance, suppliers, customers, and documents.

## Stack

- Next.js 16 (App Router)
- MySQL / MariaDB + Prisma
- NextAuth (credentials)
- Tailwind CSS

## Quick start (development)

```bash
cp .env.example .env
# Edit DATABASE_URL and AUTH_SECRET

npm run setup          # install, migrate, seed demo data, build
npm run dev            # http://localhost:3000
```

Demo logins (after seed): see terminal output from seed — e.g. `admin` / `admin123`.

To seed manually:

```bash
ALLOW_SEED=true npm run db:seed
```

## Production

See **[PRODUCTION.md](./PRODUCTION.md)** for the full deployment guide.

```bash
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET, AUTH_URL=https://your-domain.com

npm run setup:prod
npm run create-admin -- --username admin --password 'YourSecurePassword12!'
npm run start:prod
```

**Never run `db:seed` on production.**

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start:prod` | Run production server |
| `npm run setup` | Dev setup (includes demo seed) |
| `npm run setup:prod` | Production setup (migrate + build, no seed) |
| `npm run create-admin` | Create first user (production) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Demo data (requires `ALLOW_SEED=true`) |

## Roles

| Role | Access |
|------|--------|
| **bos** (Manager) | Full access + users + audit log |
| **core** (Staff) | Contracts, finance, inventory, etc. |
| **ptg** | Inventory & stock only |

Users with `status = 0` use their password as-is. `status = 1` forces a password change on next login (new users / password reset).

## Security

- JWT sessions, bcrypt passwords, role-based routes
- Rate-limited login and password change
- File upload validation (type, size, magic bytes)
- Audit log: `data/audit/audit.jsonl` (finance, stock, password changes)
- Security headers + HSTS in production

## License

Private — internal use only.
