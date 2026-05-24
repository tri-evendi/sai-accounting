# Low memory hosting

Next.js + database apps need **about 300–450 MB RAM** while running. Many cheap shared plans give **128 MB** — that is usually **not enough** for this project.

## What to do

### 1. Use the smallest deploy (standalone only)

**Never** upload the full repo or run `npm run build` on the server (build uses a lot of RAM).

On **your Mac**:

```bash
npm run build:upload
```

Upload only **`dist/sai-standalone/`** (not the whole project).

On the **server**:

```bash
cd /path/to/sai-standalone
cp .env.example .env   # edit
bash scripts/start-low-memory.sh
```

Or with PM2:

```bash
pm2 start ecosystem.config.low-memory.cjs
pm2 save
```

### 2. Limit Node and database connections

In `.env` on the server:

```env
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=384
UV_THREADPOOL_SIZE=2
DB_CONNECTION_LIMIT=2
```

### 3. Only one app process

- **One** Node app for this site (no second Next/PM2 app on the same account)
- PM2: `instances: 1`, `exec_mode: fork` (already set in low-memory config)

### 4. If it still gets killed (OOM)

Your plan is too small for this stack. Options:

| Option | RAM | Cost |
|--------|-----|------|
| Upgrade VPS / hosting plan | 512 MB+ | Paid |
| [Railway](https://railway.app) / [Render](https://render.com) | ~512 MB | Free tier / low cost |
| Run app on Railway, **MySQL stays** on current host | App off your small server | Often best |

Point your domain to Railway/Render; use remote `DATABASE_URL` to your existing MySQL.

### 5. Build on a weak Mac

```bash
NODE_OPTIONS=--max-old-space-size=2048 npm run build:upload
```

Build memory is only needed on your computer, not on the server.

---

## Realistic minimum

| Deploy type | Typical RAM while idle |
|-------------|-------------------------|
| Full `next start` + all `node_modules` | 400–700 MB |
| **Standalone** (`dist/sai-standalone`) | **250–400 MB** |
| + `start-low-memory.sh` | Tries to stay ~300–380 MB |

If your panel shows a **128 MB** limit, the app will keep stopping — use an external host (Railway/Render) or a bigger plan.

---

## Scripts

| Command | Use |
|---------|-----|
| `npm run build:upload` | Build on Mac → `dist/sai-standalone` |
| `bash scripts/start-low-memory.sh` | Run with memory limits |
| `pm2 start ecosystem.config.low-memory.cjs` | Same, with auto-restart |
