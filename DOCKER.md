# Running SAI LuckyHands with Docker (Traefik-fronted)

Full stack: **MariaDB** + automatic **Prisma migrations** + the **Next.js** app,
fronted by an **existing Traefik** instance (same convention as movin-partner /
wedding-movin). Traefik terminates TLS and routes
`inventory.suburanugerahindonesia.com` to the app over the shared external
`traefik_default` network — the app is **not** published on the host directly.

## Database support

MySQL / MariaDB only. Prisma's `datasource` provider is `mysql` and the runtime
uses `@prisma/adapter-mariadb`. **PostgreSQL is not supported** without code
changes (swapping the Prisma provider + adapter and regenerating migrations).

## Prerequisites

- Docker Engine 20.10+ with the Compose plugin.
- An existing **Traefik** instance on the host with:
  - `web` (:80) and `websecure` (:443) entrypoints,
  - a certificate resolver named **`le`** (Let's Encrypt),
  - attached to the external Docker network **`traefik_default`**.
- DNS: `inventory.suburanugerahindonesia.com` → the Traefik host's public IP.

## Quick start

```bash
cp .env.docker.example .env

# Fill in .env:
#   - AUTH_SECRET  →  openssl rand -base64 32
#   - AUTH_URL     →  https://inventory.suburanugerahindonesia.com
#   - APP_DOMAIN   →  inventory.suburanugerahindonesia.com
#   - DB_PASSWORD / DB_ROOT_PASSWORD  →  strong passwords
#   - keep DATABASE_URL's user/password/db in sync with the DB_* values

docker compose up --build -d
```

Startup order is automatic:
1. `db` (MariaDB) starts and becomes healthy.
2. `migrate` runs `prisma migrate deploy` once, then exits.
3. `web` starts only after migrations succeed, and registers with Traefik.

Traefik picks up the container via labels and serves it at
`https://inventory.suburanugerahindonesia.com` (HTTP is redirected to HTTPS).

## Health endpoint

`GET /api/health` is public (whitelisted in `src/proxy.ts`) and returns
`{"status":"ok"}` when the database is reachable, `503` otherwise. It backs both
the container `HEALTHCHECK` and Traefik's load-balancer health probe.

## Create the first admin user

`create-admin` uses `tsx`, which isn't in the lean runtime image — run it from
the migrator image (which has the full toolchain):

```bash
docker compose run --rm --entrypoint "npx tsx scripts/create-admin.ts" migrate
```

## Common commands

```bash
docker compose logs -f web          # tail app logs
docker compose ps                   # service status
docker compose restart web          # restart just the app
docker compose run --rm migrate     # re-run migrations manually
docker compose down                 # stop (keeps data volumes)
docker compose down -v              # stop AND delete DB/uploads/audit volumes
```

## Data persistence

Named volumes survive `docker compose down`:

| Volume    | Mounted at            | Contents               |
| --------- | --------------------- | ---------------------- |
| `db_data` | `/var/lib/mysql`      | MariaDB data           |
| `uploads` | `/app/public/uploads` | Uploaded files         |
| `audit`   | `/app/data/audit`     | Audit-trail JSONL logs |

## Networks

- `traefik` (external `traefik_default`) — ingress from Traefik to `web` only.
- `internal` (bridge) — private link between `web`, `migrate`, and `db`. The
  database is never exposed to Traefik or the host.

## Notes

- Secrets are injected at runtime via `env_file`, never baked into the image.
- The app runs as the non-root `node` user; uses Next.js `output: "standalone"`.
- To change the domain, set `APP_DOMAIN` (and `AUTH_URL`) in `.env`.
