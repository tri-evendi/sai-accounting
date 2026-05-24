# Hosting when you cannot install Node on the server

## Short answer

| Step | Need Node? | Where |
|------|------------|--------|
| **Build** (compile the app) | Yes | Your Mac, or GitHub Actions — **not** on the server |
| **Run** (serve the website) | **Yes, always** | Server, or a cloud platform |

This app uses **Next.js API routes**, **login (NextAuth)**, and **MySQL**. It is **not** a static HTML site and **cannot** run on PHP-only / plain Apache hosting.

You can **avoid installing Node on your server** only if you run the app **somewhere else** that already provides Node (see options below).

---

## Option 1 — Build on your Mac, run on a host that has Node (best if you have SSH)

On **your Mac** (you already have Node):

```bash
cd sai-luckyhands
cp .env.production .env    # production values
npm ci
npx prisma generate
NODE_ENV=production npm run build
npm run package:standalone
```

Upload the folder **`dist/sai-standalone/`** to the server (FTP / File Manager / rsync).

On the server you still need **some way to run Node**:

- cPanel → **Setup Node.js App** (many Indonesian hosts have this — you pick version 18/20, you do not compile Node yourself)
- VPS where the host pre-installed Node
- Or upload a **portable Node** binary for Linux (see Option 3)

Create **`.env`** next to `server.js` on the server, then:

```bash
bash scripts/start-production.sh
```

---

## Option 2 — No Node on your server at all: use a free/cheap Node host (recommended)

Keep **MySQL** on your current server (or hosting DB). Run the **app** on a platform that includes Node:

| Platform | You install Node? | Notes |
|----------|-------------------|--------|
| [Railway](https://railway.app) | No | Connect GitHub, add `DATABASE_URL`, deploy |
| [Render](https://render.com) | No | Free tier, similar |
| [Fly.io](https://fly.io) | No | Docker or Dockerfile |
| [Vercel](https://vercel.com) | No | Good for Next.js; need external MySQL URL |

Point your domain **`inventory.suburanugerahindonesia.com`** to that service (CNAME or reverse proxy).

Example env on Railway/Render:

```env
NODE_ENV=production
DATABASE_URL=mysql://user:pass@your-mysql-host:3306/db
AUTH_SECRET=...
AUTH_URL=https://inventory.suburanugerahindonesia.com
AUTH_TRUST_HOST=true
```

Build happens **on their servers** when you push Git — you never install Node locally on your shared host.

---

## Option 3 — Upload a portable Node binary (advanced, some shared hosts allow it)

Only if the host lets you **execute** uploaded programs (not all do).

1. On your Mac: `npm run package:standalone`
2. Download **Linux x64** Node 20 LTS from https://nodejs.org (tar.xz)
3. Upload `dist/sai-standalone/` **and** extract Node into e.g. `dist/sai-standalone/node/`
4. On server:

```bash
cd /path/to/sai-standalone
cp .env.example .env   # edit
./node/bin/node server.js
```

Use a **start** script in cron or cPanel “run script” if they have no shell.

---

## Option 4 — GitHub builds for you (no Node on server, no build on Mac each time)

Push code to GitHub. The workflow **`.github/workflows/build-standalone.yml`** builds `dist/sai-standalone` and saves it as a **downloadable zip**.

1. Push to GitHub  
2. Actions tab → latest run → **Artifacts** → download `sai-standalone.zip`  
3. Upload zip to server  
4. You still need Option 1 (Node on server) or Option 2 (external host) to **run** it

---

## What does NOT work

- **PHP / WordPress / static HTML only** hosting → this project will not run there without a full rewrite  
- **Only uploading `.next` or `public`** without `server.js` and `node_modules` from standalone  
- **Building on the server** without Node → impossible; build elsewhere  

---

## Server runs out of memory?

See **[HOSTING-LOW-MEMORY.md](./HOSTING-LOW-MEMORY.md)** — build on Mac, upload standalone only, use `start-low-memory.sh`. If the plan is under ~256 MB RAM, use Railway/Render instead.

---

## Practical recommendation for your case

1. Ask your host: **“Apakah ada Setup Node.js App atau SSH?”**  
   - If **yes** → use [HOSTING.md](./HOSTING.md) or build on Mac + upload standalone.  
   - If **no**, only PHP/static → use **Railway or Render** (Option 2) and keep MySQL where it is (remote `DATABASE_URL`).

2. **Do not** use `npm run setup:prod` on the server if Node is not available — run it on your Mac, then upload the standalone bundle.

---

## Quick decision

```
Can the server run ANY Node process (panel, SSH, Docker)?
  ├─ YES → Build on Mac → upload dist/sai-standalone → .env → start
  └─ NO  → Deploy to Railway/Render/Vercel + point domain there
```
