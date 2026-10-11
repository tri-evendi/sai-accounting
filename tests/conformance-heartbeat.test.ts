/**
 * PUTUSAN DENYUT PEMERIKSA KESESUAIAN — diuji sebagai FUNGSI MURNI.
 *
 * Ambang dan urutan putusannya adalah aturan, bukan perilaku permukaan. Menguji
 * lewat `/api/health` berarti menguji dua hal sekaligus dan tidak bisa
 * menyatakan yang mana yang salah — pola yang sama dengan
 * `scheduler-heartbeat.test.ts` dan `backup-heartbeat.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONFORMANCE_STALE_AFTER_HOURS,
  conformanceHealth,
} from "@/lib/conformance-heartbeat";

const SEKARANG = new Date("2026-10-11T12:00:00.000Z");
const jamLalu = (n: number) => new Date(SEKARANG.getTime() - n * 3_600_000);

describe("ambangnya", () => {
  it("sembilan hari — dua minggu yang hilang, bukan satu", () => {
    /*
     * Sapuannya MINGGUAN. Ambang tujuh hari akan berbunyi untuk satu putaran
     * yang bergeser karena deploy atau `timeout` — dan pemantauan yang berbunyi
     * untuk hal normal adalah pemantauan yang akhirnya diabaikan.
     */
    expect(CONFORMANCE_STALE_AFTER_HOURS).toBe(24 * 9);
  });

  it("ikut dilaporkan, supaya pembacanya tidak menebak", () => {
    expect(conformanceHealth(null, SEKARANG).staleAfterHours).toBe(CONFORMANCE_STALE_AFTER_HOURS);
  });
});

describe("`unknown` — dan ia TIDAK PERNAH `late`", () => {
  it("tanpa putaran sama sekali", () => {
    const h = conformanceHealth(null, SEKARANG);
    expect(h.status).toBe("unknown");
    expect(h.lastRunAt).toBeNull();
    expect(h.ageHours).toBeNull();
    /* Penting: bukan 0. "Belum pernah jalan" dan "jalan, nol temuan" adalah dua
       keadaan berbeda, dan 0 akan membuat yang pertama terbaca seperti yang
       kedua. */
    expect(h.findingCount).toBeNull();
    expect(h.companiesFailed).toBeNull();
  });

  it("putaran tanpa `finishedAt`", () => {
    expect(conformanceHealth({ finishedAt: null }, SEKARANG).status).toBe("unknown");
  });

  it("tanggal yang tidak sah", () => {
    expect(conformanceHealth({ finishedAt: new Date("bukan tanggal") }, SEKARANG).status).toBe(
      "unknown"
    );
  });

  it("pemasangan BARU tidak boleh berbunyi seperti pemasangan RUSAK", () => {
    // Inti pembedaan `unknown` vs `late`: "saya tidak tahu" dan "saya tahu, dan
    // jawabannya buruk" menuntut tindakan yang berbeda.
    expect(conformanceHealth(null, SEKARANG).status).not.toBe("late");
  });
});

describe("tiga keadaan yang berarti 'sapuannya berjalan'", () => {
  it("`ok` — dalam ambang, nol temuan", () => {
    const h = conformanceHealth({ finishedAt: jamLalu(2), findingCount: 0 }, SEKARANG);
    expect(h.status).toBe("ok");
    expect(h.ageHours).toBe(2);
    expect(h.findingCount).toBe(0);
  });

  it("`findings` — dalam ambang, TAPI menemukan sesuatu", () => {
    /*
     * BUKAN kegagalan layanan: pemeriksanya bekerja persis sebagaimana
     * mestinya. Dibedakan dari `ok` justru karena inilah keadaan yang harus
     * dibaca orang — menyatukannya mengubah alat berguna menjadi alat yang
     * selalu hijau.
     */
    const h = conformanceHealth({ finishedAt: jamLalu(1), findingCount: 609 }, SEKARANG);
    expect(h.status).toBe("findings");
    expect(h.findingCount).toBe(609);
  });

  it("`late` — putaran terakhir sudah lewat ambang", () => {
    const h = conformanceHealth({ finishedAt: jamLalu(24 * 10), findingCount: 0 }, SEKARANG);
    expect(h.status).toBe("late");
  });
});

describe("urutan putusan — dan kenapa urutannya begitu", () => {
  it("BASI mengalahkan ISINYA: temuan dari dua minggu lalu bukan kabar hari ini", () => {
    const h = conformanceHealth({ finishedAt: jamLalu(24 * 12), findingCount: 5 }, SEKARANG);
    expect(h.status).toBe("late");
  });

  it("buku yang GAGAL diperiksa membuatnya `late`, walau nol temuan", () => {
    /*
     * Buku yang tidak terperiksa BUKAN buku yang bersih. Menyatukannya dengan
     * `ok` adalah cara paling halus untuk kehilangan satu buku dari sapuan —
     * dan ia akan terbaca hijau selamanya.
     */
    const h = conformanceHealth(
      { finishedAt: jamLalu(1), findingCount: 0, companiesFailed: 2 },
      SEKARANG
    );
    expect(h.status).toBe("late");
    expect(h.companiesFailed).toBe(2);
  });

  it("buku yang gagal mengalahkan temuan juga", () => {
    const h = conformanceHealth(
      { finishedAt: jamLalu(1), findingCount: 7, companiesFailed: 1 },
      SEKARANG
    );
    expect(h.status).toBe("late");
  });

  it("tepat DI ambang masih `ok` — hanya yang MELEWATI yang `late`", () => {
    expect(
      conformanceHealth({ finishedAt: jamLalu(24 * 9), findingCount: 0 }, SEKARANG).status
    ).toBe("ok");
  });
});

describe("selisih jam container vs jam basis data", () => {
  it("tanggal MASA DEPAN jadi umur 0, bukan negatif", () => {
    const h = conformanceHealth(
      { finishedAt: new Date(SEKARANG.getTime() + 90_000), findingCount: 0 },
      SEKARANG
    );
    expect(h.ageHours).toBe(0);
    expect(h.status).toBe("ok");
  });
});

describe("kabelnya tidak boleh dicabut diam-diam", () => {
  const baca = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("`/api/health` benar-benar melaporkan bidang `conformance`", () => {
    /*
     * Pelajaran dari jejak cadangan: modul putusan yang benar tapi tidak
     * tersambung ke mana pun adalah modul yang tidak menjawab siapa pun.
     * Penjaga ini membaca SUMBER, jadi ia merah kalau kabelnya dicabut.
     */
    const laporan = baca("src/lib/health-report.ts");
    expect(laporan).toContain("conformance-heartbeat");
    expect(laporan).toContain("conformanceRun.findFirst");
    expect(laporan).toContain("conformance: conformanceStatus");
  });

  it("modulnya tetap MURNI — tanpa Prisma, tanpa `server-only`", () => {
    /*
     * Pemakainya `/api/health` (Next) dan skrip `tsx` di luar Next. Menarik
     * `server-only` ke sini akan mematikan yang kedua; mengimpor Prisma akan
     * membuat ambangnya tidak bisa diuji sebagai fungsi.
     */
    const modul = baca("src/lib/conformance-heartbeat.ts");
    /* Dicocokkan sebagai PERNYATAAN IMPOR, bukan sebagai kata. Versi pertama
       tes ini memakai `toContain("server-only")` dan langsung merah — sebab
       komentar modulnya MENJELASKAN bahwa ia tidak memakainya. Penjaga yang
       merah karena prosanya sendiri adalah penjaga yang akan dilonggarkan
       orang, bukan diperbaiki. */
    const impor = modul.match(/^\s*import\b.*$/gm) ?? [];
    expect(impor, "modul murni ini seharusnya tidak mengimpor apa pun").toHaveLength(0);
    expect(modul).not.toMatch(/^\s*import\s+"server-only"/m);
  });

  it("skrip pemeriksa menulis jejaknya dengan status yang dikenali putusan ini", () => {
    // Tiga nilai, dan ketiganya harus sama di kedua sisi. Nilai yang hanya ada
    // di satu sisi adalah baris jejak yang tidak akan pernah terbaca benar.
    const skrip = baca("scripts/check-data-conformance.ts");
    for (const status of ['"ok"', '"findings"', '"error"']) {
      expect(skrip).toContain(status);
    }
  });
});
