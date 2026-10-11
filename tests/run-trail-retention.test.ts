/**
 * ATURAN PEMANGKASAN JEJAK — diuji sebagai FUNGSI MURNI.
 *
 * Sebuah `DELETE` yang salah tidak punya langkah balik, dan satu-satunya yang
 * tahu apakah aturannya benar adalah berkas ini. Karena itu putusannya hidup
 * sebagai fungsi (`lib/run-trail-retention.ts`) dan diuji di sini — bukan lewat
 * basis data, tempat setiap pembuktian menuntut penyiapan yang sulit diulang.
 *
 * Yang paling penting di berkas ini BUKAN tes yang membuktikan sesuatu
 * TERPANGKAS, melainkan empat yang membuktikan sesuatu TERTAHAN. Pemangkasan
 * yang menghapus terlalu sedikit hanya membuat tabel gemuk; yang menghapus
 * terlalu banyak menghapus BUKTI — dan selalu bukti yang dicari orang pada hari
 * ia paling dibutuhkan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TRAIL_RETENTION_DAYS,
  decideTrailPrune,
  trailCutoff,
  type TrailRow,
} from "@/lib/run-trail-retention";

const SEKARANG = new Date("2026-10-11T12:00:00.000Z");
const hariLalu = (n: number) => new Date(SEKARANG.getTime() - n * 24 * 3_600_000);

/** Baris `ok` berumur `n` hari. */
const ok = (id: number, n: number): TrailRow => ({ id, finishedAt: hariLalu(n), status: "ok" });
const gagal = (id: number, n: number, status = "error"): TrailRow => ({
  id,
  finishedAt: hariLalu(n),
  status,
});

describe("ambangnya", () => {
  it("90 hari — berjangka pekan sampai kuartal, seperti pertanyaan yang dijawabnya", () => {
    expect(TRAIL_RETENTION_DAYS).toBe(90);
  });

  it("`trailCutoff` bisa dihitung tanpa satu baris pun", () => {
    expect(trailCutoff(SEKARANG, 90).toISOString()).toBe("2026-07-13T12:00:00.000Z");
  });

  it("ikut dipulangkan, supaya pemanggilnya tidak menebak", () => {
    expect(decideTrailPrune([], SEKARANG).cutoff).toEqual(trailCutoff(SEKARANG));
  });
});

describe("aturan 1 — yang masih DALAM ambang tidak disentuh", () => {
  it("baris muda dibiarkan, walau banyak", () => {
    const rows = [ok(1, 1), ok(2, 30), ok(3, 89)];
    expect(decideTrailPrune(rows, SEKARANG).prune).toEqual([]);
  });

  it("tepat DI ambang belum dipangkas — hanya yang lebih tua", () => {
    expect(decideTrailPrune([ok(1, 90), ok(2, 1)], SEKARANG).prune).toEqual([]);
    expect(decideTrailPrune([ok(1, 91), ok(2, 1)], SEKARANG).prune).toEqual([1]);
  });

  it("tabel kosong tidak menghasilkan pekerjaan", () => {
    const putusan = decideTrailPrune([], SEKARANG);
    expect(putusan.prune).toEqual([]);
    expect(putusan.kept).toEqual([]);
  });
});

describe("aturan 2 — KEGAGALAN tidak pernah dipangkas, seberapa pun tua", () => {
  it("`error` berumur dua tahun tetap tinggal", () => {
    const rows = [gagal(1, 730), ok(2, 1)];
    const putusan = decideTrailPrune(rows, SEKARANG);
    expect(putusan.prune).toEqual([]);
    expect(putusan.kept).toEqual([{ id: 1, reason: "status-bukan-ok" }]);
  });

  it("`findings` juga — status apa pun selain `ok`", () => {
    /* `conformance_runs` memakai `findings`, dan itu justru isi yang dibaca
       orang. Aturannya sengaja ditulis sebagai "bukan ok", bukan sebagai
       daftar nilai — nilai baru tidak boleh diam-diam menjadi bisa dipangkas. */
    const putusan = decideTrailPrune([gagal(1, 500, "findings"), ok(2, 1)], SEKARANG);
    expect(putusan.prune).toEqual([]);
    expect(putusan.kept[0]).toEqual({ id: 1, reason: "status-bukan-ok" });
  });

  it("status yang belum pernah ada pun ditahan, bukan dipangkas", () => {
    expect(decideTrailPrune([gagal(1, 500, "status-masa-depan")], SEKARANG).prune).toEqual([]);
  });
});

describe("aturan 3 — baris TERAKHIR selalu tinggal (layanan yang sudah lama mati)", () => {
  it("penjadwal yang berhenti 100 hari lalu TIDAK kehilangan jejaknya", () => {
    /*
     * ══ INI CACAT YANG PALING BERBAHAYA ═══════════════════════════════════
     * Seluruh tabel lebih tua dari ambang, jadi aturan 1 tidak melindungi apa
     * pun. Pemangkasan naif mengosongkan tabelnya — dan tabel kosong terbaca
     * sebagai "belum pernah jalan" (`unknown`), bukan "berhenti pada tanggal
     * X". Pemangkasan yang MENYEMBUNYIKAN kegagalan lebih buruk daripada
     * tabel yang gemuk.
     */
    const rows = [ok(1, 120), ok(2, 110), ok(3, 100)];
    const putusan = decideTrailPrune(rows, SEKARANG);
    expect(putusan.prune).toEqual([1, 2]);
    expect(putusan.kept).toContainEqual({ id: 3, reason: "baris-terakhir" });
    // Tabelnya TIDAK kosong sesudah pemangkasan.
    expect(putusan.prune).not.toContain(3);
  });

  it("satu baris tua sendirian tidak pernah dihapus", () => {
    expect(decideTrailPrune([ok(1, 400)], SEKARANG).prune).toEqual([]);
  });

  it("`id` jadi pemutus saat stempel waktunya identik", () => {
    /* Dua putaran dalam milidetik yang sama tidak boleh membuat "baris
       terakhir" bergantung pada urutan yang dikembalikan basis data. */
    const sama = hariLalu(200);
    const rows: TrailRow[] = [
      { id: 7, finishedAt: sama, status: "ok" },
      { id: 9, finishedAt: sama, status: "ok" },
      { id: 8, finishedAt: sama, status: "ok" },
    ];
    const putusan = decideTrailPrune(rows, SEKARANG);
    expect(putusan.kept).toContainEqual({ id: 9, reason: "baris-terakhir" });
    expect(putusan.prune.sort()).toEqual([7, 8]);
  });
});

describe("aturan 4 — `ok` TERAKHIR selalu tinggal (bukti pernah berhasil)", () => {
  it("cadangan yang berhasil sekali lalu gagal setahun TETAP punya buktinya", () => {
    /*
     * ══ CACAT KEDUA, DAN IA KHAS `backup_runs` ════════════════════════════
     * `lib/health-report.ts` membaca baris `ok` TERAKHIR secara terpisah
     * (`where: { status: "ok" }`) untuk menjawab "kapan terakhir berhasil".
     * Memangkas baris `ok` tua itu mengubah "berhasil terakhir 4 bulan lalu"
     * — kalimat yang berguna — menjadi "tidak pernah berhasil", yang menghapus
     * satu-satunya petunjuk bahwa mekanismenya pernah bekerja.
     */
    const rows = [ok(1, 200), gagal(2, 150), gagal(3, 100), gagal(4, 1)];
    const putusan = decideTrailPrune(rows, SEKARANG);
    expect(putusan.prune).toEqual([]);
    expect(putusan.kept).toContainEqual({ id: 1, reason: "ok-terakhir" });
  });

  it("hanya `ok` TERAKHIR yang ditahan — yang lebih tua tetap dipangkas", () => {
    const rows = [ok(1, 300), ok(2, 200), gagal(3, 1)];
    const putusan = decideTrailPrune(rows, SEKARANG);
    expect(putusan.prune).toEqual([1]);
    expect(putusan.kept).toContainEqual({ id: 2, reason: "ok-terakhir" });
  });

  it("aturan 3 menang atas aturan 4 saat barisnya sama — satu sebab, bukan dua", () => {
    const rows = [ok(1, 300), ok(2, 200)];
    const putusan = decideTrailPrune(rows, SEKARANG);
    expect(putusan.prune).toEqual([1]);
    expect(putusan.kept).toEqual([{ id: 2, reason: "baris-terakhir" }]);
  });
});

describe("keadaan produksi 11 Okt 2026 — tidak ada yang hilang hari ini", () => {
  it("1.251 baris penjadwal (1.246 ok + 5 error) sepanjang ~70 hari: NOL dipangkas", () => {
    /* Jejak terlamanya 2026-08-02, yaitu 70 hari — masih di dalam ambang. Jadi
       pemangkasan ini PREVENTIF, dan tes ini mengunci fakta itu: kalau suatu
       perubahan membuatnya mulai menghapus baris hari ini, itu regresi. */
    const rows: TrailRow[] = Array.from({ length: 1246 }, (_, i) => ok(i + 1, 1 + (i % 70)));
    for (let i = 0; i < 5; i++) rows.push(gagal(2000 + i, 10 + i));
    expect(decideTrailPrune(rows, SEKARANG).prune).toEqual([]);
  });

  it("54 baris cadangan, SEMUANYA error: nol dipangkas, selamanya", () => {
    /* Keadaan nyata per 11 Okt 2026. Bahkan sesudah bertahun-tahun, aturan 2
       membuat tabel ini tidak pernah kehilangan satu baris pun — dan itu
       memang yang diinginkan: 54 kegagalan berurutan adalah ceritanya. */
    const rows: TrailRow[] = Array.from({ length: 54 }, (_, i) => gagal(i + 1, 400 + i));
    expect(decideTrailPrune(rows, SEKARANG).prune).toEqual([]);
  });
});

describe("kabelnya tidak boleh dicabut diam-diam", () => {
  const baca = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("skripnya memakai putusan ini, bukan menulis aturannya sendiri", () => {
    const skrip = baca("scripts/prune-run-trails.ts");
    expect(skrip).toContain("decideTrailPrune");
    expect(skrip).toContain("run-trail-retention");
    /* Tidak boleh ada `where` berbasis tanggal di skripnya: itu akan menjadi
       aturan KEDUA yang menyimpang dari yang diuji di sini. */
    expect(skrip).not.toMatch(/finishedAt:\s*\{\s*lt/);
  });

  it("ketiga tabel jejak ikut dipangkas — tak ada yang tertinggal", () => {
    const skrip = baca("scripts/prune-run-trails.ts");
    for (const t of ["schedulerRun", "backupRun", "conformanceRun"]) {
      expect(skrip, `${t} tidak ikut dipangkas`).toContain(t);
    }
  });

  it("dipanggil putaran penjadwal, PALING AKHIR", () => {
    /*
     * Ia satu-satunya mata rantai yang MENGHAPUS. Di belakang berarti putaran
     * yang mati di tengah berhenti pada pekerjaan yang masih bisa diulang —
     * bukan pada satu-satunya yang tidak punya langkah balik.
     */
    const compose = baca("docker-compose.yml");
    expect(compose).toContain("langkah prune:trails bun run prune:trails");
    const langkah = [...compose.matchAll(/^\s*langkah (\S+) bun run/gm)].map((m) => m[1]!);
    expect(langkah.length).toBeGreaterThan(1);
    expect(langkah[langkah.length - 1]).toBe("prune:trails");
  });

  it("modulnya tetap MURNI — tanpa Prisma, tanpa impor apa pun", () => {
    const modul = baca("src/lib/run-trail-retention.ts");
    const impor = modul.match(/^\s*import\b.*$/gm) ?? [];
    expect(impor, "modul putusan ini seharusnya tidak mengimpor apa pun").toHaveLength(0);
  });
});
