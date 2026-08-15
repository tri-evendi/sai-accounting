# Production deployment — SAI Accounting

> **Easier path:** see **[HOSTING.md](./HOSTING.md)** — full project on the server, `bun run setup:prod`, `bun run start:prod` (no standalone zip).

## Prerequisites

- Node.js 20.19+ / 22.12+ / 24+ (Prisma 7 menolak yang lebih tua)
- Bun 1.2+ — `curl -fsSL https://bun.sh/install | bash` (pemasang paket & peluncur skrip; Node tetap runtime-nya)
- MySQL 8+ / MariaDB (private network, not public)
- HTTPS reverse proxy (nginx, Caddy, or cloud LB)
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
| `NODE_ENV` | `production` (set by `start:prod`) |
| `PORT` | Optional, default `3000` |

**Never set `ALLOW_SEED=true` in production.**

## 2. Install and build

```bash
bun run setup:prod
```

This runs: `bun install --frozen-lockfile` → Prisma generate → migrations → creates `data/audit`, `data/documents` & `public/uploads` → production build.

**Do not run** `bun run db:seed` on production.

## 3. Create the first admin

```bash
bun run create-admin -- --username admin --password 'YourSecurePassword12!' --name "Administrator"
```

- User is created with **status 0** (no forced password change).
- Add more users from **Settings → Users** (manager role only).

## 4. Start the server

```bash
bun run start:prod
```

This sets `NODE_ENV=production`, loads `.env`, checks required variables, then starts Next.js.

**Standalone bundle** (after `bun run package:standalone`):

```bash
cd /var/www/sai
cp .env.example .env   # edit DATABASE_URL, AUTH_SECRET, AUTH_URL
bash scripts/start-production.sh
```

Or with PM2:

```bash
mkdir -p logs
bun run build
pm2 start ecosystem.config.cjs
pm2 save
```

## 5. Reverse proxy (nginx example)

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate     /path/to/fullchain.pem;
  ssl_certificate_key /path/to/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  client_max_body_size 12M;
}
```

## 6. Writable directories

Ensure the process user can write:

| Path | Purpose |
|------|---------|
| `data/audit/` | Tenant + operator audit trails (`audit.jsonl`). **Company audit lives in the database since issue #370** — this directory only holds the tenant/operator planes and any not-yet-migrated company files. |
| `data/documents/` | Uploaded documents, one directory per company (issue #367) |
| `public/uploads/` | Legacy upload directory — only until `bun run migrate:documents --apply` has run |

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
docker compose run --rm backup sh scripts/backup.sh --dry-run   # print, write nothing
docker compose run --rm backup bun run prove-backup-restore     # prove the newest one opens
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
> Existing files still need moving. Run it alongside `db:migrate:all`:
>
> ```bash
> bun run migrate:documents            # report only
> bun run migrate:documents --apply    # actually move
> ```
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

## Updates (new release)

```bash
git pull
bun install --frozen-lockfile
bunx prisma migrate deploy
NODE_ENV=production bun run build
pm2 restart sai-management   # or restart your process manager
```

## Development vs production

| Task | Development | Production |
|------|-------------|------------|
| Setup | `bun run setup` | `bun run setup:prod` |
| Demo data | `ALLOW_SEED=true bun run db:seed` | **Never** |
| First user | Seed or create-admin | `bun run create-admin` only |
| Start | `bun run dev` | `bun run start:prod` |

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

If you use PM2 without `--env-file`, export variables in `ecosystem.config.cjs` or use `env_file`. Check server logs for `[auth][error]` — `MissingSecret` or `UntrustedHost`.

**Redirect loop after login** — `AUTH_URL` must exactly match the URL in the browser (scheme + host).

**401 on API** — Session cookie requires HTTPS in production if `AUTH_URL` is https.

**Audit log empty** — Since #370 the company audit trail is the `audit_logs`
table, not a file: check that migration `0044_audit_logs` was applied to that
company's database, and that `bun run migrate:audit --apply` has run.

**Upload fails** — Check `data/documents/` permissions and `client_max_body_size` in nginx.

### Reading the logs (issue #374)

Every deliberate error-swallow now emits one JSON line, so the logs can be
aggregated without a dashboard:

```bash
# what is failing, and how often
docker compose logs web | grep '"level":"error"' | jq -r .event | sort | uniq -c | sort -rn

# everything about one event
docker compose logs web | grep '"event":"register.verification_mail_failed"' | jq .
```

Set `PLATFORM_ALERT_EMAIL` and those same errors also knock on the door —
throttled to **one email per error kind per hour**, because an alert flood is as
useless as no alerts and more dangerous, since it feels like having them.

Keys whose name suggests a secret (`password`, `token`, `*_KEY`, …) are redacted
before the line is written, regardless of how the caller spelled them.

**A document 404s** — The row exists but the file does not, or `documents.filepath`
still holds the legacy `/uploads/…` form while the file has already been moved.
Run `bun run migrate:documents` (without `--apply`) — it reports both cases per company.
