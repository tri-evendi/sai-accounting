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

## Redeploying (an instance that is already serving)

`docker compose up --build -d` above is for the **first** boot. To ship a new
version onto a live instance, use:

```bash
setsid nohup ./scripts/deploy.sh > /tmp/deploy.log 2>&1 &
```

It builds `web` + `migrate` **while the old container keeps serving**, and stops
it only once a new image exists. Downtime is the swap (recreate + migrations),
not the compile — measured at **18s**, against ~12–23 minutes for the
build-with-production-down habit it replaces. A build that fails or is killed
costs nothing, because `web` was never touched.

Two reasons not to hand-roll it:

- **The restart is guaranteed.** Once `web` is down, an EXIT trap brings it back
  on any failure — bad migration, dead shell, hung image — and says so loudly if
  it cannot. On 2026-08-03 a session stopped `web` to free RAM, started a build,
  and ended a minute later; nothing restarted it and the app was down 14 hours.
  `restart: unless-stopped` will not rescue you, because a deliberate `stop`
  **is** the "unless" — Docker keeps it down, across reboots included.
- **`setsid nohup` is part of the procedure, not decoration.** A terminal or
  agent session that dies must not be able to orphan the swap halfway.

Migrations deliberately run **inside** the downtime window: the
`service_completed_successfully` gate holds the new `web` until the schema is
ready, and the old code must never serve against a schema it was not built for.

### Known limit on a small box

On the 1.9 GB production host the build still starves the running container:
during a full rebuild, roughly **half** the health probes came back 503 or timed
out, with free memory down to ~41 MB. Traefik pulls the container from rotation
and users see 503s for several minutes. Build-first turns a long hard outage into
a short one plus a degraded window — it does not make deploys invisible. The
actual fix is headroom: build the image on CI or a larger machine and pull it
here, so production only ever experiences the swap.

## Health endpoint

`GET /api/health` is public (whitelisted in `src/proxy.ts`) and returns
`{"status":"ok"}` when the database is reachable, `503` otherwise. It backs both
the container `HEALTHCHECK` and Traefik's load-balancer health probe.

## Create the first admin user

`create-admin` uses `tsx`, which isn't in the lean runtime image — run it from
the migrator image (which has the full toolchain):

```bash
docker compose run --rm --entrypoint "bunx tsx scripts/create-admin.ts" migrate
```

## Common commands

```bash
./scripts/deploy.sh                 # ship a new version (see "Redeploying")
docker compose logs -f web          # tail app logs
docker compose ps                   # service status
docker compose restart web          # restart just the app
docker compose run --rm migrate     # re-run migrations manually
docker compose down                 # stop (keeps data volumes)
docker compose down -v              # stop AND delete DB/uploads/audit volumes
```

Avoid `docker compose stop web` before a build. It is the pattern `deploy.sh`
exists to replace, and it leaves production down for the whole compile with
nothing scheduled to bring it back.

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
