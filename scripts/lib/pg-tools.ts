/**
 * Perkakas PostgreSQL untuk SKRIP yang memindah buku utuh — `tenant:move`
 * (antar-instans di SaaS) dan `tenant:export-onprem` / `tenant:import-onprem`
 * (SaaS → pemasangan customer). Satu salinan, tiga pemakai.
 *
 * ⚠ Jalankan pemakainya di image `backup` (`docker compose run --rm
 * job-backup …`): ia yang membawa `pg_dump`/`pg_restore` 17, `openssl`, dan
 * URL PostgreSQL LANGSUNG. Lewat PgBouncer `pg_dump` bisa memulangkan dump
 * sebagian — bentuk cadangan yang paling berbahaya, sebab ia tampak berhasil.
 *
 * Sandi selalu lewat ENV proses anak (`PGPASSWORD`), tidak pernah lewat argv:
 * argv terbaca siapa pun lewat `ps`.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { Client as PgClient } from "pg";

import { uraikanUrl } from "@sai/db/engine";

/**
 * URL server yang LANGSUNG ke PostgreSQL untuk `pg_dump`/`pg_restore`.
 *
 * Instans bawaan diselesaikan dari `PROVISION_DATABASE_URL` →
 * `CONTROL_DATABASE_URL`, dan di `.env` produksi yang kedua menunjuk
 * PgBouncer. Image `backup` membawa `DATABASE_URL` yang menunjuk `pg`
 * langsung (docker-compose.yml) — server yang sama, kredensial yang sama —
 * jadi itulah yang dipakai. Bila tidak ada jalan langsung, MELEMPAR: dump
 * lewat pooler bisa pulang sebagian dan tetap terlihat berhasil.
 */
export function directServerUrl(server: URL, env: NodeJS.ProcessEnv = process.env): URL {
  if (!/pgbouncer/i.test(server.hostname)) return server;
  const raw = env.DATABASE_URL;
  const direct = raw ? new URL(raw) : null;
  if (!direct || /pgbouncer/i.test(direct.hostname)) {
    throw new Error(
      `server basis data ${server.hostname} adalah PgBouncer dan tidak ada URL langsung ke PostgreSQL ` +
        "— jalankan di image `backup` (`docker compose run --rm job-backup …`), yang membawa " +
        "DATABASE_URL ke `pg`, atau set PROVISION_DATABASE_URL ke host PostgreSQL langsung"
    );
  }
  return direct;
}

/** Host:port tanpa kredensial — untuk dicetak. */
export function where(url: URL): string {
  return `${url.hostname}:${url.port || "5432"}`;
}

export async function pgFor(serverUrl: URL, database: string): Promise<PgClient> {
  const b = uraikanUrl(serverUrl.toString());
  const c = new PgClient({ host: b.host, port: b.port, user: b.user, password: b.password, database });
  await c.connect();
  return c;
}

/** Jumlah baris setiap tabel `public` — `count(*)` sungguhan, bukan statistik. */
export async function rowCounts(serverUrl: URL, database: string): Promise<Record<string, number>> {
  const c = await pgFor(serverUrl, database);
  try {
    const tables = await c.query<{ t: string }>(
      `SELECT table_name AS t FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`
    );
    const out: Record<string, number> = {};
    for (const { t } of tables.rows) {
      const r = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${t.replace(/"/g, '""')}"`);
      out[t] = Number(r.rows[0]?.n ?? 0);
    }
    return out;
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * Migration TERAKHIR yang selesai diterapkan di satu basis data — `null` bila
 * tabel `_prisma_migrations` tidak ada atau kosong. Nama migration berawalan
 * nomor urut empat digit, jadi `MAX` leksikal = yang terakhir.
 */
export async function migrationHead(serverUrl: URL, database: string): Promise<string | null> {
  const c = await pgFor(serverUrl, database);
  try {
    const r = await c.query<{ head: string | null }>(
      `SELECT MAX(migration_name) AS head FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    );
    return r.rows[0]?.head ?? null;
  } catch {
    return null;
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * Neraca saldo RINGKAS satu buku: jumlah debit & kredit DASAR (IDR) per kode
 * akun, langsung dari `journal_lines`. Bukan pengganti laporan Neraca Saldo
 * (yang menyaring periode & status) — ia sidik jari isi buku: dua buku dengan
 * digest yang sama memuat angka jurnal yang sama, sen demi sen.
 */
export async function trialBalanceDigest(
  serverUrl: URL,
  database: string
): Promise<{ rows: Array<[string, string, string]>; totalDebit: string; totalCredit: string }> {
  const c = await pgFor(serverUrl, database);
  try {
    const rows = await c.query<{ code: string; d: string; k: string }>(
      `SELECT a.code AS code, SUM(l.base_debit)::text AS d, SUM(l.base_credit)::text AS k
         FROM journal_lines l JOIN accounts a ON a.id = l.account_id
        GROUP BY a.code ORDER BY a.code`
    );
    const total = await c.query<{ d: string; k: string }>(
      `SELECT COALESCE(SUM(base_debit), 0)::numeric(17,2)::text AS d,
              COALESCE(SUM(base_credit), 0)::numeric(17,2)::text AS k
         FROM journal_lines`
    );
    return {
      rows: rows.rows.map((r) => [r.code, r.d, r.k]),
      totalDebit: total.rows[0]?.d ?? "0.00",
      totalCredit: total.rows[0]?.k ?? "0.00",
    };
  } finally {
    await c.end().catch(() => {});
  }
}

/** Env libpq untuk proses anak — sandi lewat env, tidak pernah di argv. */
export function libpqEnv(serverUrl: URL, database: string): NodeJS.ProcessEnv {
  const b = uraikanUrl(serverUrl.toString());
  return {
    ...process.env,
    PGHOST: b.host,
    PGPORT: String(b.port),
    PGUSER: b.user,
    PGPASSWORD: b.password,
    PGDATABASE: database,
  };
}

function exitError(name: string, code: number | null, signal: NodeJS.Signals | null): Error {
  return new Error(`${name} keluar dengan ${signal ? `sinyal ${signal}` : `kode ${code}`}`);
}

/**
 * `pg_dump -Fc` SATU basis data ke berkas. Lewat stdout, bukan `-f`, supaya
 * berkasnya ditulis proses INI (izin & lokasi yang sama dengan berkas bundel
 * lainnya) dan supaya `pg_dump` yang dibungkus (mis. `docker exec`) tetap
 * bekerja.
 */
export function dumpToFile(serverUrl: URL, database: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(file, { mode: 0o600 });
    const dump = spawn("pg_dump", ["-Fc", "--no-owner", "--no-acl"], {
      env: libpqEnv(serverUrl, database),
      stdio: ["ignore", "pipe", "inherit"],
    });
    dump.on("error", reject);
    out.on("error", reject);
    dump.stdout.pipe(out);
    /* Selesai = proses KELUAR dan berkas TERTUTUP; urutan keduanya tidak
       dijamin, jadi tunggu dua-duanya. */
    let pending = 2;
    let failure: Error | null = null;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      if (failure) reject(failure);
      else resolve();
    };
    dump.on("close", (code, signal) => {
      if (code !== 0) failure = exitError("pg_dump", code, signal);
      done();
    });
    out.on("finish", done);
  });
}

/**
 * `pg_restore` dari berkas `-Fc` ke basis data yang SUDAH dibuat dan kosong,
 * dalam SATU transaksi: gagal di tengah = tidak ada yang tertinggal separuh.
 * Dibaca lewat stdin, alasan yang sama dengan `dumpToFile`.
 */
export function restoreFromFile(serverUrl: URL, database: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const restore = spawn(
      "pg_restore",
      ["--no-owner", "--no-acl", "--single-transaction", "--exit-on-error", "-d", database],
      { env: libpqEnv(serverUrl, database), stdio: ["pipe", "inherit", "inherit"] }
    );
    restore.on("error", reject);
    const input = createReadStream(file);
    input.on("error", reject);
    input.pipe(restore.stdin);
    restore.on("close", (code, signal) =>
      code === 0 ? resolve() : reject(exitError("pg_restore", code, signal))
    );
  });
}

/** SHA-256 heksadesimal sebuah berkas, dibaca sebagai aliran. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(file);
    s.on("error", reject);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolve(h.digest("hex")));
  });
}

/**
 * Jalankan satu perintah sampai selesai; tolak bila keluar bukan-nol. `env`
 * ditambahkan ke env proses ini — dipakai untuk menitipkan sandi bundel ke
 * `openssl -pass env:…` tanpa pernah menaruhnya di argv.
 */
export function run(
  cmd: string,
  args: readonly string[],
  opts: { env?: Record<string, string>; cwd?: string } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code, signal) =>
      code === 0 ? resolve() : reject(exitError(cmd, code, signal))
    );
  });
}
