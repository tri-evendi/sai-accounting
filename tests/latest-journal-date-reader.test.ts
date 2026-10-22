/**
 * PEMBACA `MAX(journals.date)` — JANGKAR RETENSI UU KUP (#636)
 *
 * `makeLatestJournalDateReader` dipakai eksekusi hapus-tenant (konsol &
 * `scripts/execute-tenant-deletion.ts`) dan kesehatan tenant di konsol. Sampai
 * Okt 2026 ia memaku `createPool` milik driver `mariadb` terhadap URL
 * PostgreSQL: setiap pembacaan gagal tersambung, galatnya ditelan, dan jangkar
 * retensi diam-diam jatuh ke "hari ini". Tidak ada satu tes pun yang
 * menyentuhnya — karena itulah ia bisa senyap.
 *
 * Yang dibuktikan di sini, di tingkat driver `pg` (tidak ada PostgreSQL di
 * kotak tes, dan produksi tidak pernah disentuh tes):
 *
 *   1. Ia menyambung lewat driver `pg`, ke SERVER dari URL kendali, ke basis
 *      data MILIK PT itu — bukan ke basis data kendali.
 *   2. Ia mengirim `MAX("date") ... FROM journals` dan memulangkan tanggalnya
 *      apa adanya; buku tanpa jurnal → `null`.
 *   3. `AT TIME ZONE 'UTC'` ada: `journals.date` adalah `timestamp(3)` TANPA
 *      zona berisi UTC, dan tanpa itu `pg` mengurainya sebagai waktu LOKAL
 *      container — jangkar bergeser sejauh TZ.
 *   4. Buku tak terjangkau MELEMPAR (pemanggil yang mencatatnya sebagai
 *      `unreadableBooks`), dan koneksinya selalu ditutup.
 *   5. URL `mysql://` ditolak dengan pesan #636, bukan dicoba disambungi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  queries: [] as string[],
  ended: 0,
  /** Baris yang dipulangkan query berikutnya, atau galat yang dilempar `connect`. */
  rows: [] as Array<{ latest: Date | null }>,
  connectError: null as Error | null,
}));

vi.mock("pg", () => ({
  Client: class {
    constructor(config: Record<string, unknown>) {
      pg.configs.push(config);
    }
    async connect() {
      if (pg.connectError) throw pg.connectError;
    }
    async query(sql: string) {
      pg.queries.push(sql);
      return { rows: pg.rows, rowCount: pg.rows.length };
    }
    async end() {
      pg.ended += 1;
    }
  },
}));

/* `writes.ts` mengimpor klien kendali di tingkat modul; pembaca ini tidak
   memakainya, tetapi modulnya tidak boleh mencoba menyambung saat dimuat. */
vi.mock("@sai/core/control-db", () => ({ controlDb: {} }));

import { makeLatestJournalDateReader } from "@op/lib/operator/writes";

const CONTROL_URL = "postgres://sai:s%40ndi@pgbouncer:5432/sai_control";
const PT = { databaseName: "sai_t7_pt_maju", dbInstance: null };

beforeEach(() => {
  pg.configs.length = 0;
  pg.queries.length = 0;
  pg.ended = 0;
  pg.rows = [];
  pg.connectError = null;
});

describe("makeLatestJournalDateReader membaca MAX(journals.date) dari PostgreSQL", () => {
  it("menyambung lewat `pg` ke basis data PT itu, di server dari URL kendali", async () => {
    pg.rows = [{ latest: new Date("2026-09-30T00:00:00.000Z") }];
    await makeLatestJournalDateReader(CONTROL_URL)(PT);

    expect(pg.configs).toHaveLength(1);
    expect(pg.configs[0]).toMatchObject({
      host: "pgbouncer",
      port: 5432,
      user: "sai",
      password: "s@ndi",
      /* Basis data PT, BUKAN `sai_control` dari URL-nya. */
      database: "sai_t7_pt_maju",
    });
  });

  it("memulangkan tanggal jurnal termuda apa adanya", async () => {
    const termuda = new Date("2026-09-30T00:00:00.000Z");
    pg.rows = [{ latest: termuda }];

    const hasil = await makeLatestJournalDateReader(CONTROL_URL)(PT);

    expect(hasil).toBe(termuda);
    expect(pg.queries).toHaveLength(1);
    expect(pg.queries[0]).toMatch(/SELECT\s+MAX\("date"\)/i);
    expect(pg.queries[0]).toMatch(/FROM\s+journals\b/i);
  });

  it("menafsirkan `journals.date` sebagai UTC, bukan waktu lokal container", async () => {
    /* Diuji pada teks query yang benar-benar dikirim, bukan pada salinannya. */
    await makeLatestJournalDateReader(CONTROL_URL)(PT);
    expect(pg.queries[0]).toMatch(/MAX\("date"\)\s+AT TIME ZONE 'UTC'/i);
  });

  it("buku tanpa jurnal → null (bukan 'hari ini', bukan galat)", async () => {
    pg.rows = [{ latest: null }];
    expect(await makeLatestJournalDateReader(CONTROL_URL)(PT)).toBeNull();
    pg.rows = [];
    expect(await makeLatestJournalDateReader(CONTROL_URL)(PT)).toBeNull();
  });

  it("koneksinya selalu ditutup — satu koneksi pendek per buku", async () => {
    pg.rows = [{ latest: null }];
    const baca = makeLatestJournalDateReader(CONTROL_URL);
    await baca(PT);
    await baca({ databaseName: "sai_t7_pt_lain", dbInstance: null });
    expect(pg.configs).toHaveLength(2);
    expect(pg.ended).toBe(2);
  });

  it("buku tak terjangkau MELEMPAR — pemanggil yang mencatatnya, bukan jatuh diam-diam", async () => {
    pg.connectError = Object.assign(new Error('database "sai_t7_pt_maju" does not exist'), {
      code: "3D000",
    });
    await expect(makeLatestJournalDateReader(CONTROL_URL)(PT)).rejects.toThrow(/does not exist/);
  });

  it("URL `mysql://` DITOLAK dengan pesan #636 — tidak ada driver MariaDB untuk dicoba", async () => {
    await expect(
      makeLatestJournalDateReader("mysql://sai:x@db:3306/sai_control")(PT)
    ).rejects.toThrow(/MariaDB sudah dicabut.*#636/);
    expect(pg.configs).toHaveLength(0);
  });

  it("nama basis data yang tidak aman ditolak sebelum menyambung", async () => {
    await expect(
      makeLatestJournalDateReader(CONTROL_URL)({ databaseName: 'x"; DROP', dbInstance: null })
    ).rejects.toThrow();
    expect(pg.configs).toHaveLength(0);
  });
});
