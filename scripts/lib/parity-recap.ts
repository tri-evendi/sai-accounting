/**
 * Bagian bersama skrip paritas Rekap per Pihak, Laporan Kas & Bank, dan
 * Realisasi vs Anggaran (tahap 1d, gelombang A 23 Okt 2026). Yang umum untuk
 * SEMUA skrip paritas — transaksi READ ONLY, pemuat PT, pelapor — tetap di
 * `./parity.ts`; di sini hanya yang khusus ketiga laporan ini, supaya laporan
 * yang dipindah paralel tidak menyunting berkas yang sama.
 */
import { businessISODate } from "@sai/core/business-date";
import { list } from "./parity";

/** Rekap pihak yang diminta — argumen posisi pertama skrip (`package.json`). */
export function partyRecapKind(): "sales-by-customer" | "purchases-by-supplier" {
  const k = process.argv[2];
  if (k !== "sales-by-customer" && k !== "purchases-by-supplier") {
    console.error(`argumen pertama harus sales-by-customer|purchases-by-supplier, bukan ${String(k)}`);
    process.exit(2);
  }
  return k;
}

/**
 * `--cols "|party|gross,net"` → varian `?cols=` yang diperiksa paritas ISI
 * lembar; `|` memisahkan varian (koma milik nilainya), varian kosong = kolom
 * bawaan. Bawaannya diberikan pemanggil (per laporan).
 */
export function recapColumnVariants(raw: string | undefined, defaults: string[]): string[] {
  if (raw === undefined) return defaults;
  return raw.split("|").map((v) => v.trim());
}

/**
 * Periode Realisasi vs Anggaran: `--budget-period 2026-0,2026-10` (bulan 0 =
 * setahun penuh), atau LIMA bawaan — tahun berjalan penuh, bulan berjalan,
 * Januari tahun berjalan, tahun lalu penuh, dan Desember tahun lalu. Nilainya
 * MENTAH (`?year=&month=`): `resolveBudgetPeriod` di sisi TS dan penerbit Go
 * yang menyelesaikannya, persis seperti halaman.
 */
export function budgetPeriods(raw: string | undefined, now = new Date()): { year: string; month: string }[] {
  const asked = list(raw).map((p) => {
    const m = /^(\d{4})-(\d{1,2})$/.exec(p);
    if (!m || Number(m[2]) > 12) {
      console.error(`--budget-period bukan YYYY-M (M 0–12): ${p}`);
      process.exit(2);
    }
    return { year: m[1]!, month: String(Number(m[2])) };
  });
  if (asked.length > 0) return asked;
  const today = businessISODate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return [
    { year: String(year), month: "0" },
    { year: String(year), month: String(month) },
    { year: String(year), month: "1" },
    { year: String(year - 1), month: "0" },
    { year: String(year - 1), month: "12" },
  ];
}
