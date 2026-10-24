/**
 * UJI INTEGRASI jam kolom waktu DI LUAR `jobs` — Prisma vs SQL, PostgreSQL sungguhan.
 *
 * Dilewati tanpa `SQL_CLOCK_TEST_PG_URL` (URL superuser ke PostgreSQL SEKALI
 * PAKAI di 127.0.0.1/localhost — URL lain DITOLAK, sebab tes ini membuat dan
 * menghapus basis data). Zona sesinya dari `SQL_CLOCK_TEST_SESSION_TZ` (bawaan
 * `Asia/Jakarta`, zona produksi), zona proses dari `TZ`:
 *
 *   docker run --rm -d --name uji-jam-sql -e POSTGRES_PASSWORD=uji -p 127.0.0.1:55443:5432 postgres:17-alpine
 *   for sesi in UTC America/New_York Asia/Jakarta; do for tz in UTC Asia/Jakarta; do
 *     TZ=$tz SQL_CLOCK_TEST_SESSION_TZ=$sesi SQL_CLOCK_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55443/postgres \
 *       bunx vitest run tests/sql-clock-utc.integration.test.ts
 *   done; done
 *   docker stop uji-jam-sql
 *
 * Yang dibuktikannya — dasar keputusan di docs/DATABASE.md §4 "Kolom waktu":
 *   1. Prisma mengisi `@default(now())` dan `@updatedAt` SENDIRI dengan jam
 *      UTC; DEFAULT basis data tidak pernah menyala untuk tulisan Prisma.
 *      Itulah sebab NOL baris produksi yang berselisih tujuh jam, dan sebab
 *      tidak ada data yang perlu dimigrasikan.
 *   2. DEFAULT `CURRENT_TIMESTAMP` (INSERT mentah yang tidak menyebut
 *      `created_at`) dan `now()` polos menulis jam ZONA SESI — perangkap yang
 *      ditutup penjaga `tests/sql-clock-utc.test.ts`.
 *   3. `now() AT TIME ZONE 'UTC'` sama dengan yang ditulis Prisma, di zona sesi
 *      apa pun.
 *   4. Pembatas laju persisten menulis UTC, dan baris lamanya (jam sesi) tidak
 *      mengunci pengguna lebih lama.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { AKAR_REPO } from "./akar-sumber";

const URL_UJI = process.env.SQL_CLOCK_TEST_PG_URL ?? "";
const SESI = process.env.SQL_CLOCK_TEST_SESSION_TZ ?? "Asia/Jakarta";
const jalan = URL_UJI !== "" ? describe : describe.skip;

/** Toleransi jam: dua jam yang seharusnya sama berselisih sebanyak lama tesnya. */
const TOLERANSI_MS = 5_000;

jalan(`jam kolom waktu di luar jobs — sesi ${SESI}, proses ${process.env.TZ ?? "(bawaan)"}`, () => {
  const nama = `uji_jam_sql_${Date.now()}`;
  let admin: Client;
  let db: Client;
  let control: typeof import("@sai/core/control-db")["controlDb"];
  let rl: typeof import("@/lib/rate-limit-persistent");
  /** Selisih jam sesi terhadap UTC, dalam milidetik (WIB = +7 jam). */
  let offsetSesiMs = 0;

  beforeAll(async () => {
    const u = new URL(URL_UJI);
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) {
      throw new Error(`SQL_CLOCK_TEST_PG_URL wajib menunjuk PostgreSQL sekali pakai lokal, bukan ${u.hostname}`);
    }
    admin = new Client({ connectionString: URL_UJI });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nama}`);
    /* Zona bawaan basis data = zona sesi setiap koneksi yang tidak menyetelnya
       (node-pg, adapter-pg, dan pgx sama-sama tidak) — peran `TZ` container `pg`. */
    await admin.query(`ALTER DATABASE ${nama} SET timezone = '${SESI.replace(/'/g, "")}'`);
    u.pathname = `/${nama}`;
    db = new Client({ connectionString: u.toString() });
    await db.connect();
    const akar = join(AKAR_REPO, "prisma", "postgresql", "control");
    for (const mig of readdirSync(akar).filter((d) => /^\d{4}_/.test(d)).sort()) {
      await db.query(readFileSync(join(akar, mig, "migration.sql"), "utf8"));
    }
    const r = await db.query<{ ms: string }>(
      `SELECT round(extract(epoch FROM LOCALTIMESTAMP - (now() AT TIME ZONE 'UTC')) * 1000)::text AS ms`
    );
    offsetSesiMs = Number(r.rows[0]!.ms);
    process.env.CONTROL_DATABASE_URL = u.toString();
    control = (await import("@sai/core/control-db")).controlDb;
    rl = await import("@/lib/rate-limit-persistent");
  }, 120_000);

  afterAll(async () => {
    await control?.$disconnect().catch(() => {});
    await db?.end().catch(() => {});
    await admin?.query(`DROP DATABASE IF EXISTS ${nama} WITH (FORCE)`).catch(() => {});
    await admin?.end().catch(() => {});
  });

  /** Jarak (ms) kolom `kolom` baris `key` dari jam dinding UTC server. */
  async function jarakDariUtc(key: string, kolom: string): Promise<number> {
    const r = await db.query<{ ms: string }>(
      `SELECT round(extract(epoch FROM ${kolom} - (now() AT TIME ZONE 'UTC')) * 1000)::text AS ms
         FROM rate_limit_counters WHERE "key" = $1`,
      [key]
    );
    return Number(r.rows[0]!.ms);
  }

  it("zona sesinya memang yang diminta", async () => {
    const r = await db.query<{ tz: string }>(`SELECT current_setting('TimeZone') AS tz`);
    expect(r.rows[0]!.tz).toBe(SESI);
  });

  it("Prisma mengisi created_at/updated_at sendiri dengan UTC — DEFAULT basis data tidak menyala", async () => {
    await control.rateLimitCounter.create({ data: { key: "uji:prisma", windowStartedAt: new Date(), count: 1 } });
    for (const kolom of ["created_at", "updated_at", "window_started_at"]) {
      expect(Math.abs(await jarakDariUtc("uji:prisma", kolom)), kolom).toBeLessThan(TOLERANSI_MS);
    }
    const baca = await control.rateLimitCounter.findUniqueOrThrow({ where: { key: "uji:prisma" } });
    expect(Math.abs(baca.createdAt.getTime() - Date.now())).toBeLessThan(TOLERANSI_MS);
  });

  it("DEFAULT CURRENT_TIMESTAMP dan now() polos menulis jam ZONA SESI (perangkapnya)", async () => {
    await db.query(
      `INSERT INTO rate_limit_counters ("key", window_started_at, count, updated_at) VALUES ('uji:default', now(), 1, now())`
    );
    for (const kolom of ["created_at", "updated_at", "window_started_at"]) {
      expect(Math.abs((await jarakDariUtc("uji:default", kolom)) - offsetSesiMs), kolom).toBeLessThan(TOLERANSI_MS);
    }
  });

  it("`now() AT TIME ZONE 'UTC'` = jam yang ditulis Prisma, di zona sesi apa pun", async () => {
    await db.query(
      `INSERT INTO rate_limit_counters ("key", window_started_at, count, created_at, updated_at)
       VALUES ('uji:utc', now() AT TIME ZONE 'UTC', 1, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`
    );
    const baca = await control.rateLimitCounter.findUniqueOrThrow({ where: { key: "uji:utc" } });
    expect(Math.abs(baca.createdAt.getTime() - Date.now())).toBeLessThan(TOLERANSI_MS);
    expect(Math.abs(baca.windowStartedAt.getTime() - Date.now())).toBeLessThan(TOLERANSI_MS);
  });

  it("pembatas laju persisten menulis UTC — Prisma membacanya sebagai sekarang", async () => {
    const opsi = { windowMs: 15 * 60_000, maxAttempts: 3 };
    await rl.checkPersistentRateLimit("uji:rl", opsi);
    await rl.checkPersistentRateLimit("uji:rl", opsi);
    const baca = await control.rateLimitCounter.findUniqueOrThrow({ where: { key: "uji:rl" } });
    expect(baca.count).toBe(2);
    for (const t of [baca.windowStartedAt, baca.createdAt, baca.updatedAt]) {
      expect(Math.abs(t.getTime() - Date.now())).toBeLessThan(TOLERANSI_MS);
    }
  });

  it("baris lama berjam sesi tidak mengunci lebih lama dari jendelanya", async () => {
    const opsi = { windowMs: 15 * 60_000, maxAttempts: 3 };
    /* Bentuk penulis lama: `NOW()` polos, sudah di batas. */
    await db.query(
      `INSERT INTO rate_limit_counters ("key", window_started_at, count, created_at, updated_at)
       VALUES ('uji:lama', now(), 3, now(), now())`
    );
    const r = await rl.checkPersistentRateLimit("uji:lama", opsi);
    if (Math.abs(offsetSesiMs) > opsi.windowMs) {
      /* WIB: tampak tujuh jam di masa depan → jendela baru. New York: tampak
         lima jam lalu → jendelanya memang sudah lewat. Dua-duanya: jendela baru. */
      expect(r.allowed).toBe(true);
      const baca = await control.rateLimitCounter.findUniqueOrThrow({ where: { key: "uji:lama" } });
      expect(baca.count).toBe(1);
    } else {
      /* Sesi UTC: baris lama memang jam UTC → jendelanya masih berlaku. */
      expect(r.allowed).toBe(false);
    }
  });
});
