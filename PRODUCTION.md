# Production deployment — SAI Management

## Prerequisites

- Node.js 20+
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
npm run setup:prod
```

This runs: `npm ci` → Prisma generate → migrations → creates `data/audit` & `public/uploads` → production build.

**Do not run** `npm run db:seed` on production.

## 3. Create the first admin

```bash
npm run create-admin -- --username admin --password 'YourSecurePassword12!' --name "Administrator"
```

- User is created with **status 0** (no forced password change).
- Add more users from **Settings → Users** (manager role only).

## 4. Start the server

```bash
npm run start:prod
```

Or with PM2:

```bash
mkdir -p logs
npm run build
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
| `data/audit/` | Security audit log (`audit.jsonl`) |
| `public/uploads/` | Contract documents |

Back up both with your server backups.

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
npm ci
npx prisma migrate deploy
NODE_ENV=production npm run build
pm2 restart sai-management   # or restart your process manager
```

## Development vs production

| Task | Development | Production |
|------|-------------|------------|
| Setup | `npm run setup` | `npm run setup:prod` |
| Demo data | `ALLOW_SEED=true npm run db:seed` | **Never** |
| First user | Seed or create-admin | `npm run create-admin` only |
| Start | `npm run dev` | `npm run start:prod` |

## Troubleshooting

**Redirect loop after login** — `AUTH_URL` must exactly match the URL in the browser (scheme + host).

**401 on API** — Session cookie requires HTTPS in production if `AUTH_URL` is https.

**Audit log empty** — Check write permissions on `data/audit/`.

**Upload fails** — Check `public/uploads/` permissions and `client_max_body_size` in nginx.
