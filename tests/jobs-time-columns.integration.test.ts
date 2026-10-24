/**
 * UJI INTEGRASI jam kolom `jobs` — antrean Node terhadap PostgreSQL sungguhan.
 *
 * Dilewati tanpa `JOBS_TZ_TEST_PG_URL` (URL superuser ke PostgreSQL SEKALI
 * PAKAI di 127.0.0.1/localhost — URL lain DITOLAK, sebab tes ini membuat dan
 * menghapus basis data). Zona sesinya dari `JOBS_TZ_TEST_SESSION_TZ` (bawaan
 * `Asia/Jakarta`, zona produksi) dan zona proses dari `TZ`; matriksnya
 * dijalankan dari luar karena klien kendali adalah singleton per proses:
 *
 *   docker run --rm -d --name uji-jam-node -e POSTGRES_PASSWORD=uji -p 127.0.0.1:55442:5432 postgres:17-alpine
 *   for sesi in UTC America/New_York Asia/Jakarta; do for tz in UTC America/New_York Asia/Jakarta; do
 *     TZ=$tz JOBS_TZ_TEST_SESSION_TZ=$sesi JOBS_TZ_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55442/postgres \
 *       bunx vitest run tests/jobs-time-columns.integration.test.ts
 *   done; done
 *   docker stop uji-jam-node
 *
 * Baris "milik Go" ditanam dengan `now()` di SQL — cara Go (dan klaim Node)
 * menulis `claimed_at`/`finished_at`. Setiap asersi di bawah GAGAL pada kode
 * sebelum perbaikan bila zona sesi bukan UTC.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { AKAR_REPO } from "./akar-sumber";
import { JOB_KINDS, KINDS_BY_LANE, type JobKind, type JobLane } from "@sai/core/generated/job-kinds";
import { DONE_RETENTION_DAYS, LEASE_STALE_MS, backoffMs } from "@sai/core/job-backoff";

const URL_UJI = process.env.JOBS_TZ_TEST_PG_URL ?? "";
const SESI = process.env.JOBS_TZ_TEST_SESSION_TZ ?? "Asia/Jakarta";
const jalan = URL_UJI !== "" ? describe : describe.skip;

/* Kind Node yang punya lebih dari satu percobaan (supaya `failJob` memulangkan
   ke `queued`, bukan `dead`) dan BUKAN penulis buku. */
const [LANE, KIND] = (() => {
  for (const [lane, kinds] of Object.entries(KINDS_BY_LANE)) {
    for (const k of kinds ?? []) {
      const spec = JOB_KINDS[k as JobKind];
      if (spec.maxAttempts > 1 && lane !== "ledger") return [lane as JobLane, k as JobKind];
    }
  }
  throw new Error("tidak ada kind ber-max_attempts > 1");
})();

jalan(`jam kolom jobs — sesi ${SESI}, proses ${process.env.TZ ?? "(bawaan)"}`, () => {
  const nama = `uji_jam_node_${Date.now()}`;
  let admin: Client;
  let db: Client;
  let q: typeof import("@sai/platform/job-queue");
  let m: typeof import("@sai/platform/job-metrics");
  let dur: typeof import("@sai/platform/job-durations");

  beforeAll(async () => {
    const u = new URL(URL_UJI);
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) {
      throw new Error(`JOBS_TZ_TEST_PG_URL wajib menunjuk PostgreSQL sekali pakai lokal, bukan ${u.hostname}`);
    }
    admin = new Client({ connectionString: URL_UJI });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nama}`);
    /* Zona bawaan basis data = zona sesi setiap koneksi yang tidak menyetelnya
       (node-pg dan pgx sama-sama tidak) — peran `TZ` container `pg`. */
    await admin.query(`ALTER DATABASE ${nama} SET timezone = '${SESI.replace(/'/g, "")}'`);
    u.pathname = `/${nama}`;
    db = new Client({ connectionString: u.toString() });
    await db.connect();
    const akar = join(AKAR_REPO, "prisma", "postgresql", "control");
    for (const mig of ["0005_jejak_putaran", "0006_jobs", "0007_jobs_started_at"]) {
      await db.query(readFileSync(join(akar, mig, "migration.sql"), "utf8"));
    }
    process.env.CONTROL_DATABASE_URL = u.toString();
    q = await import("@sai/platform/job-queue");
    m = await import("@sai/platform/job-metrics");
    dur = await import("@sai/platform/job-durations");
  }, 60_000);

  afterAll(async () => {
    const { controlDb } = await import("@sai/core/control-db");
    await controlDb.$disconnect().catch(() => {});
    await db?.end().catch(() => {});
    await admin?.query(`DROP DATABASE IF EXISTS ${nama} WITH (FORCE)`).catch(() => {});
    await admin?.end().catch(() => {});
  });

  /** Tanam baris dengan jam `now()` server, mundur `ms`. */
  async function tanam(status: string, kolom: "claimed_at" | "finished_at" | "created_at", ms: number) {
    const r = await db.query<{ id: number }>(
      `INSERT INTO jobs (kind, payload, status, claimed_by, updated_at, claimed_at, finished_at, created_at)
       VALUES ($1, '{}'::jsonb, $2, 'pekerja-go', now(),
               CASE WHEN $3 = 'claimed_at'  THEN now() - $4::bigint * interval '1 millisecond' END,
               CASE WHEN $3 = 'finished_at' THEN now() - $4::bigint * interval '1 millisecond' END,
               CASE WHEN $3 = 'created_at'  THEN now() - $4::bigint * interval '1 millisecond' ELSE now() END)
       RETURNING id`,
      [KIND, status, kolom, ms]
    );
    return r.rows[0]!.id;
  }
  const status = async (id: number) =>
    (await db.query<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id])).rows[0]?.status ?? "hilang";

  it("reclaim: lease hidup tetap, lease basi dipulangkan — termasuk lease Node yang baru diklaim", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    const hidup = await tanam("claimed", "claimed_at", LEASE_STALE_MS - 10_000);
    const basi = await tanam("claimed", "claimed_at", LEASE_STALE_MS + 10_000);
    await q.publishJob({ kind: KIND, payload: {}, dedupeKey: "uji:reclaim" });
    const milikNode = await q.claimJob(LANE, "pekerja-node", [KIND]);
    expect(milikNode).not.toBeNull();

    expect(await q.reclaimStaleJobs()).toBe(1);
    expect(await status(hidup)).toBe("claimed");
    expect(await status(basi)).toBe("queued");
    expect(await status(milikNode!.id)).toBe("claimed");
  });

  it("archive: `done` lewat retensi dibuang, yang baru tetap", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    const hari = 86_400_000;
    const baru = await tanam("done", "finished_at", DONE_RETENTION_DAYS * hari - 3_600_000);
    const lama = await tanam("done", "finished_at", DONE_RETENTION_DAYS * hari + 3_600_000);
    expect(await q.archiveDoneJobs()).toBe(1);
    expect(await status(baru)).toBe("done");
    expect(await status(lama)).toBe("hilang");
  });

  it("failJob: run_after = sekarang + backoff, dan barisnya TIDAK bisa diklaim sebelum itu", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    await q.publishJob({ kind: KIND, payload: {}, dedupeKey: "uji:fail" });
    const job = await q.claimJob(LANE, "pekerja-node", [KIND]);
    expect(job).not.toBeNull();
    const acak = () => 0.5;
    expect(await q.failJob(job!.id, "pekerja-node", "uji", acak)).toEqual({ status: "queued" });

    const r = await db.query<{ s: number }>(
      `SELECT EXTRACT(EPOCH FROM (run_after - LOCALTIMESTAMP))::float8 AS s FROM jobs WHERE id = $1`,
      [job!.id]
    );
    expect(Math.abs(r.rows[0]!.s - backoffMs(1, acak) / 1000)).toBeLessThan(5);
    expect(await q.claimJob(LANE, "pekerja-node", [KIND])).toBeNull();
  });

  it("publishJob: langsung bisa diklaim; delayMs menunda menurut jam server", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    await q.publishJob({ kind: KIND, payload: {}, dedupeKey: "uji:tunda", delayMs: 3_600_000 });
    expect(await q.claimJob(LANE, "pekerja-node", [KIND])).toBeNull();
    await q.publishJob({ kind: KIND, payload: {}, dedupeKey: "uji:kini" });
    expect(await q.claimJob(LANE, "pekerja-node", [KIND])).not.toBeNull();
  });

  it("jobStatus().createdAt adalah instan sejati, bukan tujuh jam di masa depan", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    const terbit = await q.publishJob({ kind: KIND, payload: {}, dedupeKey: "uji:status" });
    const row = await q.jobStatus({ id: terbit!.id });
    /* `readProvisionStatus` membandingkan ini dengan `companies.created_at`
       tulisan Prisma (UTC); tujuh jam di masa depan = PT yang berhasil
       terbaca gagal. */
    expect(Math.abs(row!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("queueSnapshot: umur tertua menurut jam yang sama dengan yang menulis run_after", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    await db.query(
      `INSERT INTO jobs (kind, payload, status, run_after, updated_at)
       VALUES ($1, '{}'::jsonb, 'queued', now() - interval '20 minutes', now())`,
      [KIND]
    );
    const jalur = (await q.queueSnapshot()).find((l) => l.lane === LANE)!;
    expect(jalur.waiting).toBe(1);
    expect(Math.abs((jalur.ageSeconds ?? 0) - 1200)).toBeLessThan(60);
  });

  it("jobMetrics: jendela N menit berarti N menit", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    await tanam("queued", "created_at", 60_000); // di dalam jendela
    await tanam("queued", "created_at", 2 * 3_600_000); // di luar jendela 15 menit
    const jalur = (await m.jobMetrics(15)).find((l) => l.lane === LANE)!;
    expect(jalur.publishedPerMin).toBeCloseTo(1 / 15, 2);
  });

  /* ── Durasi jalur Go (09 §11) ─────────────────────────────────────────────
     SQL antrean Go diambil dari SUMBERNYA, `contract/jobs.sql` (yang
     dibangkitkan `sqlc` ke `internal/controlsql`), lalu dijalankan apa adanya
     dengan `sqlc.arg(x)` → `$n`. Yang dibuktikan: pekerjaan yang diklaim,
     diperpanjang lease-nya, dan diselesaikan oleh SQL Go menghasilkan durasi
     `started_at → finished_at` yang benar di `jobDurations` — bukan jarak dari
     perpanjangan lease terakhir. */
  const sqlGo = (nama: string, urutan: string[]): string => {
    const isi = readFileSync(join(AKAR_REPO, "contract", "jobs.sql"), "utf8");
    const awal = isi.indexOf(`-- name: ${nama} `);
    const blok = isi.slice(awal, isi.indexOf(";", awal) + 1);
    let teks = blok
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    urutan.forEach((arg, i) => {
      teks = teks.replace(new RegExp(`sqlc\\.arg\\(${arg}\\)`, "g"), `$${i + 1}`);
    });
    return teks;
  };
  const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("jobDurations: pekerjaan yang diklaim & diselesaikan SQL Go terukur dari started_at", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    const KIND_GO = "report.export_go";
    await db.query(`INSERT INTO jobs (kind, payload, status, updated_at) VALUES ($1, '{}'::jsonb, 'queued', now())`, [
      KIND_GO,
    ]);
    const klaim = await db.query<{ id: number }>(sqlGo("ClaimJob", ["worker_id", "kinds"]), ["pekerja-go", [KIND_GO]]);
    const id = klaim.rows[0]!.id;
    await tidur(400);
    /* Perpanjangan lease menggeser `claimed_at` — dan TIDAK boleh menyentuh `started_at`. */
    expect((await db.query(sqlGo("RenewLease", ["id", "worker_id"]), [id, "pekerja-go"])).rowCount).toBe(1);
    await tidur(200);
    expect(
      (await db.query(sqlGo("CompleteJob", ["result_ref", "id", "worker_id"]), ["hasil/x", id, "pekerja-go"])).rowCount
    ).toBe(1);

    const r = await db.query<{ dari_mulai: number; dari_klaim: number }>(
      `SELECT EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000 AS dari_mulai,
              EXTRACT(EPOCH FROM (finished_at - claimed_at)) * 1000 AS dari_klaim
         FROM jobs WHERE id = $1`,
      [id]
    );
    expect(Number(r.rows[0]!.dari_mulai)).toBeGreaterThanOrEqual(550);
    expect(Number(r.rows[0]!.dari_klaim)).toBeLessThan(450);

    const { rows } = await dur.jobDurations();
    const goKind = rows.find((d) => d.kind === KIND_GO)!;
    expect(goKind.lane).toBe("interactive");
    expect(goKind.samples).toBe(1);
    expect(goKind.p95Ms!).toBeGreaterThanOrEqual(550);
    expect(goKind.p95Ms!).toBeLessThan(5_000);
    expect(goKind.maxMs).toBe(goKind.p95Ms);
  });

  it("jobDurations: p95 jalur atas GABUNGAN Node + Go, hitungan di atas SLO, dan jendela harian", async () => {
    await db.query(`TRUNCATE jobs RESTART IDENTITY`);
    const tanamDurasi = (kind: string, ms: number, selesaiMundurJam = 1) =>
      db.query(
        `INSERT INTO jobs (kind, payload, status, updated_at, started_at, finished_at)
         VALUES ($1, '{}'::jsonb, 'done', now(),
                 now() - $3::int * interval '1 hour' - $2::bigint * interval '1 millisecond',
                 now() - $3::int * interval '1 hour')`,
        [kind, ms, selesaiMundurJam]
      );
    for (let i = 0; i < 19; i++) await tanamDurasi("report.export", 1_000);
    await tanamDurasi("report.export_go", 20_000);
    /* Di luar retensi (15 hari) — tidak boleh ikut. */
    await tanamDurasi("report.export_go", 90_000, 15 * 24);
    /* Baris tanpa `started_at` (sebelum migration 0007) dibuang. */
    await db.query(
      `INSERT INTO jobs (kind, payload, status, updated_at, finished_at) VALUES ('report.export', '{}'::jsonb, 'done', now(), now())`
    );

    const hasil = await dur.jobDurations();
    expect(hasil.windowDays).toBe(DONE_RETENTION_DAYS);
    const gabungan = hasil.rows.find((d) => d.lane === "interactive" && d.kind === null)!;
    expect(gabungan.samples).toBe(20);
    expect(gabungan.maxMs).toBe(20_000);
    expect(gabungan.overSlo).toBe(1);
    /* percentile_cont(0,95) atas 19 × 1000 + 1 × 20000 = 1000 + 0,05 × 19000. */
    expect(gabungan.p95Ms).toBe(1_950);
    const go = hasil.rows.find((d) => d.kind === "report.export_go")!;
    expect(go.samples).toBe(1);
    expect(go.p95Ms).toBe(20_000);
    /* Jalur yang tidak menjalankan apa pun tetap ada, tanpa angka karangan. */
    expect(hasil.rows.find((d) => d.lane === "tenant" && d.kind === null)).toMatchObject({ samples: 0, p95Ms: null });
  });
});
