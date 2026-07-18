# Running SAI LuckyHands with Docker

Full stack in one command: **MariaDB** + automatic **Prisma migrations** + the **Next.js** app.

## Database support

This app targets **MySQL / MariaDB** only. Prisma's `datasource` provider is `mysql`
and the runtime uses `@prisma/adapter-mariadb`. **PostgreSQL is not supported** without
code changes (swapping the Prisma provider + adapter and regenerating migrations).

## Prerequisites

- Docker Engine 20.10+ with the Compose plugin (`docker compose`).

## Quick start

```bash
cp .env.docker.example .env

# Fill in .env:
#   - AUTH_SECRET  →  openssl rand -base64 32
#   - AUTH_URL     →  http://localhost:3000  (or your public https URL)
#   - DB_PASSWORD / DB_ROOT_PASSWORD  →  strong passwords
#   - keep DATABASE_URL's user/password/db in sync with the DB_* values

docker compose up -d --build
```

The app comes up at http://localhost:3000 (change the host port with `APP_PORT`).

Startup order is handled automatically:
1. `db` starts and becomes healthy.
2. `migrate` runs `prisma migrate deploy` once, then exits.
3. `app` starts only after migrations complete successfully.

## Create the first admin user

```bash
docker compose exec app node scripts/... # (see note below)
```

The `create-admin` helper (`npm run create-admin`) uses `tsx`, which is **not** in the
lean runtime image. Run it against the database from the migrator image instead:

```bash
docker compose run --rm --entrypoint "npx tsx scripts/create-admin.ts" migrate
```

## Common commands

```bash
docker compose logs -f app          # tail app logs
docker compose ps                   # service status
docker compose restart app          # restart just the app
docker compose down                 # stop (keeps data volumes)
docker compose down -v              # stop AND delete DB/uploads/audit volumes
docker compose run --rm migrate     # re-run migrations manually
```

## Data persistence

Three named volumes survive `docker compose down`:

| Volume     | Mounted at              | Contents                     |
| ---------- | ----------------------- | ---------------------------- |
| `db_data`  | `/var/lib/mysql`        | MariaDB data                 |
| `uploads`  | `/app/public/uploads`   | Uploaded files               |
| `audit`    | `/app/data/audit`       | Audit-trail JSONL logs       |

## Notes

- Secrets are **not** baked into the image — they're injected at runtime via `env_file`.
- The app runs as the non-root `node` user.
- The image uses Next.js `output: "standalone"`, so only the minimal runtime is shipped.
- Behind a reverse proxy (nginx/Caddy/Traefik) keep `AUTH_TRUST_HOST=true` and set
  `AUTH_URL` to your public HTTPS URL.
