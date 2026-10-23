/**
 * Bagian bersama skrip paritas laporan STOK (tahap 1d, 09 §9):
 * `scripts/parity-stock.ts` (angka) dan `scripts/parity-stock-xlsx.ts` (isi
 * lembar sebar). Berkas sendiri, bukan tambahan `scripts/lib/parity.ts`,
 * supaya laporan lain yang dipindah paralel tidak menyunting bagian yang sama.
 */
import { businessISODate } from "@sai/core/business-date";
import { resolvePeriod } from "../../src/lib/report-catalog";
import { resolveStockPeriod } from "../../src/lib/stock-period";
import { isoDate, list } from "./parity";

export const STOCK_REPORTS = ["stock-value", "stock-movement", "opname-history"] as const;
export type StockReport = (typeof STOCK_REPORTS)[number];

/** Laporan stok yang diminta — argumen posisi pertama skrip (`package.json`). */
export function stockKind(): StockReport {
  const k = process.argv[2];
  if (!(STOCK_REPORTS as readonly string[]).includes(k ?? "")) {
    console.error(`argumen pertama harus ${STOCK_REPORTS.join("|")}, bukan ${String(k)}`);
    process.exit(2);
  }
  return k as StockReport;
}

/**
 * Periode laporan stok: `--period a..b,c..d`, atau TIGA bawaan — tahun berjalan
 * s.d. hari ini, tahun lalu penuh, dan bulan berjalan PENUH (bawaan halaman
 * Riwayat Stok; ujungnya bisa di masa depan). Diselesaikan dengan penentu
 * periode MILIK laporannya, persis `buildReportPayload`: `resolvePeriod` untuk
 * Nilai Persediaan, `resolveStockPeriod` untuk dua lainnya.
 */
export function stockPeriods(report: StockReport, raw: string | undefined, now = new Date()) {
  const today = businessISODate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const asked = list(raw).map((p) => {
    const [from, to] = p.split("..");
    return { from: isoDate(from ?? "", "--period"), to: isoDate(to ?? "", "--period") };
  });
  const wanted =
    asked.length > 0
      ? asked
      : [
          { from: `${year}-01-01`, to: today },
          { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
          { from: `${year}-${mm}-01`, to: `${year}-${mm}-${lastDay}` },
        ];
  return wanted.map((p) =>
    report === "stock-value"
      ? resolvePeriod(p.from, p.to, now)
      : resolveStockPeriod(undefined, undefined, p.from, p.to, now)
  );
}

/**
 * `--cols "|code|closingQty,closingValue"` → varian `?cols=` yang diperiksa
 * paritas ISI lembar; `|` memisahkan varian, varian kosong = kolom bawaan.
 * Riwayat Hitung Ulang Stok tidak punya pilihan kolom.
 */
export function stockColumnVariants(report: StockReport, raw: string | undefined): string[] {
  if (report === "opname-history") return [""];
  if (raw !== undefined) return raw.split("|").map((v) => v.trim());
  return report === "stock-value" ? ["", "code", "closingQty,closingValue"] : ["", "processed,closing"];
}
