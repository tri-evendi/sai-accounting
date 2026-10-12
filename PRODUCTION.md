# Production deployment — SAI Accounting

> ## 👉 Deploying a new release? Go straight to [§Updates](#updates-new-release).
>
> That is the **only live deployment path**: images are built by GitHub Actions
> and the server runs `docker compose pull` + `up -d`. **Never build on the
> server** — see `AGENTS.md`.
>
> **Sections 1-7 below describe the FIRST install**, and a brand-new box only
> needs **§1 → §3 → §6 → §Updates**. §2, §4 and §5 are **tombstones**: the
> PM2 / `next start` / nginx tooling they described was deleted on 12 Oct 2026,
> and the headings remain only so the numbering and the links into them keep
> working.
>
> | I want to… | Go to |
> |---|---|
> | Ship a new release | [§Updates](#updates-new-release) |
> | Roll back | [§Rollback](#rollback) |
> | Deploy the service rename / operator split | [§One-time](#-one-time-the-service-rename--operator-split) |
> | Set up backups | [§Automated backups](#automated-backups-issue-374) |
> | Read the logs | [§Reading the logs](#reading-the-logs-issue-374) |
> | Install on a brand-new box | §1 → §3 → §6 → §Updates |

## Prerequisites

- Node.js 20.19+ / 22.12+ / 24+ (Prisma 7 menolak yang lebih tua)
- Bun 1.2+ — `curl -fsSL https://bun.sh/install | bash` (pemasang paket & peluncur skrip; Node tetap runtime-nya)
- MySQL 8+ / MariaDB (private network, not public)
- HTTPS reverse proxy — **Traefik** in this deployment, configured via the Docker labels in `docker-compose.yml`
- Domain pointed at your server

## 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Production value |
|----------|------------------|
| `DATABASE_URL` | Real MySQL connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://your-domain.com` (HTTPS, no trailing slash) |
| `NODE_ENV` | `production` (set in the image) |
| `PORT` | Optional, default `3000` |

**Never set `ALLOW_SEED=true` in production.**

## 2. Install and build

> 🪦 **REMOVED 12 Oct 2026 — the tooling this section described no longer
> exists.** It ran `next build` **on the server**, which `AGENTS.md` forbids:
> that box has 3.6 GB of RAM shared with five other apps, building 0.6.0 there
> took ~19 minutes at 58-92% iowait, and two concurrent builds have produced an
> OOM (exit 137).
>
> Deleted with it: `scripts/setup-production.sh`, `scripts/package-standalone.sh`,
> `scripts/start-production.sh`, `scripts/start-low-memory.sh`,
> `scripts/deploy-on-server.sh`, both `ecosystem.config*.cjs`,
> `.github/workflows/build-standalone.yml`, and the `setup:prod` /
> `start:prod` / `start:low-mem` / `build:upload` / `package:standalone` /
> `deploy` scripts in `package.json`.
>
> **A brand-new box goes §1 → §3 → §6 → [§Updates](#updates-new-release).**
> There is no build step on the server at all: images come from GHCR.

The directories it used to create (`data/audit`, `data/documents`,
`public/uploads`) are now volumes — see [§6](#6-writable-directories).
Migrations are a deliberate, separate step: [§Updates](#updates-new-release).

**Do not run** `bun run db:seed` on production.

## 3. Create the first admin

```bash
bun run create-admin -- --username admin --password 'YourSecurePassword12!' --name "Administrator"
```

- User is created with **status 0** (no forced password change).
- Add more users from **Settings → Users** (manager role only).

## 4. Start the server

> 🪦 **REMOVED 12 Oct 2026 — PM2, `next start` and the standalone bundle are
> gone**, tooling and all (listed in [§2](#2-install-and-build)).
>
> The app is started by Docker Compose: `app-customer` and `app-operator` run
> the **same image** from GHCR and are told apart by `OPERATOR_HOST` plus their
> Traefik labels. See [§Updates](#updates-new-release) and
> `docs/arsitektur/07-INFRASTRUKTUR-DEPLOY.md`.

## 5. Reverse proxy

> 🪦 **REMOVED 12 Oct 2026 — the nginx example is gone.** Production is
> fronted by **Traefik**, configured entirely through the Docker labels in
> `docker-compose.yml` (routers `sai-app`, `sai-www`, `sai-ops`). There is no
> hand-written proxy config to keep in sync any more.
>
> The two label rules that must never be "tidied": the customer and operator
> routers need **distinct Traefik service names** (`sai-app` vs `sai-ops`) or
> Traefik load-balances between them, and `app-customer` must keep
> `OPERATOR_HOST: ""`. Both are explained in
> [§One-time](#-one-time-the-service-rename--operator-split).

## 6. Writable directories

Ensure the process user can write:

| Path | Purpose |
|------|---------|
| `data/audit/` | Tenant + operator audit trails (`audit.jsonl`). **Company audit lives in the database since issue #370** — this directory only holds the tenant/operator planes and any not-yet-migrated company files. |
| `data/documents/` | Uploaded documents, one directory per company (issue #367) |

Since issue #374 these are backed up automatically by the `backup` compose
service — see below. Nothing here needs a hand-written cron.

### Automated backups (issue #374)

The `backup` service runs `scripts/backup.sh` once a day: dump **every**
database (`--all-databases`, so a newly registered company is never missed) plus
`data/documents` and `data/audit` → encrypt → upload to S3-compatible object
storage → prune past the retention window.

It **refuses to start** without `BACKUP_ENCRYPTION_KEY` and `BACKUP_S3_BUCKET`.
That is deliberate: an unencrypted backup, or one that never leaves this
machine, only looks like a backup. See `.env.docker.example` for every variable.

```bash
docker compose run --rm job-backup sh scripts/backup.sh --dry-run   # print, write nothing
docker compose run --rm job-backup bun run prove-backup-restore     # prove the newest one opens
```

> ⚠ **Losing `BACKUP_ENCRYPTION_KEY` means losing every backup, permanently.**
> Store it somewhere that is not this server. Rotating it does not re-encrypt
> old archives — keep the previous key for as long as archives it sealed are
> still inside the retention window.

**A backup that has never been restored is not a backup.** `prove-backup-restore`
checks the checksum, the passphrase, and that every registered database is
actually inside the dump — but it deliberately does **not** load anything: one
mis-aimed `mariadb <` overwrites production with old data. Loading into a shadow
server is the quarterly drill a human runs, with a target they typed themselves.

> **One-time step per installation (issue #367).** Uploaded documents used to
> land in a single shared `public/uploads/`, served as static files that pass
> through no permission guard — any signed-in user of any tenant could fetch
> another tenant's document if they knew the filename. They now live in
> `data/documents/<companyId>/` and are only reachable through
> `/api/documents/<id>/file`, which requires `document.read` and finds the row
> in the active company's database.
>
> The one-off move of pre-#367 uploads is **done** (ran 2026-08-16: 0 moved,
> 0 orphans, over a `documents` table holding 0 rows in all four companies).
> The `migrate:documents` script and the `uploads` volume were removed with it.
>
> Idempotent. Files nothing references are reported as orphans and left alone.

> **One-time step per installation (issue #370).** The company audit trail moved
> from `data/audit/<slug>/audit.jsonl` to an `audit_logs` table in each company's
> own database — so it is now covered by backups, by the self-service export, and
> by ledger destruction, and the audit page no longer reads a whole file into
> memory per page view. Migration `0044_audit_logs` creates the table; the rows
> are moved by a script. Run it **after** `db:migrate:all`:
>
> ```bash
> bun run migrate:audit            # report only
> bun run migrate:audit --apply    # actually move
> ```
>
> Reads line by line, inserts in batches of 500, idempotent through a unique
> `legacy_id`. The old file is **renamed** to `audit.jsonl.dipindahkan`, never
> deleted. Until it runs, the Audit page looks empty — the trail has not moved
> yet, it is not lost.

### Public status page (issue #374)

`/status` is public — no session, no permission guard — because the people who
need it most are the ones who cannot sign in. It reads the *same*
`healthReport()` that `/api/health` reads, then narrows it in
`src/lib/public-status.ts` to three components (bookkeeping, subscriptions &
billing, email delivery) with no database names, no heartbeat ages, and no error
strings. That narrowing is a pure function so it can be proven by test rather
than reviewed by eye: `tests/public-status.test.ts`.

Backup health is deliberately **not** on it. Backups are operator recovery
posture, not a service the reader consumes; "backups failing" published to the
anonymous internet gives a customer no decision they can act on, and gives
someone else one they can. The on-duty answer lives in `/api/health`, in
`backup_runs`, and in `docker compose logs job-backup`.

> ⚠ Fixed on 2026-09-05, same issue: `/api/health` is in `isPublicPath` (Docker
> and Traefik call it without credentials), so everything in it is world
> readable — and `backup.lastError` was passing the backup script's own message
> straight through. Production was publishing *"BACKUP_S3_BUCKET belum diset —
> cadangan yang tinggal di mesin yang sama bukan cadangan"* to anyone who asked.
> The field is now stripped; `backup.status` stays, because removing that would
> restore exactly the silence issue #374 exists to end.

To announce a maintenance window, set both halves in `.env` and restart `app-customer`:

```bash
MAINTENANCE_FROM=2026-09-14T22:00:00+07:00
MAINTENANCE_UNTIL=2026-09-15T01:00:00+07:00
```

Both are required — half a window is not a window, and the page stays silent
rather than guessing the other end. A window that has passed disappears on its
own, so a notice nobody remembered to remove does not sit there for weeks.
There is no free-text field on purpose: the app speaks three languages, and a
sentence typed into an environment variable is only correct in the one that
typed it. The sentence comes from the dictionary; only the dates come from here.

## 7. Post-deploy checklist

- [ ] `AUTH_SECRET` is unique and not in git
- [ ] `AUTH_URL` matches live HTTPS URL
- [ ] MySQL not exposed to the internet
- [ ] Demo seed was **not** run
- [ ] Admin password is strong (not `admin123`)
- [ ] Login works over HTTPS
- [ ] PTG user cannot open `/finance` (redirects to dashboard)
- [ ] File upload works (test a small PDF)
- [ ] Audit log appears in Settings (manager account)

## ⚠ One-time: the service rename + operator split

The compose services were renamed and the app was split into two containers.
**The first deploy after this change needs one extra flag, and one check.**

| Old service | Old container | New service | New container |
|---|---|---|---|
| `web` | `sai-web` | **`app-customer`** | `sai-app-customer` |
| — | — | **`app-operator`** (new) | `sai-app-operator` |
| `scheduler` | `sai-scheduler` | **`job-scheduler`** | `sai-job-scheduler` |
| `conformance` | `sai-conformance` | **`job-conformance`** | `sai-job-conformance` |
| `backup` | `sai-backup` | **`job-backup`** | `sai-job-backup` |
| `migrate` | *(unnamed)* | `migrate` | `sai-migrate` |
| `db` | `sai-db` | `db` | `sai-db` *(unchanged)* |

**Volumes are deliberately unchanged** — `db_data`, `documents`, `audit`. Renaming
a volume would orphan the data behind it, so none were touched. Verify before and
after:

```bash
docker volume ls | grep sai-accounting   # expect db_data, documents, audit
```

**The renamed services leave the old containers behind as orphans.** Compose
tracks containers by service name, so `sai-web`, `sai-scheduler`,
`sai-conformance` and `sai-backup` are no longer claimed by any service — and an
orphaned `sai-web` keeps running and keeps answering Traefik. Remove them in the
same command:

```bash
git pull
docker compose pull app-customer app-operator migrate job-scheduler job-conformance job-backup
docker compose run --rm migrate bun run db:migrate   # ONLY if there are new migrations
docker compose up -d --remove-orphans                # ← --remove-orphans is REQUIRED here, once
```

Then confirm both planes answer, and that the split actually holds:

```bash
docker compose ps                        # expect sai-app-customer AND sai-app-operator
docker ps -a | grep -E 'sai-web|sai-scheduler|sai-conformance|sai-backup'   # expect EMPTY

# customer host serves the app, and 404s the console
curl -sS -o /dev/null -w '%{http_code}\n' https://$APP_DOMAIN/
curl -sS -o /dev/null -w '%{http_code}\n' https://$APP_DOMAIN/operator        # expect 404

# operator host serves the console, and 404s customer routes
curl -sS -o /dev/null -w '%{http_code}\n' https://$OPERATOR_DOMAIN/operator/login
curl -sS -o /dev/null -w '%{http_code}\n' https://$OPERATOR_DOMAIN/login       # expect 404
```

The last two lines are the ones worth running: they prove the host-plane
separation survived the split rather than assuming it did.

**Memory.** The second app container adds roughly the footprint of the first
(measured 57.6 MiB for `sai-web` on 2026-10-11, against ~600-720 MB available).
Check headroom before the swap: `free -m`.

**Rollback.** Re-pin the tag on both app containers:

```bash
SAI_TAG=sha-<previous> docker compose up -d --no-deps app-customer app-operator
```

## Updates (new release)

Images are built by GitHub Actions (`.github/workflows/publish-image.yml`) on
every push to `main` and pushed to GHCR. **Do not build on the production
server.** That box has 3.6 GB of RAM and also serves four other apps; building
0.6.0 there took ~19 minutes at 58-92% iowait, because the compiler was being
paged through swap rather than because compiling is slow. Two concurrent builds
have produced an OOM (exit 137) before now.

```bash
git pull                                  # compose file + migrations only
docker compose pull app-customer app-operator migrate job-scheduler job-conformance
docker compose run --rm migrate bun run db:migrate   # ONLY if there are new migrations
docker compose up -d --no-deps app-customer app-operator job-scheduler job-conformance
```

> ### Why "never build on the server" is a measurement, not a preference
>
> Folded in from the former `DOCKER.md` so it is not lost with that file.
>
> On this host a full in-place rebuild **starved the container that was still
> serving**: roughly **half the health probes came back 503 or timed out**, with
> free memory down to **~41 MB**. Traefik pulls a container that fails its probe
> out of rotation, so users saw 503s for several minutes.
>
> Building first and swapping later turns a long hard outage into a short one
> plus a degraded window — it does **not** make deploys invisible. The actual
> fix is headroom, and that is what the registry flow buys: **build on CI, pull
> here**, so production only ever experiences the swap.

**Order matters when a release carries migrations:** pull, then migrate, then
swap. A single `docker compose up --build -d` is wrong — it swaps the container
before migrations run, so the new code briefly meets the old schema.

Check whether a release has migrations before deciding:

```bash
git diff --name-only <previous-main-sha>..HEAD -- prisma/
```

### Rollback

Every push tags `sha-<short>` and the version number alongside `latest`, so each
release keeps its own anchor. No pre-build tagging ritual is needed any more.

```bash
SAI_TAG=sha-573d9cf docker compose up -d --no-deps app-customer app-operator
```

`SAI_IMAGE` overrides the registry prefix, which also makes the legacy local
images reachable - the suffixes match the old naming exactly:

```bash
SAI_IMAGE=sai-luckyhands SAI_TAG=rollback-12ddc59 docker compose up -d --no-deps app-customer app-operator
```

Put both in `.env` to make a pin survive across commands.

### One-time: package visibility

GHCR packages are created **private** even for a public repo. Either make the
three packages public once (GitHub -> Packages -> each package -> Package
settings -> Change visibility), or authenticate the server:

```bash
echo <read:packages-PAT> | docker login ghcr.io -u <user> --password-stdin
```

Until that is done, `docker compose pull` answers `denied`.

### Legacy: PM2 (removed 12 Oct 2026)

The pre-Docker flow was `git pull && bun install && bunx prisma migrate deploy
&& bun run build && pm2 restart` — it built on the server, so it is exactly what
[§Updates](#updates-new-release) replaced. Production has run on Docker Compose
since the multi-company release, and on **registry images** since 4 Oct 2026.
The PM2 config files are gone; this note stays so the flow is recognisable if it
turns up in an old runbook or shell history.

## Development vs production

| Task | Development | Production |
|------|-------------|------------|
| Setup | `bun run setup` | `docker compose up -d` (§Updates) |
| Demo data | `ALLOW_SEED=true bun run db:seed` | **Never** |
| First user | Seed or create-admin | `bun run create-admin` only |
| Start | `bun run dev` | `docker compose up -d` (§Updates) |

## Troubleshooting

**500 on `/api/auth/session`** — Almost always missing env vars on the server (not in the build). In the **same folder as `server.js`**, create `.env` with at least:

```env
DATABASE_URL="mysql://..."
AUTH_SECRET="your-secret-from-openssl-rand-base64-32"
AUTH_URL="https://inventory.suburanugerahindonesia.com"
NODE_ENV=production
```

Then restart the app. Verify with:

```bash
cd /path/to/your/app
node --env-file=.env scripts/check-env.mjs
node --env-file=.env server.js
```

Check the container logs for `[auth][error]` — `MissingSecret` means `AUTH_SECRET` never reached the container (`docker compose exec app-customer printenv AUTH_SECRET`), `UntrustedHost` means `AUTH_URL` does not match the host the browser used.

**Redirect loop after login** — `AUTH_URL` must exactly match the URL in the browser (scheme + host).

**401 on API** — Session cookie requires HTTPS in production if `AUTH_URL` is https.

**Audit log empty** — Since #370 the company audit trail is the `audit_logs`
table, not a file: check that migration `0044_audit_logs` was applied to that
company's database, and that `bun run migrate:audit --apply` has run.

**Upload fails** — Check the `documents` volume's permissions, and Traefik's body-size limit (`traefik.http.middlewares.*.buffering.maxRequestBodyBytes`) if the file is large.

### Reading the logs (issue #374)

Every deliberate error-swallow now emits one JSON line, so the logs can be
aggregated without a dashboard:

```bash
# what is failing, and how often
docker compose logs app-customer | grep '"level":"error"' | jq -r .event | sort | uniq -c | sort -rn

# everything about one event
docker compose logs app-customer | grep '"event":"register.verification_mail_failed"' | jq .
```

Set `PLATFORM_ALERT_EMAIL` and those same errors also knock on the door —
throttled to **one email per error kind per hour**, because an alert flood is as
useless as no alerts and more dangerous, since it feels like having them.

Keys whose name suggests a secret (`password`, `token`, `*_KEY`, …) are redacted
before the line is written, regardless of how the caller spelled them.

**A document 404s** — The row exists but the file does not. `resolveDocumentPath`
returns `null` for anything that is not a `<companyId>/<uuid>.<ext>` storage key,
and `null` means 404 rather than a guess: an odd `filepath` is a broken row, not
an invitation to go looking.
