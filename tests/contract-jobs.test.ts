/**
 * PENJAGA tahap 1a — kontrak pekerjaan, aritmetika antrean, dan bentuk SQL-nya.
 *
 * Tiga berkas harus menyatakan hal yang sama tentang tabel `jobs`:
 * `contract/kinds.yaml`, skema Prisma kendali, dan migration kendali 0006.
 * Ketiganya bisa menyimpang TANPA SATU GALAT KOMPILASI — dan bentuk
 * penyimpangannya sudah bisa diramalkan: `kind` yang tidak diklaim siapa pun
 * menumpuk sebagai baris `queued` selamanya, dan status yang tidak ada di
 * CHECK ditolak basis data pada pekerjaan pertama di produksi.
 *
 * SQL-nya tidak bisa dijalankan tanpa basis data, jadi yang dijaga BENTUKNYA —
 * idiom yang sama dengan `tests/backup-script.test.ts`. Yang diperiksa bukan
 * "apakah jalan" melainkan sifat-sifat yang kalau hilang tidak menghasilkan
 * galat apa pun: klaim satu pernyataan, parameter terikat, dan setiap tulisan
 * terkunci pada pemilik lease-nya.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JOB_KINDS,
  JOB_LANES,
  JOB_STATUSES,
  KINDS_BY_LANE,
  isJobKind,
  isJobStatus,
  type JobKind,
} from "@sai/core/generated/job-kinds";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  LEASE_RENEW_MS,
  LEASE_STALE_FACTOR,
  LEASE_STALE_MS,
  backoffMs,
  isDead,
  queueAgeMs,
} from "@sai/core/job-backoff";

const akar = process.cwd();
const baca = (...p: string[]) => readFileSync(join(akar, ...p), "utf8");

const SKEMA = baca("packages", "db", "prisma", "control", "schema.prisma");
const MIGRATION = baca("prisma", "postgresql", "control", "0006_jobs", "migration.sql");
const QUEUE = baca("packages", "platform", "src", "job-queue.ts");

/** Badan model `Job` di skema kendali. */
const MODEL_JOB = (() => {
  const i = SKEMA.indexOf("model Job {");
  expect(i, "model Job tidak ada di skema kendali").toBeGreaterThan(-1);
  return SKEMA.slice(i, SKEMA.indexOf("\n}", i));
})();

describe("kontrak: berkas bangkitan tidak boleh basi", () => {
  it("`contract:gen --cek` lolos", () => {
    /* Berkas bangkitan yang di-commit dalam keadaan basi adalah penyimpangan
       yang paling sulit terlihat: semuanya tetap mengompilasi, dan yang salah
       hanya ARTI-nya. Hanya pemeriksaan inilah yang menangkapnya. */
    expect(() =>
      execFileSync("bun", ["scripts/contract-generate.ts", "--cek"], {
        cwd: akar,
        stdio: "pipe",
      })
    ).not.toThrow();
  });
});

describe("kontrak: invarian I-2 — pintu posting tunggal", () => {
  it("hanya jalur `ledger` yang punya kind penulis buku", () => {
    for (const [nama, spec] of Object.entries(JOB_KINDS)) {
      if (spec.writesLedger) expect(spec.lane, nama).toBe("ledger");
    }
  });

  it("jalur `ledger` memang ada dan tunggal-instans", () => {
    // Dua proses jalur `ledger` = dua mesin menulis buku besar.
    expect(JOB_LANES.ledger.singleInstance).toBe(true);
  });

  it("generator MENOLAK kind penulis buku di luar jalur `ledger`", () => {
    /* Ditegakkan di generator, bukan hanya di tes ini: pintu posting kedua
       tidak boleh bisa LAHIR dari kontrak. */
    const gen = baca("scripts", "contract-generate.ts");
    expect(gen).toContain("writes_ledger");
    expect(gen).toMatch(/kind\.lane !== "ledger"/);
    expect(gen).toMatch(/I-2/);
  });
});

describe("kontrak: setiap kind punya jalur yang mengklaimnya", () => {
  it("setiap kind muncul TEPAT sekali di `KINDS_BY_LANE`", () => {
    /* Inti kegagalan senyap yang kontrak ini ada untuk mencegah: `kind` yang
       diterbitkan tapi tidak diklaim satu jalur pun menumpuk sebagai baris
       `queued` selamanya — tanpa galat, tanpa pekerja yang mengeluh. */
    const terdaftar = Object.values(KINDS_BY_LANE).flat();
    const semua = Object.keys(JOB_KINDS) as JobKind[];
    expect([...terdaftar].sort()).toEqual([...semua].sort());
    expect(new Set(terdaftar).size).toBe(terdaftar.length);
  });

  it("setiap jalur di `JOB_LANES` punya entri di `KINDS_BY_LANE`", () => {
    for (const lane of Object.keys(JOB_LANES)) {
      expect(KINDS_BY_LANE, lane).toHaveProperty(lane);
    }
  });

  it("penjaga tipe menolak nilai asing", () => {
    expect(isJobKind("report.export")).toBe(true);
    expect(isJobKind("report.tidak-ada")).toBe(false);
    expect(isJobStatus("queued")).toBe(true);
    expect(isJobStatus("pending")).toBe(false);
  });
});

describe("kontrak: max_attempts yang disengaja", () => {
  it("impor dan migration TIDAK diulang otomatis", () => {
    /* `import.process` yang diulang setelah gagal separuh jalan adalah cara
       tercepat menggandakan data master; migration yang gagal separuh jalan
       menuntut mata manusia. Keduanya sengaja 1, dan menaikkannya adalah
       keputusan — bukan penyetelan. */
    expect(JOB_KINDS["import.process"].maxAttempts).toBe(1);
    expect(JOB_KINDS["schema.migrate"].maxAttempts).toBe(1);
  });

  it("integrasi luar diberi percobaan lebih banyak", () => {
    // Layanan pihak lain memang kadang mati sebentar.
    expect(JOB_KINDS["integration.efaktur"].maxAttempts).toBeGreaterThanOrEqual(5);
  });
});

describe("skema, migration, dan kontrak menyatakan hal yang sama", () => {
  it("CHECK status di migration = daftar status di kontrak", () => {
    const m = MIGRATION.match(/"status" IN \(([^)]+)\)/);
    expect(m, "CHECK status tidak ada di migration").not.toBeNull();
    const diSql = m![1]!
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(diSql).toEqual([...JOB_STATUSES].sort());
  });

  it("setiap kolom model Prisma ada di migration", () => {
    const kolom = [
      "kind",
      "tenant_id",
      "company_id",
      "payload",
      "status",
      "dedupe_key",
      "attempts",
      "max_attempts",
      "run_after",
      "claimed_at",
      "claimed_by",
      "last_error",
      "result_ref",
      "priority",
      "cancel_requested",
      "progress",
      "finished_at",
    ];
    for (const k of kolom) expect(MIGRATION, k).toContain(`"${k}"`);
  });

  it("`dedupe_key` UNIK — itu yang menggantikan leader election", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX "jobs_dedupe_key_key"/);
    expect(MODEL_JOB).toMatch(/dedupeKey\s+String\?\s+@unique/);
  });

  it("`jobs` TIDAK punya FK ke tenant atau company", () => {
    /* Pekerjaan harus tetap terbaca setelah yang dirujuknya dihapus — jejak
       yang hilang bersama tenantnya tidak bisa menjawab "apa yang terjadi
       sebelum dihapus". */
    expect(MIGRATION).not.toMatch(/FOREIGN KEY/i);
    expect(MODEL_JOB).not.toMatch(/@relation/);
  });

  it("payload-nya JSONB, bukan teks", () => {
    expect(MIGRATION).toMatch(/"payload" JSONB NOT NULL/);
  });
});

describe("migration: indeks berpredikat, bukan indeks biasa", () => {
  it("pengambilan memakai *partial index* dengan urutan yang sama", () => {
    /* Tanpa predikatnya, indeksnya tumbuh seiring SELURUH riwayat dan
       pengambilan melambat berbanding jumlah pekerjaan yang pernah ada — bukan
       yang menunggu. Urutan di indeks membuat `ORDER BY` pada klaim tidak
       menuntut sort. */
    expect(MIGRATION).toMatch(
      /CREATE INDEX "jobs_ambil_idx"[\s\S]{0,160}WHERE "status" = 'queued'/
    );
    expect(MIGRATION).toMatch(/"priority" DESC, "run_after" ASC/);
  });

  it("reclaim dan pengarsipan juga berpredikat", () => {
    expect(MIGRATION).toMatch(/"jobs_reclaim_idx"[\s\S]{0,160}WHERE "status" = 'claimed'/);
    expect(MIGRATION).toMatch(/"jobs_arsip_idx"[\s\S]{0,200}WHERE "status" IN \('done', 'dead'\)/);
  });

  it("autovacuum disetel lebih agresif pada tabel ini saja", () => {
    /* Setiap klaim, pembaruan lease, dan penyelesaian adalah versi baris baru.
       Bawaan 20% berarti tabel sejuta baris menunggu 200 ribu baris mati. */
    expect(MIGRATION).toMatch(/ALTER TABLE "jobs" SET \(/);
    expect(MIGRATION).toContain("autovacuum_vacuum_scale_factor");
    expect(MIGRATION.match(/ALTER TABLE/g) ?? []).toHaveLength(1);
  });
});

describe("SQL antrean: sifat yang hilangnya tidak menghasilkan galat", () => {
  it("klaim adalah SATU pernyataan dengan `FOR UPDATE SKIP LOCKED`", () => {
    /* `SELECT … FOR UPDATE SKIP LOCKED` lalu `UPDATE` terpisah lolos setiap
       pengujian satu pekerja, dan gagal di produksi: dua pekerja memilih baris
       yang sama di celah antara dua pernyataan. */
    const i = QUEUE.indexOf("export async function claimJob");
    expect(i).toBeGreaterThan(-1);
    const badan = QUEUE.slice(i, QUEUE.indexOf("\n}", i));
    expect(badan).toContain("FOR UPDATE SKIP LOCKED");
    expect(badan).toMatch(/UPDATE jobs SET status = 'claimed'[\s\S]*WHERE id = \(\s*SELECT id/);
    expect(badan.match(/\$queryRaw|\$executeRaw/g) ?? []).toHaveLength(1);
  });

  it("setiap tulisan pekerja terkunci pada pemilik lease-nya", () => {
    /* Tanpa `claimed_by = $worker`, pekerja yang lease-nya sudah kedaluwarsa
       tetap bisa menulis hasil ke pekerjaan yang kini milik pekerja lain — dua
       hasil untuk satu pekerjaan, dan yang terakhir menang. */
    for (const fn of ["renewLease", "reportProgress", "completeJob"]) {
      const i = QUEUE.indexOf(`export async function ${fn}`);
      expect(i, fn).toBeGreaterThan(-1);
      const badan = QUEUE.slice(i, QUEUE.indexOf("\n}", i));
      expect(badan, fn).toContain("claimed_by = ${workerId}");
      expect(badan, fn).toContain("status = 'claimed'");
    }
  });

  it("penerbitan idempoten lewat `ON CONFLICT DO NOTHING`", () => {
    expect(QUEUE).toContain("ON CONFLICT (dedupe_key) DO NOTHING");
  });

  it("tidak ada interpolasi string ke dalam SQL", () => {
    /* Parameter terikat atau `Prisma.join` — tidak pernah
       `${nilai}` yang dirangkai sendiri ke teks kueri. */
    expect(QUEUE).not.toMatch(/\$queryRawUnsafe|\$executeRawUnsafe/);
  });

  it("reclaim memakai ambang lease, bukan perkiraan durasi pekerjaan", () => {
    expect(QUEUE).toContain("LEASE_STALE_MS");
    const i = QUEUE.indexOf("export async function reclaimStaleJobs");
    const badan = QUEUE.slice(i, QUEUE.indexOf("\n}", i));
    expect(badan).toContain("status = 'claimed'");
    expect(badan).toContain("attempts + 1");
  });

  it("antrean TIDAK menyentuh basis data penagihan (#137)", () => {
    // Membaca kemajuan pekerjaan ADALAH jalur panas.
    expect(QUEUE).not.toContain("platform-db");
    expect(QUEUE).not.toContain("platformDb");
  });
});

describe("backoff: angka yang salahnya tidak terlihat dari log", () => {
  const tetap = () => 0.5; // jitter nol

  it("naik secara eksponensial dari penundaan dasar", () => {
    expect(backoffMs(1, tetap)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2, tetap)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(3, tetap)).toBe(BACKOFF_BASE_MS * 4);
  });

  it("berplafon, dan percobaan yang sangat besar tidak melahirkan Infinity", () => {
    expect(backoffMs(40, tetap)).toBe(BACKOFF_MAX_MS);
    expect(Number.isFinite(backoffMs(1000, tetap))).toBe(true);
  });

  it("jitter ±25% dan tidak pernah di bawah satu detik", () => {
    /* Tanpa jitter, sepuluh pekerjaan yang gagal bersama mencoba lagi pada
       milidetik yang SAMA, berulang-ulang — memukul layanan yang sedang pulih
       dengan gelombang seirama, dan memperpanjang pemadaman yang seharusnya
       sudah lewat. */
    const bawah = backoffMs(1, () => 0);
    const atas = backoffMs(1, () => 1);
    expect(bawah).toBeLessThan(BACKOFF_BASE_MS);
    expect(atas).toBeGreaterThan(BACKOFF_BASE_MS);
    expect(bawah).toBeGreaterThanOrEqual(1_000);
    expect(atas - bawah).toBeLessThanOrEqual(BACKOFF_BASE_MS * 0.5 + 2);
  });

  it("percobaan nol atau negatif tetap menghasilkan penundaan yang sah", () => {
    for (const n of [0, -1, -99]) expect(backoffMs(n, tetap)).toBeGreaterThanOrEqual(1_000);
  });

  it("`isDead` habis tepat pada percobaan terakhir", () => {
    expect(isDead(2, 3)).toBe(false);
    expect(isDead(3, 3)).toBe(true);
    expect(isDead(4, 3)).toBe(true);
  });
});

describe("lease: ambangnya kelipatan interval, bukan dugaan durasi", () => {
  it("ambang reclaim = interval pembaruan × faktor", () => {
    /* Ambang yang diturunkan dari "berapa lama pekerjaan ini biasanya" selalu
       salah untuk ekspor 30 menit: ia melewati ambang mana pun yang masuk akal
       untuk mendeteksi pekerja mati, lalu diklaim pekerja kedua sementara yang
       pertama masih berjalan. */
    expect(LEASE_STALE_MS).toBe(LEASE_RENEW_MS * LEASE_STALE_FACTOR);
    expect(LEASE_STALE_FACTOR).toBeGreaterThanOrEqual(3);
  });

  it("memberi ruang untuk beberapa pembaruan yang terlewat", () => {
    expect(LEASE_STALE_MS / LEASE_RENEW_MS).toBeGreaterThanOrEqual(3);
  });
});

describe("observabilitas: yang diukur UMUR, bukan jumlah", () => {
  it("antrean kosong berumur nol, bukan tak terhingga", () => {
    expect(queueAgeMs(null)).toBe(0);
  });

  it("umur dihitung dari pekerjaan tertua yang menunggu", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(queueAgeMs(new Date("2026-10-20T09:30:00Z"), now)).toBe(1_800_000);
  });

  it("waktu yang 'di masa depan' tidak menghasilkan umur negatif", () => {
    // `run_after` boleh di masa depan (backoff), dan umur negatif akan terbaca
    // sebagai sehat oleh gerbang mana pun yang membandingkannya dengan ambang.
    const now = new Date("2026-10-20T10:00:00Z");
    expect(queueAgeMs(new Date("2026-10-20T11:00:00Z"), now)).toBe(0);
  });
});
