# Production deployment — SAI Accounting

> ## Deploying a new release: see [§Updates](#updates-new-release).
>
> That is the only deployment path. Images are built by GitHub Actions and the
> server runs `docker compose pull` + `up -d`. **Never build on the server**
> (see `AGENTS.md`).
>
> | I want to… | Go to |
> |---|---|
> | Ship a new release | [§Updates](#updates-new-release) |
> | Roll back | [§Rollback](#rollback) |
> | Set up backups | [§Automated backups](#automated-backups-issue-374) |
> | Read the logs | [§Reading the logs](#reading-the-logs-issue-374) |
> | Install on a brand-new box | §1 → §2 → §3 → §Updates |
> | Move a SaaS tenant to on-premise | [`docs/ONPREM-PINDAH-DARI-SAAS.md`](docs/ONPREM-PINDAH-DARI-SAAS.md) (Indonesian) |
> | Record an on-premise licence | operator console `/licences` — [`docs/ONPREM-SERAH-TERIMA.md`](docs/ONPREM-SERAH-TERIMA.md) §1 |

## Prerequisites

- Docker Engine + Docker Compose v2
- An existing Traefik instance on the external `traefik_default` network
  with a `le` cert resolver — routing is configured entirely by the labels in
  `docker-compose.yml` (routers `sai-app`, `sai-www`, `sai-ops`). Two label
  rules must stay as they are: the customer and operator routers need distinct
  Traefik service names (`sai-app` vs `sai-ops`), otherwise Traefik
  load-balances between them; and `app-customer` must keep `OPERATOR_HOST: ""`
- Two hostnames pointed at the server: the app (`APP_DOMAIN`) and the operator
  console (`OPERATOR_DOMAIN`, e.g. `ops.saiaccounting.id`)
- Read access to the GHCR images ([§Package visibility](#one-time-package-visibility))

PostgreSQL 17 and PgBouncer come from the compose file itself (services `pg`
and `pgbouncer`, private network). Node and Bun are not needed on the
server — they live inside the images. MariaDB (service `db`) was retired in
issue #636 on 22 Oct 2026 — see [§MariaDB retired](#mariadb-retired-issue-636-22-oct-2026).

## 1. Configure environment

`.env` lives next to `docker-compose.yml`; Compose reads it for interpolation.
It is **not** injected wholesale (no `env_file` since Oct 2026): every service
receives only the variables named in its `environment:` allowlist in
`docker-compose.yml` (shared groups under `x-env`), so the public
`app-customer` never holds the console session secret, the backup key or the
S3 credentials. A variable you add to `.env` therefore reaches **nothing**
until its name is added to the service(s) that read it — `bun run
env:inventory` prints, from the code, which service reads which variable, and
`tests/compose-env-allowlist.test.ts` fails when code reads a variable its
service is not given. Details: [§Env allowlist](#env-allowlist-non-root-containers-least-privilege-roles-oct-2026).
`.env.docker.example` is the template (PostgreSQL since #636); the table below
is the reference for production values. `mysql://` URLs are rejected at start-up with a message
naming #636. `DB_USER`, `DB_PASSWORD` and `DB_ROOT_PASSWORD` (MariaDB) are no
longer read by anything and can be deleted from `.env`; `DB_NAME` stays — it
names the first company database.

| Variable | Production value |
|----------|------------------|
| `PG_USER`, `PG_PASSWORD` | Bootstrap **superuser** of the `pg` service. After the least-privilege cutover only `pg`, `pgbouncer` (password lookup) and the `job-backup` toolbox use it; until then it is also the fallback for the three role pairs below |
| `PG_OWNER_USER`, `PG_OWNER_PASSWORD` | Owner role (`sai_owner`, NOSUPERUSER CREATEDB): `migrate` and company provisioning. Written by `python3 scripts/postgres-roles.py apply` — [§Least-privilege](#least-privilege-postgresql-roles--cutover) |
| `PG_APP_USER`, `PG_APP_PASSWORD` | Application role (`sai_app`, DML only): every app/worker URL, and the `svc-worker` lane fence (`CONTROL_DATABASE_DIRECT_URL`) |
| `PG_BACKUP_USER`, `PG_BACKUP_PASSWORD` | Backup role (`sai_backup` = `sai_app` + `pg_read_all_data`): the `svc-integrator` `tenant` lane (`CONTROL_DATABASE_DIRECT_URL`) |
| `PROVISION_DATABASE_URL` | `postgres://<owner>:…@pgbouncer:5432/sai_control` — credentials `/companies/new` creates databases with. Set by `postgres-roles.py switch-urls`; unset = `CONTROL_DATABASE_URL` (correct only while that is still the superuser) |
| `DATABASE_URL` | `postgres://<user>:<pass>@pgbouncer:5432/sai_production` — company-book template (the database name is swapped per company) |
| `CONTROL_DATABASE_URL` | `postgres://…@pgbouncer:5432/sai_control` — users, companies, memberships, tenants |
| `PLATFORM_DATABASE_URL` | `postgres://…@pgbouncer:5432/sai_platform` — plans, subscriptions, invoices, operator audit |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<APP_DOMAIN>` (HTTPS, no trailing slash) |
| `APP_DOMAIN` | Customer hostname (Traefik rule) |
| `OPERATOR_DOMAIN` | Console hostname (Traefik rule for `sai-ops`) |
| `OPERATOR_HOST` | Same hostname as `OPERATOR_DOMAIN`. Without it the console answers 404 everywhere (fail-closed); `app-customer` deliberately receives it empty |
| `OPERATOR_SESSION_SECRET`, `SETTINGS_ENCRYPTION_KEY` | Random secrets for console sessions and encrypted mail settings |
| `OPERATOR_USERS` | Emergency `owner` account(s) for the console — see [§3](#3-create-the-first-accounts) |
| `BACKUP_ENCRYPTION_KEY` | Required by `svc-integrator` (its `tenant` lane) — see [§Automated backups](#automated-backups-issue-374-per-database-since-stage-1b) |
| `COMPANY_MIGRATE_CONCURRENCY` | How many company databases migrate at once (default 2, ceiling 8). Each worker is a Prisma CLI process plus a PostgreSQL backend, and migrations run while the apps are still serving — a large number here is a self-scheduled OOM on the release step that must not half-fail |
| `CONFORMANCE_CONCURRENCY` | How many books the conformance sweep scans at once (default **3**, ceiling 8). Deliberately *not* the same as the migrate default: this sweep spawns no child process and only reads, so what bounds it is `db-postgres`, not memory — eleven checks per book are eleven table scans on the same server that serves the apps. A conformance sweep that slows down someone posting entries is a sweep that eventually gets switched off |
| `NODE_ENV` | `production` (set in the image) |

**Never set `ALLOW_SEED=true` in production.**

## 2. First start

```bash
docker compose pull
docker compose up -d pg pgbouncer
docker compose run --rm migrate bun run db:migrate:all
docker compose up -d --remove-orphans app-customer app-operator svc-worker svc-integrator
```

`db:migrate:all` applies `prisma/postgresql/control/`, then `platform/`, then
`company/` to every registered company. Uploaded documents and the archived
audit files are named volumes (§4), so there are no directories to create by
hand.

Do not run `bun run db:seed` on production.

## 3. Create the first accounts

On an empty installation `scripts/bootstrap.ts` runs the whole sequence (tenant
→ company → first admin → plan seed → operator credential); passwords are asked
at a hidden prompt, never passed as arguments:

```bash
docker compose run --rm migrate bun run bootstrap -- \
  --tenant-slug <slug> --tenant-name "…" --company-slug <slug> --company-name "…" \
  --admin-username <user> --admin-email <email> --admin-name "…" --operator-name <name>
```

To add one person to an existing company instead (run again with another
`--company` to add a membership):

```bash
docker compose run --rm migrate bun run create-admin -- \
  --username <user> --password '<pass>' --email <email> --company <slug> [--name "…"]
```

- The account is created with `must_change_password = false`, and with a
  full-access role (`managing_director` by default).
- Add further users from **Settings → Users** (a full-access role, or whoever
  the effective permission matrix allows — `docs/RBAC.md`).

**First operator (console) account.** `scripts/operator-credential.ts <name>`
asks for a password (≥ 12 chars) and prints an `OPERATOR_USERS="name:hash:totp"`
entry plus an `otpauth://` URI. It writes nothing — `bootstrap` runs it for you
when `--operator-name` is given; standalone it is
`docker compose run --rm migrate bun run tsx scripts/operator-credential.ts <name>`.
Scan the URI into an authenticator first (MFA is mandatory; an entry
without a TOTP secret is rejected), put the line in `.env`, then recreate the
console: `docker compose up -d --force-recreate --no-deps app-operator`
(the environment is read at container creation, not on restart). That env account
is the emergency `owner`; further operators are managed from the console at
`/accounts`.

`OPERATOR_USERS` reaches **only** `app-operator`. To print a current TOTP code
with `bun run operator-code <name>` (locked-out operator), hand it to that one
run from the shell — through the environment, never as an argument:

```bash
set -a; . ./.env; set +a
docker compose run --rm -e OPERATOR_USERS migrate bun run operator-code <name>
```

## 4. Persistent data

| Volume | Mounted at | Purpose |
|--------|------------|---------|
| `pg_data` | `pg:/var/lib/postgresql/data` | Every database (control, platform, one per company) |
| `documents` | `/app/data/documents` | Uploaded documents, one directory per company (issue #367), served only through `/api/documents/<id>/file` |
| `audit` | `/app/data/audit` | Archive only: the old `audit.jsonl` files, renamed `.dipindahkan` after their move. The live trails are tables — `audit_logs` (each company DB), `tenant_audit_logs` (control), `operator_audit_logs` (platform) |
| `cadangan` | `svc-integrator:/app/data/cadangan` | Encrypted local backup artifacts — one directory per run since stage 1b |
| `hasil` | `svc-worker` (its `interactive` role) + `svc-integrator`:`/app/data/hasil` (RW, files chowned to `node` — `contract/kinds.yaml` → `results`), `app-customer` (RO) | Job results since stage 1c: `<kind>-<jobId>/<file>`. **Not backed up** — regenerated from the book, and pruned together with its `jobs` row after `DONE_RETENTION_DAYS`. Outside `public/`: the only way out is a permission-checked route |
| `db_data` (`sai-accounting_db_data`) | — | **No longer declared** (#636). The frozen MariaDB data stays on disk until deleted by hand — [§MariaDB retired](#mariadb-retired-issue-636-22-oct-2026) |

### Automated backups (issue #374; per-database since stage 1b)

**One object per database, not one archive.** The Go `tenant` lane inside
`svc-integrator` drains `tenant.backup` from the queue and writes, into a single run
directory `sai-<stamp>/`:

| Object | What it is |
|---|---|
| `db-<name>.dump.enc` | one `pg_dump -Fc` per database — control, platform, and every company book |
| `globals.sql.enc` | `pg_dumpall --globals-only`: roles and grants. Restoring the dumps **without** this gives you complete data that nobody can log into |
| `berkas.tar.gz.enc` | `data/documents` + `data/audit` (issues #367/#370) |
| `<object>.sha256` | fingerprint over the **ciphertext**, for every object |
| `manifest.json` | the only object readable **without** the key: database names, roles, `companyId`, sizes, fingerprints, server version |
| `instans/<key>/db-<name>.dump.enc`, `instans/<key>/globals.sql.enc` | only when a company book lives on an extra `db-postgres` instance (stage 4, `db_instances`): dumps and roles taken **from that instance's server** |

Without extra instances, object names and the manifest are byte-for-byte what
they were before stage 4, so every command below still applies unchanged. With
them, each such object carries `"instans": "<key>"` in the manifest, and
`companyId` is set only on the object from the instance the company is
registered on (a same-named leftover copy on another server is `other`).
`svc-integrator` reads each instance's URL from the env var named in its
`db_instances` row, so `COMPANY_<KEY>_DATABASE_URL_TEMPLATE` must be in `.env`
(reaching every service via `env_file`), pointing **directly** at PostgreSQL.
See [docs/MULTI-COMPANY.md §6](docs/MULTI-COMPANY.md#cadangan-per-instans-svc-integrator).

This is what closes on-premise gap #5. `pg_dumpall` meant one tenant could not
be restored without touching the others — and "restore just our data to
Tuesday" is an ordinary request on a paid plan. `-Fc` also allows partial
restores (`pg_restore --table=...`), which a text dump never does.

The manifest is an object and not only a `backup_runs` row on purpose: on the
day you restore, the control database may be exactly what you lost.

**Schedule.** The `scheduler` role of `svc-worker` publishes `tenant.backup` once a day via
`backup:publish` (UTC day-grained dedupe key — the first round of the day
publishes, the other 23 hit the unique constraint and do nothing). So the hour a
backup runs follows the hour `svc-worker` came up, not a cron entry; the same
was true of the old `sleep 86400` loop.

**Four conditions that fail the run before a single object is sent**: a
registered database missing from the server, a `pg_dump` older than the server,
an empty `BACKUP_ENCRYPTION_KEY`, and any single dump failing. The manifest is
written **last**, so a manifest that exists means every object it lists was
sent.

One deliberate exception: an **extra instance** that cannot be reached (env var
unset, wrong name, server down, server newer than `pg_dump`) does not stop the
other instances. The run still sends their objects, writes a manifest with
`instansGagal: [{kunci, sebab, basis}]`, records `error` in `backup_runs`, and
**skips pruning**. `prove-backup-restore` rejects such a run. Use the previous
complete run for the companies listed there.

Without `BACKUP_S3_BUCKET` (the state today) it dumps, encrypts, and writes to
the `cadangan` volume instead, and records the run as `local`, not `ok`.
`/api/health` therefore answers `backup.status: "local_only"` and `watch:health`
keeps emailing until a bucket is set. A local copy restores a mistaken `DROP
TABLE`, a bad migration or a deleted file; it does nothing for fire, a dead disk
or a lost account — which is why the status is not `ok`.

> ⚠ **`job-backup` no longer backs anything up.** It is now a *toolbox*
> container (compose profile `perkakas`, so `up -d` does not start it), and it
> stays because its image is the only one carrying the Prisma clients, `openssl`,
> `awscli` **and** `postgresql-client-17` together. (Its MariaDB client was
> removed in #636.) Leaving its daily loop running
> alongside `svc-integrator` would be two executors for one job.

```bash
docker compose logs svc-integrator --tail 60 | grep '\[tenant\]'   # what the lane did
docker compose run --rm job-backup bun run prove-backup-restore     # prove the newest run opens
docker compose run --rm job-backup sh scripts/backup.sh --dry-run   # the OLD path, by hand only
docker compose exec svc-worker bun run watch:health --dry-run      # what the alert would say
docker compose run --rm job-backup ls -lh /app/data/cadangan        # local artifacts, if any
```

> **`svc-integrator` runs as root, and that is pending, not settled.** It is the
> one container holding `BACKUP_ENCRYPTION_KEY` (and, since 22 Oct 2026, it also
> parses user report parameters in the same process), so it is the one that most
> deserves a non-root user — but the `cadangan` volume already exists on this machine,
> created root, and Docker does not apply image ownership to an existing named
> volume. To move it: `chown -R` that volume to the uid you pick, then set
> `USER` in the `integrator` stage. That is a deployment step, which is why it
> is written here and not left as a code comment.

**Who notices when it breaks.** The `scheduler` role of `svc-worker` runs `watch:health` hourly; it
reads the state (not the event) and emails `PLATFORM_ALERT_EMAIL`, falling back
to `PLATFORM_CONTACT_EMAIL`, with one mail per status per 24 h. It lives in the
scheduler, not in the backup service, on purpose: the costliest failure is no
runs at all, and a watchdog inside the backup service would stop with it.

> ⚠ **Losing `BACKUP_ENCRYPTION_KEY` means losing every backup, permanently.**
> Store it somewhere that is not this server. Rotating it does not re-encrypt
> old archives — keep the previous key for as long as archives it sealed are
> still inside the retention window.

**Restore drills.** `prove-backup-restore` reads the manifest, then for **every
object**: checks it exists, matches its fingerprint, decrypts, and — for database
objects — proves it is a real PostgreSQL dump with `pg_restore --list` (which
reads the catalogue without loading a row anywhere). It then checks that every
registered company has an object *of its own*; "present inside one big dump" and
"has its own dump object" are two different promises, and only the second lets
you restore one tenant.

It reads **both layouts**. On cut-over day the newest artifact on disk is still
the old single archive, and a prover that only understands the new shape would
reject the only copy you have. (It no longer reads MariaDB dumps: the last one
was proven restorable by hand before #636 removed that path.)

It deliberately loads nothing, because one mis-aimed `psql -f` overwrites
production with old data. Loading into a shadow server is a quarterly drill run
by a person, with a target they typed themselves.

**Restoring one tenant** (what gap #5 was about). Decrypt its object and restore
it into a shadow database; nothing else is touched:

```bash
# 1. find the object for this company — manifest needs no key
aws s3 cp s3://$BACKUP_S3_BUCKET/cadangan/sai-<stamp>/manifest.json - | \
  jq '.objek[] | select(.peran=="company") | {basis, kunci, companyId}'

# 2. decrypt it (plain `openssl` — no tool from this repo required)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in db-<name>.dump.enc -out db-<name>.dump -pass env:BACKUP_ENCRYPTION_KEY

# 3. restore into a SHADOW database, never production
pg_restore -h <shadow-host> -U <role> -d <shadow-db> --clean --if-exists db-<name>.dump
```

For a company on an extra instance, step 1 shows `"instans": "<key>"` and a
`kunci` of `instans/<key>/db-<name>.dump.enc`. Decrypt that object instead.
Its roles are in `instans/<key>/globals.sql.enc`, not in the top-level
`globals.sql.enc`. Do not pick a `db-<name>.dump.enc` at the top level just
because the name matches: after a move, that is the old copy from the default
server.

The artifact format is deliberately plain `openssl enc`, byte-for-byte the same
as the old `backup.sh` wrote. On the day you restore, the tool you need must be
a tool that *exists* — not a Go binary living inside an image you may not be
able to pull.

### Public status page (issue #374)

`/status` is public — no session, no permission guard — because the people who
need it most are the ones who cannot sign in. It reads the *same*
`healthReport()` that `/api/health` reads, then narrows it in
`packages/core/src/public-status.ts` to three components (bookkeeping, subscriptions &
billing, email delivery) with no database names, no heartbeat ages, and no error
strings. That narrowing is a pure function so it can be proven by test rather
than reviewed by eye: `tests/public-status.test.ts`.

Backup health is deliberately not on it. Backups are operator recovery
posture, not a service the reader consumes. The on-duty answer lives in
`/api/health`, in `backup_runs`, and in `docker compose logs svc-integrator`.
`/api/health` itself is public (Docker and Traefik call it without
credentials), so it carries `backup.status` but never `backup.lastError`.

**Maintenance windows and incidents** are announced from the operator console
at `/status-notices` (platform migration 0004): the sentence comes from the
dictionary in all three languages, only the dates and phase are entered. The
older env pair still works as a fallback when the console is unavailable — set
both halves in `.env` and recreate `app-customer`:

```bash
MAINTENANCE_FROM=2026-09-14T22:00:00+07:00
MAINTENANCE_UNTIL=2026-09-15T01:00:00+07:00
```

Both are required; a window with only one end is ignored. A window that has
passed disappears on its own.

## 5. Post-deploy checklist

- [ ] `AUTH_SECRET` is unique and not in git
- [ ] `AUTH_URL` matches live HTTPS URL
- [ ] PostgreSQL / PgBouncer not exposed to the internet (private network only)
- [ ] Demo seed was not run
- [ ] Admin password is strong (not `admin123`)
- [ ] Login works over HTTPS
- [ ] A `warehouse_head` user cannot open `/t/{tenant}/{company}/finance`
- [ ] File upload works (test a small PDF)
- [ ] Audit log appears in Settings (full-access role)
- [ ] Console host serves the console and nothing else:
  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' https://$OPERATOR_DOMAIN/login     # expect 200
  curl -sS -o /dev/null -w '%{http_code}\n' https://$OPERATOR_DOMAIN/pricing   # customer route → expect 404
  ```

## Updates (new release)

Images are built by GitHub Actions (`.github/workflows/publish-image.yml`) on
every push to `main` and pushed to GHCR. Do not build on the production
server. That box (2 vCPU, 8 GB plan, ~7.4 GB visible) is shared with five other
apps (as of Oct 2026, `docs/arsitektur/02-LAYANAN-INFRA.md`; it was ~3.6 GB
when the measurements below were taken); building there took
~19 minutes at 58-92% iowait, starved the container still serving (about half
the health probes answered 503), and two concurrent builds have produced an
OOM (exit 137).

1. Wait until every `publish` job of the release commit is green (**5 images**:
   `sai-accounting`, `-operator`, `-migrator`, `-backup`, `-integrator`).

   > `-integrator` was added to the matrix on 20 Oct 2026, and it was overdue:
   > `svc-tenant` (now `svc-integrator`) had referenced that image since stage 1b
   > while nothing ever built it, so `docker compose pull svc-tenant` would have
   > failed with
   > `manifest unknown`. The count in this line is now guarded
   > (`tests/image-compose-sepadan.test.ts`) — a stale number here makes someone
   > wait for four images and then deploy with the fifth missing, which is the
   > exact failure the guard exists to prevent.
2. Pull:
   ```bash
   git pull                                  # compose file + migrations only
   docker compose pull app-customer app-operator migrate svc-worker svc-integrator
   ```
   `job-backup` (image `-backup`) is a toolbox and not part of every release.
   Pull it too on the day you run `prove-backup-restore` or move a tenant to
   on-premise (`tenant:export-onprem`, `tenant:mark-migrated-out` and
   `tenant:unfreeze` run in it), otherwise it runs an older tag:
   `docker compose pull job-backup`.
3. Only if the release brings new migrations under `prisma/postgresql/`:
   ```bash
   docker compose run --rm migrate bun run db:migrate:all
   ```
4. Swap:
   ```bash
   docker compose up -d --no-deps app-customer app-operator svc-worker svc-integrator
   ```

   > ⚠ **First release after 22 Oct 2026 ("1 image = 1 container"): add
   > `--remove-orphans`, once.** The six background services `job-scheduler`,
   > `job-conformance`, `svc-ledger`, `svc-interactive`, `svc-tenant` and
   > `svc-interactive-go` became two (`svc-worker`, `svc-integrator`). Compose
   > does not stop services that left the file: without `--remove-orphans` the
   > six old containers keep running next to the two new ones and **claim the
   > same jobs** — two schedulers publishing, two `report.export` and two
   > `report.export_go` claimers, two backup runners racing for the lane lock.
   > Nothing turns red; the duplicates only show in `jobs` and in mail sent twice.
   > That release's swap is therefore:
   > ```bash
   > docker compose up -d --no-deps --remove-orphans app-customer app-operator svc-worker svc-integrator
   > docker compose ps -a --format '{{.Name}}' | grep -E 'job-scheduler|job-conformance|svc-ledger|svc-interactive|svc-tenant' \
   >   && echo 'OLD CONTAINERS STILL PRESENT' || echo 'clean'
   > ```
   > `--remove-orphans` only removes containers of services no longer in any
   > loaded compose file; `job-backup` (profile `perkakas`) is still declared
   > and is not touched.
   >
   > Each role logs with its name as prefix:
   > `docker compose logs svc-worker | grep ' ledger *|'`. One role ending
   > ends the container (exit ≠ 0) and `restart: unless-stopped` restarts all
   > four — a rising `docker inspect -f '{{.RestartCount}}' sai-svc-worker` is
   > the signal to read the log.
5. Check that every SAI container runs an image from the same `sha-` tag /
   build date — the background services serve no page, so a stale one breaks
   nothing visible:
   ```bash
   docker inspect --format '{{.Name}} {{.Config.Image}} {{.Created}}' \
     sai-app-customer sai-app-operator sai-svc-worker sai-svc-integrator
   ```

   Since 22 Oct 2026 every image also carries a build stamp (`APP_VERSION`,
   `GIT_SHA`, `BUILD_TIME`, plus OCI labels). One line compares what each
   container *says* it runs — all four must print the same version and sha:
   ```bash
   docker inspect --format '{{.Name}} {{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
     sai-app-customer sai-app-operator sai-svc-worker sai-svc-integrator
   ```
   Both web apps report it on `/api/health` as well (`.version` and
   `.build = {version, sha, builtAt}`):
   `docker compose exec app-customer node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(j.build))"`.
   The operator console's **Scheduler → Service versions** panel shows the
   same comparison from the running processes' own traces (claims in `jobs`,
   `runtime_samples`, run trails), and marks any service whose build differs
   from the console's as *Tertinggal* (behind). A row still *Tertinggal* a few
   minutes after the swap is a container that did not get the new image.

**Order matters when a release carries migrations:** pull, then migrate, then
swap. A single `docker compose up --build -d` is wrong: it swaps the container
before migrations run, so the new code briefly meets the old schema.

Check whether a release has migrations before deciding:

```bash
git diff --name-only <previous-main-sha>..HEAD -- prisma/postgresql/
```

### Rollback

Every push tags `sha-<short>` and the version number alongside `latest`, so each
release keeps its own anchor. Both app containers are pinned through the same
`SAI_TAG`:

```bash
SAI_TAG=sha-<previous> docker compose up -d --no-deps app-customer app-operator
```

`SAI_IMAGE` overrides the registry prefix. Put either in `.env` to make a pin
survive across commands.

> ⚠ **A rollback must not cross two boundaries.** Tags from before the
> PostgreSQL switch (15 Oct 2026) speak MariaDB and cannot read the current
> data. Tags from the switch up to `sha-c9b5d9c` (v0.12.0) still *carry* the
> MariaDB path but run on PostgreSQL like later ones; rolling back to them
> does not need `db` back. Tags from before the console split (18 Oct 2026) have no `-operator`
> image, so they also need the `docker-compose.yml` of that time — and a schema
> migrated forward is not rolled back by re-pinning an image.
>
> Rolling the **background services** back across 22 Oct 2026 ("1 image = 1
> container") is a third boundary: older `-migrator` images do not contain
> `scripts/run-workers.ts`, so `svc-worker` cannot start on them. Restore the
> `docker-compose.yml` of that time (six background services) and run
> `up -d --remove-orphans`. Rolling back `app-customer`/`app-operator` alone, as
> above, is not affected.

### Env allowlist, non-root containers, least-privilege roles (Oct 2026)

Three hardening changes ship together; the first two take effect with the
normal release steps above, the third is a separate, staged cutover
([§Least-privilege](#least-privilege-postgresql-roles--cutover)) that this
release only *prepares* (every new variable falls back to today's value).

| Change | What it closes | Guard |
|---|---|---|
| **Env allowlist** — no `env_file: .env`; each service lists what it reads | An RCE in the public `app-customer` read `OPERATOR_SESSION_SECRET` (forge console sessions), `BACKUP_ENCRYPTION_KEY` + S3 keys (decrypt/delete every backup) and the PostgreSQL superuser password | `tests/compose-env-allowlist.test.ts` (deny-list + "every variable the code reads is provided", built from the import graph — `bun run env:inventory`) |
| **Non-root** — `svc-worker`, `migrate`, `job-backup` run as `node` (1000), `svc-integrator` as 1000:1000 | Root in the two long-running background containers, one of which holds the backup key and parses user report parameters | `tests/containers-non-root.test.ts` |
| **Role split prepared** — `migrate` → owner role, fences → app/backup roles, provisioning grants the app role | The app talking to PostgreSQL as superuser (`COPY … TO PROGRAM`, `pg_authid`) | `tests/postgres-least-privilege.test.ts` |

`pg` itself is unchanged and already non-root where it matters: the official
image's `docker-entrypoint.sh` starts as root only to `chown` the data
directory, then `exec gosu postgres …` — the server processes run as
`postgres` (uid 70). `docker top sai-pg` shows it.

**Before pulling (once):**

1. Additional database instances (stage 4). Their URL variable has a dynamic
   name, and it now reaches services only through the `x-env.db-instances`
   group in `docker-compose.yml`:
   ```bash
   grep -oE '^COMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE' .env
   ```
   Must print nothing (true as of 22 Oct 2026). Every name it prints must be
   added — valueless — under `x-env.db-instances` in a commit **before** this
   release, or the books on that instance stop opening.
2. Variables that live only in `.env` and are no longer delivered anywhere:
   ```bash
   for k in $(grep -oE '^[A-Z_][A-Z0-9_]*' .env); do grep -qw "$k" docker-compose.yml || echo "$k"; done
   ```
   Expected: `DB_USER DB_PASSWORD DB_ROOT_PASSWORD` (MariaDB, obsolete),
   `NEXT_PUBLIC_APP_NAME` (build-time only), `ALLOW_SEED` if present. Anything
   else: `bun run env:inventory` (on a dev box) says whether code reads it.

**After `docker compose pull`, before the swap (once) — volume ownership:**

Docker applies an image's directory ownership only to a named volume that is
*new*. `cadangan` was created by root (and `hasil` must stay 1000), so:

```bash
docker compose run --rm --no-deps --user root --entrypoint sh svc-integrator -c \
  'chown -R 1000:1000 /app/data/cadangan /app/data/hasil && ls -ldn /app/data/cadangan /app/data/hasil \
   && echo "files in documents/audit NOT owned by 1000:" && find /app/data/documents /app/data/audit ! -uid 1000 | head'
```

Both directories must show `1000 1000`. If the `find` lists files, the backup
lane (now uid 1000) cannot read them; give them to 1000 the same way through a
read-write mount, e.g.
`docker run --rm --user root -v sai-accounting_documents:/d -v sai-accounting_audit:/a --entrypoint chown ghcr.io/tri-evendi/sai-accounting-integrator:${SAI_TAG:-latest} -R 1000:1000 /d /a`.

Then the usual swap (§Updates step 4).

**Verify:**

```bash
# no console/backup secret in the public app (names only — values never printed)
docker compose exec app-customer sh -c 'env | cut -d= -f1' \
  | grep -E '^(OPERATOR_(SESSION_SECRET|USERS|MFA|IP_ALLOWLIST)|BACKUP_|AWS_|PG_[A-Z_]*PASSWORD)' && echo LEAK || echo clean
# every SAI container runs as 1000
for s in app-customer app-operator svc-worker svc-integrator; do printf '%s ' $s; docker compose exec $s id -u; done
# the background roles still write: next export lands in `hasil`, next daily run in `/api/health` → backup
docker compose logs --since 30m svc-worker svc-integrator | grep -iE 'EACCES|permission denied' || echo 'no permission errors'
```

(`PG_APP_USER` in `app-customer` is expected: a role *name*, used to grant new
books to the app role.)

**Rollback:** previous `SAI_TAG` plus the `docker-compose.yml` of the previous
release, then `up -d`. Old images run as root and read the chowned volumes
fine; nothing to undo.

### Least-privilege PostgreSQL roles — cutover

Three roles replace the superuser for everything that runs all the time:

| Role (`.env` pair) | Attributes | Used by |
|---|---|---|
| `sai_owner` (`PG_OWNER_*`) | NOSUPERUSER **CREATEDB**, owns every app database and object | `migrate`; `/companies/new` via `PROVISION_DATABASE_URL`; toolbox scripts that create books |
| `sai_app` (`PG_APP_*`) | DML only (SELECT/INSERT/UPDATE/DELETE, sequences, EXECUTE) | `app-customer`, `app-operator`, `svc-worker`, integrator `interactive` lane — through PgBouncer; the `svc-worker` fence directly |
| `sai_backup` (`PG_BACKUP_*`) | member of `sai_app` + `pg_read_all_data` | integrator `tenant` lane: `pg_dump` per book, `pg_dumpall --globals-only`, `backup_runs` |
| `sai` (`PG_USER`) | superuser (bootstrap) | `pg`, PgBouncer's password lookup, the `job-backup` toolbox (restores `globals.sql` in `prove-backup-restore`) |

New books get the grants from code (`appRoleForNewBook` +
`appRoleGrantSql`, run before the company is registered) and from the
default privileges `apply` sets, so tables created by later migrations are
readable by the app the moment they exist.

**PgBouncer needs no change.** `edoburu/pgbouncer` writes
`* = host=pg port=5432 auth_user=<PG_USER>` and a userlist with only
`PG_USER`; any other role is looked up with PgBouncer's default `auth_query`
on `pg_authid` as that user — checked in the entrypoint of
`v1.26.0-p0`. Pools are per (database, user): `sai_app` replaces `sai`, so the
server-connection count does not grow (`sai_owner` only during provisioning).

**Run on the host, in the compose directory, in this order. Every step is
idempotent; each `.env` change leaves a `.env.sebelum-<…>` backup.**

1. **Baseline.** `python3 scripts/postgres-roles.py check` — expect "peran …
   tidak ada" (roles not created yet).
2. **Roles, ownership, grants.** Low-traffic window (each book is one
   transaction with `lock_timeout = 5s`; `ALTER … OWNER` takes a short
   exclusive lock per table — a timeout aborts that book only; rerun).
   ```bash
   python3 scripts/postgres-roles.py apply
   python3 scripts/postgres-roles.py check     # must print ✓
   ```
   Databases come from the **registry** (control, platform, `DB_NAME`, every
   company on the default instance); anything else in `pg_database` is listed
   and left alone. `apply` writes `PG_OWNER_*`, `PG_APP_*`, `PG_BACKUP_*` to
   `.env` only after `check` passes. Running apps are unaffected — they still
   connect as `sai`, which bypasses ownership.
3. **Migrate as owner.** `docker compose run --rm migrate bun run db:migrate:all`
   — no pending migrations, exit 0. Proves `sai_owner` logs in and owns the schema.
4. **Background services.**
   ```bash
   docker compose up -d --no-deps svc-worker svc-integrator
   docker compose exec -T pg pg_dumpall --globals-only -U sai_backup -l postgres >/dev/null && echo globals-ok
   docker compose exec -T pg pg_dump -Fc -U sai_backup -d sai_control >/dev/null && echo dump-ok
   docker compose logs --since 5m svc-worker svc-integrator | grep -E '28P01|42501|permission denied' || echo clean
   ```
   (The two dumps use the container's local socket, so they prove the
   *privileges* of `sai_backup`; the containers starting cleanly proves the
   passwords.)
5. **Application URLs.** `python3 scripts/postgres-roles.py switch-urls` —
   rewrites `DATABASE_URL`, `CONTROL_DATABASE_URL`, `PLATFORM_DATABASE_URL`,
   `COMPANY_DATABASE_URL_TEMPLATE` to `sai_app`, adds `PROVISION_DATABASE_URL`
   (owner, same host as the control URL), recreates exactly the running
   services whose environment changed, and prints `/api/health`. Then: log in,
   open a book, post a draft, run a large export (queued), open the console.
   ```bash
   docker compose exec -T pg psql -U "$PG_USER" -d postgres -Atc \
     "SELECT usename, count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' GROUP BY 1"
   ```
   Apps show as `sai_app`; the only `sai` sessions left are PgBouncer's lookup
   and your `psql`.
6. **Provisioning** (test tenant, or the test host first): create a company at
   `/companies/new`; it must open. `python3 scripts/postgres-roles.py check`
   must stay ✓ afterwards.

**Rollback** (any step): `python3 scripts/postgres-roles.py rollback
.env.sebelum-<…>` with the backup that step wrote — it restores `.env`,
re-applies any password that differs, and recreates the changed services.
Ownership and grants need no rollback: the superuser bypasses both, so the old
URLs work against the new ownership. The roles can stay.

**Rotating a password afterwards:** `bash scripts/rotate-postgres-password.sh
<superuser|owner|app|backup>` — server first (SCRAM verifier over stdin, never
in `ps`), then `.env`, then only the running services whose environment
changed (never `pg` itself), then `https://$APP_DOMAIN/api/health`.

**Known residual risk:** `app-customer` still holds the *owner* credentials
(`PROVISION_DATABASE_URL`) because `/companies/new` creates the database
inside the request. Owner ≠ superuser (no server files, no programs, no
roles), but it can run DDL on every app database. Moving provisioning onto the
job queue would let `app-customer` hold `sai_app` only.

### MariaDB retired (issue #636, 22 Oct 2026)

Already done on the server by the main session, before the PR that removed
MariaDB from the repo:

- `sai-db` **stopped** 22 Oct 2026 08:47 UTC (not removed). Volume
  `sai-accounting_db_data` **kept**.
- Final dump `/home/vyn/backups/mariadb-terakhir-20261022-164624.sql.gz`,
  sha256 `bb2b52c1297b2f4ea242e009ff3150881f5bbbf505d3e39437e72aab2a7192b4`,
  proven restorable into a throwaway `mariadb:11` (19 databases, identical
  table counts, sample row counts equal).
- Last images that still carry the MariaDB code path: **`sha-c9b5d9c`**
  (v0.12.0), all five images. From here on the only way back to MariaDB is
  restoring that dump and deploying those images — not swapping a URL.

**First release after the PR:** the swap in step 4 **must** carry
`--remove-orphans` (it already does for the "1 image = 1 container" release).
`db` is no longer in `docker-compose.yml`, so the stopped `sai-db` container is
an orphan and `--remove-orphans` deletes it. Removing a container does **not**
remove its volume. Afterwards:

```bash
docker ps -a --format '{{.Names}}' | grep -x sai-db && echo 'sai-db STILL PRESENT' || echo 'sai-db gone'
docker volume ls --format '{{.Name}}' | grep -x sai-accounting_db_data   # still there, by design
```

**Owner steps, in this order, by hand:**

1. Copy the final dump **off this server** and check its sha256 there against
   the value above.
2. Only then: `docker volume rm sai-accounting_db_data`. There is no undo, and
   no compose command in this repo removes it for you.
3. `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` can be deleted from `.env`.

### One-time: package visibility

GHCR packages are created private even for a public repo. Either make the
five packages public once (GitHub -> Packages -> each package -> Package
settings -> Change visibility), or authenticate the server:

```bash
echo <read:packages-PAT> | docker login ghcr.io -u <user> --password-stdin
```

Until that is done, `docker compose pull` answers `denied`.

## Development vs production

| Task | Development | Production |
|------|-------------|------------|
| Setup | `bun install` + `bun run db:migrate:all` + `bun run db:generate` (README) | §1 → §3 |
| Demo data | `ALLOW_SEED=true bun run db:seed` | **Never** |
| First user | Seed or `create-admin` | `bootstrap` / `create-admin` via `migrate` |
| Start | `bun run dev` / `bun run dev:operator` | `docker compose up -d` (§Updates) |

## Troubleshooting

**500 on `/api/auth/session`** — Almost always a missing env var in the
container (not in the build). `.env` must sit in the compose directory, the
variable must be named in the service's `environment:` allowlist (a name that
is only in `.env` reaches no container), and the environment is only read when
a container is created — after editing either, use
`docker compose up -d --force-recreate --no-deps app-customer`. Check what the
container actually received:

```bash
docker compose exec app-customer printenv AUTH_SECRET AUTH_URL
```

Check the container logs for `[auth][error]` — `MissingSecret` means `AUTH_SECRET` never reached the container, `UntrustedHost` means `AUTH_URL` does not match the host the browser used.

**Redirect loop after login** — `AUTH_URL` must exactly match the URL in the browser (scheme + host).

**401 on API** — Session cookie requires HTTPS in production if `AUTH_URL` is https.

**Audit log empty** — The company audit trail is the `audit_logs` table in that
company's database (created by the company baseline migration): check that
`db:migrate:all` reached that company.

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
throttled to one email per error kind per hour, so that a burst of errors does
not become a flood of mail.

Keys whose name suggests a secret (`password`, `token`, `*_KEY`, …) are redacted
before the line is written, regardless of how the caller spelled them.

**A document 404s** — The row exists but the file does not. `resolveDocumentPath`
returns `null` for anything that is not a `<companyId>/<uuid>.<ext>` storage key,
and `null` means 404 rather than a guess: an odd `filepath` is a broken row, not
an invitation to go looking.
