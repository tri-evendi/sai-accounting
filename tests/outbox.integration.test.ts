/**
 * UJI INTEGRASI outbox transaksional (09 §4) — PostgreSQL sungguhan.
 *
 * Dilewati tanpa `OUTBOX_TEST_PG_URL` (URL superuser ke PostgreSQL SEKALI PAKAI
 * di 127.0.0.1/localhost — URL lain DITOLAK, sebab tes ini membuat dan
 * menghapus basis data):
 *
 *   docker run --rm -d --name uji-outbox -e POSTGRES_PASSWORD=uji -p 127.0.0.1:55447:5432 postgres:17-alpine
 *   OUTBOX_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55447/postgres bunx vitest run tests/outbox.integration.test.ts
 *   docker stop uji-outbox
 *
 * Yang dibuktikannya:
 *   1. ATOMISITAS — peristiwa yang ditulis di transaksi yang di-rollback ikut
 *      hilang; klien non-transaksi DITOLAK; tabrakan dedupe tidak membatalkan
 *      transaksi domain.
 *   2. IDEMPOTENSI RELAY — keadaan "relay mati di antara terbit dan tandai"
 *      (pekerjaan sudah ada di `jobs`, baris outbox belum bertanda) diselesaikan
 *      tanpa pekerjaan kedua; dua relay serentak atas satu buku (`SKIP LOCKED`)
 *      menerbitkan setiap baris tepat sekali.
 *   3. FAN-OUT — setiap buku dimasuki dengan konteksnya sendiri: id outbox yang
 *      sama di dua buku jadi dua pekerjaan berkunci berbeda dengan
 *      `company_id` yang benar; buku yang tak terjangkau gagal SENDIRIAN.
 *   4. Retensi hanya membuang baris yang sudah terbit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { AKAR_REPO } from "./akar-sumber";

const URL_UJI = process.env.OUTBOX_TEST_PG_URL ?? "";
const jalan = URL_UJI !== "" ? describe : describe.skip;

function migrasi(jenis: "company" | "control"): string[] {
  const akar = join(AKAR_REPO, "prisma", "postgresql", jenis);
  return readdirSync(akar)
    .filter((d) => /^\d{4}_/.test(d))
    .sort()
    .map((d) => readFileSync(join(akar, d, "migration.sql"), "utf8"));
}

jalan("outbox transaksional — PostgreSQL sungguhan", () => {
  const jejak = Date.now();
  const namaKendali = `uji_outbox_ctl_${jejak}`;
  const namaA = `uji_outbox_a_${jejak}`;
  const namaB = `uji_outbox_b_${jejak}`;
  let admin: Client;
  const klien: Record<string, Client> = {};

  let outbox: typeof import("@/lib/outbox");
  let relay: typeof import("@/lib/outbox-relay");
  let ctx: typeof import("@/lib/company-context");
  let prismaMod: typeof import("@/lib/prisma");
  let q: typeof import("@sai/platform/job-queue");

  const bukuA = { id: 101, slug: "pt-a", tenantId: 7, databaseName: namaA, dbInstanceKey: null, dbInstance: null };
  const bukuB = { id: 102, slug: "pt-b", tenantId: 7, databaseName: namaB, dbInstanceKey: null, dbInstance: null };

  const diBuku = <T>(b: typeof bukuA, fn: () => Promise<T>) =>
    ctx.runWithCompany(ctx.companyContextOf(b), fn);

  beforeAll(async () => {
    const u = new URL(URL_UJI);
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) {
      throw new Error(`OUTBOX_TEST_PG_URL wajib menunjuk PostgreSQL sekali pakai lokal, bukan ${u.hostname}`);
    }
    admin = new Client({ connectionString: URL_UJI });
    await admin.connect();
    for (const [nama, jenis] of [
      [namaKendali, "control"],
      [namaA, "company"],
      [namaB, "company"],
    ] as const) {
      await admin.query(`CREATE DATABASE ${nama}`);
      /* Zona produksi: jam SQL yang lupa `AT TIME ZONE 'UTC'` akan meleset. */
      await admin.query(`ALTER DATABASE ${nama} SET timezone = 'Asia/Jakarta'`);
      const v = new URL(URL_UJI);
      v.pathname = `/${nama}`;
      const c = new Client({ connectionString: v.toString() });
      await c.connect();
      for (const sql of migrasi(jenis)) await c.query(sql);
      klien[nama] = c;
    }
    const ctl = new URL(URL_UJI);
    ctl.pathname = `/${namaKendali}`;
    process.env.CONTROL_DATABASE_URL = ctl.toString();
    process.env.COMPANY_DATABASE_URL_TEMPLATE = URL_UJI;

    outbox = await import("@/lib/outbox");
    relay = await import("@/lib/outbox-relay");
    ctx = await import("@/lib/company-context");
    prismaMod = await import("@/lib/prisma");
    q = await import("@sai/platform/job-queue");
  }, 180_000);

  afterAll(async () => {
    const { controlDb } = await import("@sai/core/control-db");
    await controlDb.$disconnect().catch(() => {});
    const { disconnectAllCompanyClients } = (await import("@/lib/company-clients")) as {
      disconnectAllCompanyClients?: () => Promise<void>;
    };
    await disconnectAllCompanyClients?.().catch(() => {});
    for (const c of Object.values(klien)) await c.end().catch(() => {});
    for (const n of [namaKendali, namaA, namaB]) {
      await admin?.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`).catch(() => {});
    }
    await admin?.end().catch(() => {});
  });

  const jumlah = async (nama: string, sql: string) =>
    Number((await klien[nama]!.query<{ n: string }>(sql)).rows[0]!.n);

  const tulis = (b: typeof bukuA, invoiceId: number) =>
    diBuku(b, () =>
      prismaMod.prisma.$transaction((tx) =>
        outbox.emitOutboxEvent(tx, {
          type: "invoice.posted",
          aggregateId: invoiceId,
          payload: { invoiceId },
          dedupeKey: outbox.invoicePostedDedupeKey(invoiceId),
        })
      )
    );

  describe("atomisitas", () => {
    it("rollback transaksi domain MEMBUANG peristiwanya", async () => {
      await expect(
        diBuku(bukuA, () =>
          prismaMod.prisma.$transaction(async (tx) => {
            await outbox.emitOutboxEvent(tx, {
              type: "invoice.posted",
              aggregateId: 900,
              payload: { invoiceId: 900 },
              dedupeKey: outbox.invoicePostedDedupeKey(900),
            });
            throw new Error("tulisan domain gagal sesudah peristiwa ditulis");
          })
        )
      ).rejects.toThrow(/tulisan domain gagal/);
      expect(await jumlah(namaA, `SELECT count(*) AS n FROM outbox WHERE aggregate_id = 900`)).toBe(0);
    });

    it("commit menyimpan peristiwanya, dan klien biasa DITOLAK", async () => {
      expect(await tulis(bukuA, 901)).toBe(true);
      expect(await jumlah(namaA, `SELECT count(*) AS n FROM outbox WHERE aggregate_id = 901`)).toBe(1);
      await expect(
        diBuku(bukuA, () =>
          outbox.emitOutboxEvent(prismaMod.prisma as never, {
            type: "invoice.posted",
            aggregateId: 902,
            payload: {},
            dedupeKey: outbox.invoicePostedDedupeKey(902),
          })
        )
      ).rejects.toBeInstanceOf(outbox.OutboxOutsideTransactionError);
    });

    it("tabrakan dedupe di dalam transaksi TIDAK membatalkan tulisan domainnya", async () => {
      const hasil = await diBuku(bukuA, () =>
        prismaMod.prisma.$transaction(async (tx) => {
          const kedua = await outbox.emitOutboxEvent(tx, {
            type: "invoice.posted",
            aggregateId: 901,
            payload: { invoiceId: 901 },
            dedupeKey: outbox.invoicePostedDedupeKey(901),
          });
          /* Transaksi masih hidup sesudah tabrakan: kueri berikutnya berhasil. */
          const r = await tx.$queryRaw<{ ok: number }[]>`SELECT 1::int AS ok`;
          return { kedua, ok: r[0]!.ok };
        })
      );
      expect(hasil).toEqual({ kedua: false, ok: 1 });
      expect(await jumlah(namaA, `SELECT count(*) AS n FROM outbox WHERE aggregate_id = 901`)).toBe(1);
    });
  });

  describe("relay", () => {
    it("crash di antara TERBIT dan TANDAI tidak menerbitkan dua kali", async () => {
      await tulis(bukuB, 500);
      const id = Number((await klien[namaB]!.query(`SELECT id FROM outbox WHERE aggregate_id = 500`)).rows[0].id);
      /* Keadaan sesudah relay mati: pekerjaannya SUDAH di jobs, barisnya belum bertanda. */
      const kunci = relay.outboxJobDedupeKey(bukuB.id, id, "document.invoice_send");
      expect(
        await q.publishJob({ kind: "document.invoice_send", companyId: bukuB.id, payload: { invoiceId: 500 }, dedupeKey: kunci })
      ).not.toBeNull();

      const r = await diBuku(bukuB, () => relay.relayBook({ id: bukuB.id, tenantId: 7 }, q.publishJob));
      expect(r).toMatchObject({ published: 1, alreadyPublished: 1, failed: 0, unpublishedCount: 0 });
      expect(await jumlah(namaKendali, `SELECT count(*) AS n FROM jobs WHERE dedupe_key = '${kunci}'`)).toBe(1);

      /* Putaran berikutnya: tidak ada yang tersisa, tidak ada pekerjaan baru. */
      const lagi = await diBuku(bukuB, () => relay.relayBook({ id: bukuB.id, tenantId: 7 }, q.publishJob));
      expect(lagi.published).toBe(0);
      expect(await jumlah(namaKendali, `SELECT count(*) AS n FROM jobs WHERE company_id = ${bukuB.id}`)).toBe(1);
    });

    it("published_at ditulis dalam jam UTC, bukan jam sesi WIB", async () => {
      const r = await klien[namaB]!.query<{ selisih: string }>(
        `SELECT abs(extract(epoch FROM published_at - (now() AT TIME ZONE 'UTC')))::text AS selisih
         FROM outbox WHERE aggregate_id = 500`
      );
      expect(Number(r.rows[0]!.selisih)).toBeLessThan(60);
    });

    it("penerbitan yang gagal DITUNDA dan dicatat, bukan dibuang atau diulang tiap putaran", async () => {
      await tulis(bukuB, 501);
      const gagal: import("@/lib/outbox-relay").PublishFn = async () => {
        throw new Error("kendali tak terjangkau");
      };
      const r = await diBuku(bukuB, () => relay.relayBook({ id: bukuB.id, tenantId: 7 }, gagal));
      expect(r).toMatchObject({ published: 0, failed: 1, unpublishedCount: 1 });
      const baris = (
        await klien[namaB]!.query(
          `SELECT attempts, last_error, next_attempt_at > (now() AT TIME ZONE 'UTC') AS ditunda FROM outbox WHERE aggregate_id = 501`
        )
      ).rows[0];
      expect(baris).toMatchObject({ attempts: 1, ditunda: true });
      expect(baris.last_error).toMatch(/kendali tak terjangkau/);
      /* Masih ditunda: putaran berikutnya tidak menyentuhnya. */
      const segera = await diBuku(bukuB, () => relay.relayBook({ id: bukuB.id, tenantId: 7 }, q.publishJob));
      expect(segera.published).toBe(0);
      /* Jendelanya lewat → terbit. */
      await klien[namaB]!.query(`UPDATE outbox SET next_attempt_at = NULL WHERE aggregate_id = 501`);
      const nanti = await diBuku(bukuB, () => relay.relayBook({ id: bukuB.id, tenantId: 7 }, q.publishJob));
      expect(nanti).toMatchObject({ published: 1, unpublishedCount: 0 });
    });

    it("dua relay serentak atas SATU buku menerbitkan setiap baris tepat sekali (SKIP LOCKED)", async () => {
      for (let i = 0; i < 30; i++) await tulis(bukuA, 1000 + i);
      const sebelum = await jumlah(namaKendali, `SELECT count(*) AS n FROM jobs WHERE company_id = ${bukuA.id}`);
      const belum = await jumlah(namaA, `SELECT count(*) AS n FROM outbox WHERE published_at IS NULL`);
      const [r1, r2] = await Promise.all([
        diBuku(bukuA, () => relay.relayBook({ id: bukuA.id, tenantId: 7 }, q.publishJob, { batchSize: 100 })),
        diBuku(bukuA, () => relay.relayBook({ id: bukuA.id, tenantId: 7 }, q.publishJob, { batchSize: 100 })),
      ]);
      expect(r1.published + r2.published).toBe(belum);
      expect(r1.alreadyPublished + r2.alreadyPublished).toBe(0);
      expect(await jumlah(namaKendali, `SELECT count(*) AS n FROM jobs WHERE company_id = ${bukuA.id}`)).toBe(
        sebelum + belum
      );
    });
  });

  describe("fan-out", () => {
    it("id outbox yang sama di dua buku = dua pekerjaan, company_id benar; buku tak terjangkau gagal sendirian", async () => {
      /* Kosongkan antrean & outbox supaya id-nya sejajar di kedua buku. */
      await klien[namaKendali]!.query(`DELETE FROM jobs`);
      for (const n of [namaA, namaB]) {
        await klien[n]!.query(`DELETE FROM outbox`);
        await klien[n]!.query(`ALTER SEQUENCE outbox_id_seq RESTART WITH 1`);
      }
      await tulis(bukuA, 1);
      await tulis(bukuB, 1);
      const hilang = { ...bukuB, id: 103, slug: "pt-hilang", databaseName: `uji_outbox_tidak_ada_${jejak}` };

      const hasil = await relay.relayPass([bukuA, bukuB, hilang], { publish: q.publishJob, concurrency: 2 });
      expect(hasil.map((h) => [h.book.slug, h.result?.published ?? null, h.error === null])).toEqual([
        ["pt-a", 1, true],
        ["pt-b", 1, true],
        ["pt-hilang", null, false],
      ]);
      const jobs = (
        await klien[namaKendali]!.query(`SELECT company_id, tenant_id, dedupe_key, payload FROM jobs ORDER BY company_id`)
      ).rows;
      expect(jobs.map((j) => [j.company_id, j.tenant_id, j.dedupe_key])).toEqual([
        [101, 7, "outbox:101:1:document.invoice_send"],
        [102, 7, "outbox:102:1:document.invoice_send"],
      ]);
      expect(jobs[0].payload).toMatchObject({ invoiceId: 1, outboxId: 1, eventType: "invoice.posted" });
    });

    it("retensi hanya membuang baris yang SUDAH terbit", async () => {
      await tulis(bukuA, 77);
      await klien[namaA]!.query(
        `UPDATE outbox SET published_at = (now() AT TIME ZONE 'UTC') - interval '30 days' WHERE aggregate_id = 1`
      );
      const dibuang = await diBuku(bukuA, () => relay.pruneOutbox(14));
      expect(dibuang).toBe(1);
      expect(await jumlah(namaA, `SELECT count(*) AS n FROM outbox WHERE aggregate_id = 77`)).toBe(1);
    });
  });
});
