/**
 * INVENTARIS ENV PER LAYANAN — dibangun MESIN dari kode, bukan ditulis tangan.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Sampai Okt 2026 setiap container menerima SELURUH `.env` (`env_file: .env`):
 * `app-customer` — satu-satunya proses yang menghadap internet tanpa daftar IP —
 * memegang `OPERATOR_SESSION_SECRET` (memalsukan sesi konsol) dan
 * `BACKUP_ENCRYPTION_KEY` (membuka setiap cadangan). Penggantinya adalah daftar
 * izin `environment:` per layanan di `docker-compose.yml`.
 *
 * Daftar izin yang KURANG satu nama adalah outage yang pesannya menyalahkan hal
 * lain (variabel yang tak sampai terbaca sebagai "belum diset"). Karena itu
 * daftarnya tidak ditebak: modul ini menelusuri graf impor dari TITIK MASUK
 * tiap layanan dan mengumpulkan setiap env yang dibaca kode di penutupan itu,
 * dan `tests/compose-env-allowlist.test.ts` menolak compose yang tidak
 * menyediakan salah satunya.
 *
 *   bun run env:inventory          # tabel markdown: env × layanan
 *
 * ══ YANG DIBACA SEBAGAI "MEMBACA ENV" ═══════════════════════════════════════
 *  • TS/JS: `process.env.X`, `process.env["X"]`, `env.X` / `env["X"]` (pola
 *    parameter `env = process.env` di paket), dan konstanta `*_ENV = "X"`
 *    yang dipakai sebagai kunci. Komentar dikupas dulu.
 *  • Shell: `$X` / `${X…}` dikurangi nama yang DITETAPKAN di skrip itu sendiri.
 *  • Go: literal string berbentuk env di berkas non-tes yang dibangun ke biner
 *    `cmd/integrator` (seluruh `internal/`).
 *  • Pustaka yang membaca env tanpa terlihat di kode kita (next-auth, AWS SDK,
 *    libpq, Node) — daftar `IMPLICIT` di bawah, masing-masing beralasan.
 *
 * Ia sengaja MELEBIH: berkas yang terimpor dihitung seluruhnya, walau fungsi
 * yang membaca env tidak pernah dipanggil layanan itu. Lebih baik satu nama
 * berlebih di daftar izin daripada satu yang kurang — kecuali untuk RAHASIA,
 * dan itu yang dijaga daftar tolak di tes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { DB_INSTANCE_URL_ENV_PATTERN } from "@sai/db/db-instances";

export const REPO = join(__dirname, "..", "..");

const rel = (abs: string) => relative(REPO, abs).split(sep).join("/");
const read = (abs: string) => readFileSync(abs, "utf8");

/** Bentuk nama env di pola yang SUDAH berjangkar ke akses env (`process.env.TZ`). */
const ENV_NAME = "[A-Z][A-Z0-9_]+";
/** Bentuk nama env untuk literal LEPAS (Go) — wajib bergaris bawah, supaya `"UTC"` bukan env. */
const BARE_ENV_NAME = "[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+";

/** Env instans basis data tambahan (tahap 4) — nama dinamis dari `db_instances`.
 *  Pola dari `contract/db-instances.yaml`, sama dengan penyelesai dan jalur `tenant`. */
export const DB_INSTANCE_ENV = DB_INSTANCE_URL_ENV_PATTERN;

// ── Pengupas komentar ─────────────────────────────────────────────────────

/** Kupas komentar `//` dan `/* *\/` tanpa menyentuh string (cukup untuk pola env). */
function stripJsComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ── Env yang dibaca SATU berkas ───────────────────────────────────────────

export function envReadInJs(src: string): Set<string> {
  const code = stripJsComments(src);
  const out = new Set<string>();
  const patterns = [
    new RegExp(`process\\.env\\??\\.(${ENV_NAME})\\b`, "g"),
    new RegExp(`process\\.env\\[\\s*["'\`](${ENV_NAME})["'\`]\\s*\\]`, "g"),
    new RegExp(`\\benv\\??\\.(${ENV_NAME})\\b`, "g"),
    new RegExp(`\\benv\\[\\s*["'\`](${ENV_NAME})["'\`]\\s*\\]`, "g"),
    /* `const PASSPHRASE_ENV = "SAI_BUNDLE_PASSPHRASE"` lalu `process.env[PASSPHRASE_ENV]`. */
    new RegExp(`\\b[A-Z][A-Z0-9_]*_ENV\\s*=\\s*["'\`](${ENV_NAME})["'\`]`, "g"),
    /* `process.env["DATABASE_URL"]` di konfigurasi Prisma sudah tertangkap di atas. */
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) out.add(m[1]!);
  for (const m of code.matchAll(/const\s*\{([^}]+)\}\s*=\s*process\.env\b/g)) {
    for (const k of m[1]!.split(",")) {
      const name = k.split(":")[0]!.trim();
      if (new RegExp(`^(?:${ENV_NAME})$`).test(name)) out.add(name);
    }
  }
  return out;
}

export function envReadInShell(src: string): Set<string> {
  const code = src
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const assigned = new Set<string>();
  /* Penetapan di awal baris, sesudah `;`/`)`/`&&`/`||`, atau sesudah then/else/do. */
  for (const m of code.matchAll(
    /(?:^|[;)&|]|\bthen|\belse|\bdo)\s*(?:export\s+|local\s+)?([A-Z_][A-Z0-9_]*)=/gm
  )) {
    assigned.add(m[1]!);
  }
  for (const m of code.matchAll(/\bread\s+(?:-[a-z]+\s+)*([A-Z_][A-Z0-9_]*)/g)) assigned.add(m[1]!);
  for (const m of code.matchAll(/\bfor\s+([A-Z_][A-Z0-9_]*)\s+in\b/g)) assigned.add(m[1]!);
  const out = new Set<string>();
  for (const m of code.matchAll(new RegExp(`\\$\\{?(${ENV_NAME})`, "g"))) {
    if (!assigned.has(m[1]!)) out.add(m[1]!);
  }
  /* `: "${X:=bawaan}"` MEMBACA X walau juga menetapkannya. */
  for (const m of code.matchAll(new RegExp(`\\$\\{(${ENV_NAME}):?=`, "g"))) out.add(m[1]!);
  return out;
}

export function envReadInGo(src: string): Set<string> {
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  const out = new Set<string>();
  for (const m of code.matchAll(new RegExp(`"(${BARE_ENV_NAME})"`, "g"))) out.add(m[1]!);
  return out;
}

// ── Graf impor TS/JS ──────────────────────────────────────────────────────

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs"];

function tryFile(base: string): string | null {
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => join(base, "index" + e))];
  /* `./x.js` yang menunjuk `x.ts` (gaya ESM). */
  if (/\.(m?js)$/.test(base)) candidates.push(base.replace(/\.m?js$/, ".ts"));
  for (const k of candidates) {
    if (existsSync(k) && statSync(k).isFile()) return k;
  }
  return null;
}

type Exports = Record<string, string | Record<string, string>>;
const exportsCache = new Map<string, Exports>();

function packageExports(name: string): Exports | null {
  if (exportsCache.has(name)) return exportsCache.get(name)!;
  const manifest = join(REPO, "packages", name, "package.json");
  if (!existsSync(manifest)) return null;
  const ex = (JSON.parse(read(manifest)) as { exports?: Exports }).exports ?? {};
  exportsCache.set(name, ex);
  return ex;
}

function targetExport(v: string | Record<string, string>): string | null {
  if (typeof v === "string") return v;
  return v["react-server"] ?? v.import ?? v.default ?? v.node ?? null;
}

function resolveSai(spec: string): string | null {
  const m = /^@sai\/([^/]+)(?:\/(.+))?$/.exec(spec);
  if (!m) return null;
  const ex = packageExports(m[1]!);
  if (!ex) return null;
  const key = m[2] ? `./${m[2]}` : ".";
  const root = join(REPO, "packages", m[1]!);
  if (ex[key]) {
    const t = targetExport(ex[key]!);
    return t ? tryFile(join(root, t)) : null;
  }
  for (const [patterns, value] of Object.entries(ex)) {
    if (!patterns.includes("*")) continue;
    const [prefix, suffix] = patterns.split("*") as [string, string];
    if (key.startsWith(prefix) && key.endsWith(suffix)) {
      const middle = key.slice(prefix.length, key.length - suffix.length);
      const t = targetExport(value);
      if (t) return tryFile(join(root, t.replace("*", middle)));
    }
  }
  return null;
}

export function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith(".")) return tryFile(join(dirname(from), spec));
  if (spec.startsWith("@sai/")) return resolveSai(spec);
  if (spec.startsWith("@op/")) return tryFile(join(REPO, "apps/operator/src", spec.slice(4)));
  if (spec.startsWith("@/")) return tryFile(join(REPO, "src", spec.slice(2)));
  return null; // paket npm: pembacaan env-nya di daftar IMPLICIT
}

function importsOf(src: string): string[] {
  const code = stripJsComments(src);
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?!type\b)[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) out.push(m[1]!);
  return out;
}

/** Penutupan impor dari titik masuk (jalur absolut). */
export function importClosure(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of importsOf(read(f))) {
      const r = resolveImport(f, spec);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
}

// ── Titik masuk per layanan ───────────────────────────────────────────────

function walk(dir: string, filter: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const isSource = (f: string) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.(test|spec)\.[tj]sx?$/.test(f);

type PackageScripts = Record<string, string>;
let scriptsCache: PackageScripts | null = null;
function packageScripts(): PackageScripts {
  scriptsCache ??= (JSON.parse(read(join(REPO, "package.json"))) as { scripts: PackageScripts }).scripts;
  return scriptsCache;
}

/** Berkas yang dijalankan satu skrip `package.json` (rekursif lewat `bun run`). */
export function scriptFiles(name: string, seen = new Set<string>()): { js: string[]; sh: string[] } {
  const out = { js: [] as string[], sh: [] as string[] };
  if (seen.has(name)) return out;
  seen.add(name);
  const cmd = packageScripts()[name];
  if (cmd === undefined) throw new Error(`skrip package.json tidak dikenal: ${name}`);
  for (const m of cmd.matchAll(/(?:^|\s)((?:scripts|workers|prisma)\/[\w./-]+\.(ts|mjs|js|sh))\b/g)) {
    (m[2] === "sh" ? out.sh : out.js).push(join(REPO, m[1]!));
  }
  for (const m of cmd.matchAll(/--config\s+(\S+\.ts)/g)) out.js.push(join(REPO, m[1]!));
  if (/\bprisma\s+migrate\b/.test(cmd) && !/--config/.test(cmd)) out.js.push(join(REPO, "prisma.config.ts"));
  for (const m of cmd.matchAll(/\bbun run ([\w:.-]+)/g)) {
    if (packageScripts()[m[1]!] === undefined) continue; // `bun run scripts/x.ts` sudah tertangkap
    const sub = scriptFiles(m[1]!, seen);
    out.js.push(...sub.js);
    out.sh.push(...sub.sh);
  }
  return out;
}

/**
 * Skrip `package.json` yang dijalankan di image `-migrator` sebagai PERKAKAS
 * (`docker compose run --rm migrate bun run <skrip>`) — PRODUCTION.md §2–§3,
 * docs/MULTI-COMPANY.md, docs/MULTI-TENANT.md. Yang TIDAK di sini: skrip
 * pengembangan (build, test, parity, contract:gen, licence:keygen/issue — milik
 * mesin SAI), dan perkakas `job-backup` (di bawah).
 */
export const MIGRATE_TOOLBOX = [
  "db:migrate:all",
  "db:migrate:release",
  "db:migrate",
  "db:migrate:control",
  "db:migrate:platform",
  "db:migrate:companies",
  "migrate:audit",
  "migrate:tenant-audit",
  "migrate:operator-audit",
  "bootstrap",
  "create-admin",
  "create-company",
  "adopt-company",
  "adopt-tenant",
  "prove-tenant",
  "change-plan",
  "billing:pause",
  "reconcile:platform",
  "efaktur:platform",
  "db:seed:plans",
  "seed-asset-categories",
  "classify:books",
  "operator-code",
  "scheduler:subscriptions",
  "notify:setup",
  "notify:invoice-due",
  "remind:customers",
  "recurring:run",
  "recurring:publish",
  "prune:trails",
  "trails:move",
  "prove-scheduler-alive",
  "tenant:import-onprem",
  "licence:verify",
  "check:env",
] as const;

/** Perkakas di image `-backup` (`docker compose run --rm job-backup …`), PRODUCTION.md §Updates langkah 2. */
export const JOB_BACKUP_TOOLBOX = [
  "prove-backup-restore",
  "record:backup",
  "tenant:export-onprem",
  "tenant:mark-migrated-out",
  "tenant:unfreeze",
  "tenant:move",
] as const;

/** Skrip tambahan yang dipanggil `tsx scripts/<x>.ts` langsung (bukan lewat `bun run <nama>`). */
const MIGRATE_DIRECT = ["scripts/operator-credential.ts", "scripts/rename-tenant-slug.ts", "scripts/execute-tenant-deletion.ts"];

export interface Surface {
  service: string;
  js: string[];
  sh: string[];
  go: string[];
}

function nextAppEntries(appRoot: string, extra: string[]): string[] {
  return [...walk(join(REPO, appRoot), isSource), ...extra.map((e) => join(REPO, e)).filter((e) => existsSync(e))];
}

/** Perintah `bun run <skrip>` di `command` svc-worker, beserta penyelianya. */
function workerScripts(command: string[]): { js: string[]; sh: string[] } {
  const out = { js: [join(REPO, "scripts/run-workers.ts"), join(REPO, "scripts/run-as-leader.ts")], sh: [] as string[] };
  for (const line of command) {
    for (const m of line.matchAll(/\bbun run ([\w:.-]+)/g)) {
      const f = scriptFiles(m[1]!);
      out.js.push(...f.js);
      out.sh.push(...f.sh);
    }
  }
  return out;
}

function collectScripts(names: readonly string[]): { js: string[]; sh: string[] } {
  const out = { js: [] as string[], sh: [] as string[] };
  for (const n of names) {
    const f = scriptFiles(n);
    out.js.push(...f.js);
    out.sh.push(...f.sh);
  }
  return out;
}

export function serviceSurfaces(workerCommand: string[]): Surface[] {
  const goRoot = join(REPO, "services/integrator");
  const goFiles = [
    ...walk(join(goRoot, "internal"), (f) => f.endsWith(".go") && !f.endsWith("_test.go")),
    ...walk(join(goRoot, "cmd/integrator"), (f) => f.endsWith(".go") && !f.endsWith("_test.go")),
  ];
  const migrate = collectScripts(MIGRATE_TOOLBOX);
  const backup = collectScripts(JOB_BACKUP_TOOLBOX);
  const worker = workerScripts(workerCommand);
  return [
    {
      service: "app-customer",
      js: nextAppEntries("src/app", ["src/proxy.ts", "src/instrumentation.ts", "src/instrumentation-node.ts", "next.config.ts"]),
      sh: [],
      go: [],
    },
    {
      service: "app-operator",
      js: nextAppEntries("apps/operator/src/app", [
        "apps/operator/src/proxy.ts",
        "apps/operator/src/instrumentation.ts",
        "apps/operator/next.config.ts",
      ]),
      sh: [],
      go: [],
    },
    { service: "svc-worker", js: worker.js, sh: worker.sh, go: [] },
    {
      service: "migrate",
      js: [...migrate.js, ...MIGRATE_DIRECT.map((f) => join(REPO, f))],
      sh: migrate.sh,
      go: [],
    },
    { service: "job-backup", js: backup.js, sh: [join(REPO, "scripts/backup.sh"), ...backup.sh], go: [] },
    { service: "svc-integrator", js: [], sh: [], go: goFiles },
  ];
}

/**
 * Env yang dibaca PUSTAKA atau RUNTIME, bukan oleh kode kita — tidak terlihat
 * oleh pemindai, jadi ditulis di sini dengan alasannya.
 */
export const IMPLICIT: Record<string, Record<string, string>> = {
  "app-customer": {
    AUTH_SECRET: "next-auth v5 membacanya sendiri (setEnvDefaults)",
    AUTH_URL: "next-auth v5 membacanya sendiri",
    AUTH_TRUST_HOST: "next-auth v5 — wajib di belakang Traefik",
    NODE_ENV: "Next/React",
    TZ: "Node — tanggal bisnis Asia/Jakarta",
  },
  "app-operator": {
    NODE_ENV: "Next/React",
    TZ: "Node — tanggal bisnis Asia/Jakarta",
  },
  "svc-worker": { TZ: "Node — tanggal bisnis", NODE_ENV: "Node" },
  migrate: { TZ: "Node — tanggal bisnis", NODE_ENV: "Node" },
  "job-backup": {
    TZ: "Node/sh",
    NODE_ENV: "Node",
    AWS_ACCESS_KEY_ID: "awscli (`backup.sh`, `prove-backup-restore`)",
    AWS_SECRET_ACCESS_KEY: "awscli",
    AWS_DEFAULT_REGION: "awscli",
  },
  "svc-integrator": {
    TZ: "Go `time.Local`",
    AWS_ACCESS_KEY_ID: "AWS SDK Go v2 `LoadDefaultConfig`",
    AWS_SECRET_ACCESS_KEY: "AWS SDK Go v2",
    AWS_DEFAULT_REGION: "AWS SDK Go v2 (AWS_REGION juga dibaca)",
    AWS_REGION: "AWS SDK Go v2",
  },
};

export interface Inventory {
  /** env → berkas pertama (relatif repo) yang membacanya. */
  reads: Map<string, string>;
}

export function inventory(surface: Surface): Inventory {
  const reads = new Map<string, string>();
  const record = (names: Set<string>, f: string) => {
    for (const n of names) if (!reads.has(n)) reads.set(n, rel(f));
  };
  for (const f of importClosure(surface.js)) record(envReadInJs(read(f)), f);
  for (const f of surface.sh) record(envReadInShell(read(f)), f);
  for (const f of surface.go) record(envReadInGo(read(f)), f);
  for (const n of Object.keys(IMPLICIT[surface.service] ?? {})) if (!reads.has(n)) reads.set(n, "(implisit)");
  return { reads };
}
