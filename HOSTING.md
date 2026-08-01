# Simple server hosting (recommended)

Use this when you have a **VPS or shared hosting with SSH** (cPanel, CyberPanel, etc.).  
You deploy the **full project on the server** and run `next start` — no standalone zip, no `node --env-file`.

Needs **Node.js 20.19+ / 22.12+ / 24+** and **[Bun](https://bun.sh) 1.2+**.

Bun memasang paket dan meluncurkan skrip; Node tetap menjalankan build dan
aplikasinya. Keduanya harus ada di server ini. Node 18 **tidak lagi cukup** —
skrip preinstall Prisma 7 menolaknya.

```bash
curl -fsSL https://bun.sh/install | bash   # lalu buka ulang shell
```

Perhatikan urutan `PATH`: yang dipakai bun untuk skrip lifecycle adalah `node`
dari `PATH`, bukan alias/fungsi shell dari nvm. Pastikan `env node -v` (bukan
sekadar `node -v`) menunjukkan versi yang didukung.

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
bun run setup:prod

# 4. Create admin user
bun run create-admin -- --username admin --password 'YourSecurePassword12!'

# 5. Start (pick one)

# Option A — foreground (test)
bun run start:prod

# Option B — PM2 (keeps running after logout)
# PM2 sengaja dipasang dengan npm, bukan bun: ia daemon tingkat SISTEM, bukan
# dependensi proyek, dan ia menjalankan proses Node. npm ikut dengan Node yang
# memang wajib ada di server ini. `bun install -g pm2` juga bisa bila Anda lebih
# suka satu alat saja.
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
bun run deploy
```

That runs install → migrate → build → PM2 restart (if PM2 is already set up).

---

## vs standalone bundle

| | **Simple hosting (this doc)** | Standalone zip |
|--|------------------------------|----------------|
| Upload | Git or full folder | `dist/sai-standalone/` only |
| Node | 18+ on server | 18+ on server |
| Build | On server (`bun run build`) | On your Mac, then upload |
| Start | `bun run start:prod` | `bash scripts/start-production.sh` |
| Best for | VPS, SSH, cPanel Node app | Minimal disk / no git on server |

For your domain, **simple hosting is usually easier** — one `.env` in the project root and `bun run start:prod`.

---

## Checklist if login/session fails

1. `.env` exists in the **same folder** as `package.json`
2. `AUTH_URL` = exact browser URL (https, no trailing `/`)
3. `AUTH_SECRET` is set (not empty)
4. `NODE_ENV=production` in `.env`
5. Restart after editing `.env`: `pm2 restart sai-management` or `bun run start:prod`
6. Test: `bun run check:env` → should print `Environment check OK`

---

## Node version

```bash
node -v   # should be v18.x or v20.x
```

If older than 18, install Node 20 LTS (nvm or your panel’s Node selector).
