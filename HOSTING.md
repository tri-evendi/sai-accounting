# Simple server hosting (recommended)

Use this when you have a **VPS or shared hosting with SSH** (cPanel, CyberPanel, etc.).  
You deploy the **full project on the server** and run `next start` — no standalone zip, no `node --env-file`.

Works with **Node.js 18 or 20+**.

> **Cannot install Node on the server?** See **[HOSTING-NO-NODE.md](./HOSTING-NO-NODE.md)** — build on your Mac or GitHub Actions, run on Node elsewhere (Railway, cPanel Node app, etc.).

---

## One-time setup on the server

```bash
# 1. Upload or clone the project
cd /var/www
git clone <your-repo-url> sai-luckyhands
cd sai-luckyhands

# 2. Create environment file
cp .env.example .env
nano .env
```

Put this in `.env` (edit values):

```env
NODE_ENV=production
DATABASE_URL="mysql://USER:PASS@localhost:3306/DB_NAME"
AUTH_SECRET="output-of-openssl-rand-base64-32"
AUTH_URL="https://inventory.suburanugerahindonesia.com"
AUTH_TRUST_HOST=true
PORT=3000
TZ="Asia/Jakarta"
```

```bash
# 3. Install, migrate, build
npm run setup:prod

# 4. Create admin user
npm run create-admin -- --username admin --password 'YourSecurePassword12!'

# 5. Start (pick one)

# Option A — foreground (test)
npm run start:prod

# Option B — PM2 (keeps running after logout)
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Point **nginx** (or Apache proxy) to `http://127.0.0.1:3000`. See `PRODUCTION.md` for the nginx block.

---

## Updates (new version)

On the server, in the project folder:

```bash
git pull
npm run deploy
```

That runs install → migrate → build → PM2 restart (if PM2 is already set up).

---

## vs standalone bundle

| | **Simple hosting (this doc)** | Standalone zip |
|--|------------------------------|----------------|
| Upload | Git or full folder | `dist/sai-standalone/` only |
| Node | 18+ on server | 18+ on server |
| Build | On server (`npm run build`) | On your Mac, then upload |
| Start | `npm run start:prod` | `bash scripts/start-production.sh` |
| Best for | VPS, SSH, cPanel Node app | Minimal disk / no git on server |

For your domain, **simple hosting is usually easier** — one `.env` in the project root and `npm run start:prod`.

---

## Checklist if login/session fails

1. `.env` exists in the **same folder** as `package.json`
2. `AUTH_URL` = exact browser URL (https, no trailing `/`)
3. `AUTH_SECRET` is set (not empty)
4. `NODE_ENV=production` in `.env`
5. Restart after editing `.env`: `pm2 restart sai-management` or `npm run start:prod`
6. Test: `npm run check:env` → should print `Environment check OK`

---

## Node version

```bash
node -v   # should be v18.x or v20.x
```

If older than 18, install Node 20 LTS (nvm or your panel’s Node selector).
