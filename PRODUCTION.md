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
server — they live inside the images. (The MariaDB service `db` is still in the
compose file as a frozen read-only fallback until issue #636; nothing writes to
it.)

## 1. Configure environment

`.env` lives next to `docker-compose.yml`; Compose reads it for interpolation
and injects it into every container via `env_file`. `.env.docker.example` is
the template, but it still shows `mysql://` URLs and lacks the PostgreSQL and
operator variables. Use the table below as the reference.

| Variable | Production value |
|----------|------------------|
| `PG_USER`, `PG_PASSWORD` | Credentials of the `pg` service (also used by `migrate`/`svc-tenant`, which connect to `pg` directly) |
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
| `BACKUP_ENCRYPTION_KEY` | Required by `svc-tenant` — see [§Automated backups](#automated-backups-issue-374-per-database-since-stage-1b) |
| `COMPANY_MIGRATE_CONCURRENCY` | How many company databases migrate at once (default 2, ceiling 8). Each worker is a Prisma CLI process plus a PostgreSQL backend, and migrations run while the apps are still serving — a large number here is a self-scheduled OOM on the release step that must not half-fail |
| `CONFORMANCE_CONCURRENCY` | How many books the conformance sweep scans at once (default **3**, ceiling 8). Deliberately *not* the same as the migrate default: this sweep spawns no child process and only reads, so what bounds it is `db-postgres`, not memory — eleven checks per book are eleven table scans on the same server that serves the apps. A conformance sweep that slows down someone posting entries is a sweep that eventually gets switched off |
| `NODE_ENV` | `production` (set in the image) |

**Never set `ALLOW_SEED=true` in production.**

## 2. First start

```bash
docker compose pull
docker compose up -d pg pgbouncer
docker compose run --rm migrate bun run db:migrate:all
docker compose up -d app-customer app-operator job-scheduler job-conformance svc-ledger svc-tenant svc-interactive
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
(`env_file` is read at container creation, not on restart). That env account
is the emergency `owner`; further operators are managed from the console at
`/accounts`.

## 4. Persistent data

| Volume | Mounted at | Purpose |
|--------|------------|---------|
| `pg_data` | `pg:/var/lib/postgresql/data` | Every database (control, platform, one per company) |
| `documents` | `/app/data/documents` | Uploaded documents, one directory per company (issue #367), served only through `/api/documents/<id>/file` |
| `audit` | `/app/data/audit` | Archive only: the old `audit.jsonl` files, renamed `.dipindahkan` after their move. The live trails are tables — `audit_logs` (each company DB), `tenant_audit_logs` (control), `operator_audit_logs` (platform) |
| `cadangan` | `svc-tenant:/app/data/cadangan` | Encrypted local backup artifacts — one directory per run since stage 1b |
| `hasil` | `svc-interactive:/app/data/hasil` (RW), `app-customer` (RO) | Job results since stage 1c: `<kind>-<jobId>/<file>`. **Not backed up** — regenerated from the book, and pruned together with its `jobs` row after `DONE_RETENTION_DAYS`. Outside `public/`: the only way out is a permission-checked route |
| `db_data` | `db` | Frozen MariaDB fallback, removed in #636 |

### Automated backups (issue #374; per-database since stage 1b)

**One object per database, not one archive.** `svc-tenant` (the Go `tenant`
lane) drains `tenant.backup` from the queue and writes, into a single run
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
`svc-tenant` reads each instance's URL from the env var named in its
`db_instances` row, so `COMPANY_<KEY>_DATABASE_URL_TEMPLATE` must be in `.env`
(reaching every service via `env_file`), pointing **directly** at PostgreSQL.
See [docs/MULTI-COMPANY.md §6](docs/MULTI-COMPANY.md#cadangan-per-instans-svc-tenant).

This is what closes on-premise gap #5. `pg_dumpall` meant one tenant could not
be restored without touching the others — and "restore just our data to
Tuesday" is an ordinary request on a paid plan. `-Fc` also allows partial
restores (`pg_restore --table=...`), which a text dump never does.

The manifest is an object and not only a `backup_runs` row on purpose: on the
day you restore, the control database may be exactly what you lost.

**Schedule.** `job-scheduler` publishes `tenant.backup` once a day via
`backup:publish` (UTC day-grained dedupe key — the first round of the day
publishes, the other 23 hit the unique constraint and do nothing). So the hour a
backup runs follows the hour `job-scheduler` came up, not a cron entry; the same
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
> `awscli` **and** the MariaDB client — the last so the restore prover can still
> read artifacts from before the engine swap. Leaving its daily loop running
> alongside `svc-tenant` would be two executors for one job.

```bash
docker compose logs svc-tenant --tail 60                            # what the lane did
docker compose run --rm job-backup bun run prove-backup-restore     # prove the newest run opens
docker compose run --rm job-backup sh scripts/backup.sh --dry-run   # the OLD path, by hand only
docker compose run --rm job-scheduler bun run watch:health --dry-run  # what the alert would say
docker compose run --rm job-backup ls -lh /app/data/cadangan        # local artifacts, if any
```

> **`svc-tenant` runs as root, and that is pending, not settled.** It is the one
> container holding `BACKUP_ENCRYPTION_KEY`, so it is the one that most deserves
> a non-root user — but the `cadangan` volume already exists on this machine,
> created root, and Docker does not apply image ownership to an existing named
> volume. To move it: `chown -R` that volume to the uid you pick, then set
> `USER` in the `integrator` stage. That is a deployment step, which is why it
> is written here and not left as a code comment.

**Who notices when it breaks.** `job-scheduler` runs `watch:health` hourly; it
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
reject the only copy you have — the same rule that already makes it accept
MariaDB dumps from before the engine swap.

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
`/api/health`, in `backup_runs`, and in `docker compose logs svc-tenant`.
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
server. That box has ~3.6 GB of RAM shared with five other apps (as of Oct
2026, `docs/arsitektur/02-LAYANAN-INFRA.md`); building there took
~19 minutes at 58-92% iowait, starved the container still serving (about half
the health probes answered 503), and two concurrent builds have produced an
OOM (exit 137).

1. Wait until every `publish` job of the release commit is green (**5 images**:
   `sai-accounting`, `-operator`, `-migrator`, `-backup`, `-integrator`).

   > `-integrator` was added to the matrix on 20 Oct 2026, and it was overdue:
   > `svc-tenant` had referenced that image since stage 1b while nothing ever
   > built it, so `docker compose pull svc-tenant` would have failed with
   > `manifest unknown`. The count in this line is now guarded
   > (`tests/image-compose-sepadan.test.ts`) — a stale number here makes someone
   > wait for four images and then deploy with the fifth missing, which is the
   > exact failure the guard exists to prevent.
2. Pull:
   ```bash
   git pull                                  # compose file + migrations only
   docker compose pull app-customer app-operator migrate job-scheduler job-conformance svc-ledger svc-tenant svc-interactive
   ```
3. Only if the release brings new migrations under `prisma/postgresql/`:
   ```bash
   docker compose run --rm migrate bun run db:migrate:all
   ```
4. Swap:
   ```bash
   docker compose up -d --no-deps app-customer app-operator job-scheduler job-conformance svc-ledger svc-tenant svc-interactive
   ```
5. Check that both app containers run images from the same `sha-` tag / build
   date:
   ```bash
   docker inspect --format '{{.Config.Image}} {{.Created}}' sai-app-customer sai-app-operator
   ```

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
> data. Tags from before the console split (18 Oct 2026) have no `-operator`
> image, so they also need the `docker-compose.yml` of that time — and a schema
> migrated forward is not rolled back by re-pinning an image.

### One-time: package visibility

GHCR packages are created private even for a public repo. Either make the
four packages public once (GitHub -> Packages -> each package -> Package
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
container (not in the build). `.env` must sit in the compose directory, and
`env_file` is only read when a container is created — after editing it, use
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
