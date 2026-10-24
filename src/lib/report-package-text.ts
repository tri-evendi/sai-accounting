/**
 * Kosakata & kalimat PAKET LAPORAN — modul tanpa impor runtime (hanya tipe), jadi dibaca peramban
 * (dialog), generator PDF ringkasan, dan penerbit tanpa menyeret apa pun.
 * Logika paketnya di `report-package.ts`.
 */
import type { ReportId } from "@/lib/report-catalog";

/**
 * Set penutupan bulanan BAWAAN — urutan cetaknya juga urutan di sini:
 * Neraca, Laba Rugi, Arus Kas, Perubahan Ekuitas, Neraca Saldo, Umur Piutang,
 * Umur Utang.
 */
export const PACKAGE_DEFAULT_REPORTS = [
  "balance-sheet",
  "income-statement",
  "cash-flow",
  "equity-changes",
  "trial-balance",
  "receivables",
  "payables",
] as const satisfies readonly ReportId[];

export const PACKAGE_FORMATS = ["pdf", "xlsx"] as const;
export type PackageFormat = (typeof PACKAGE_FORMATS)[number];

export const PACKAGE_PERIOD_KINDS = ["month", "quarter", "year", "custom"] as const;
export type PackagePeriodKind = (typeof PACKAGE_PERIOD_KINDS)[number];

/** Alasan sebuah laporan tidak disertakan. */
export type PackageExclusionReason = "module" | "role";

/**
 * Kalimat DOKUMEN (bahasa Indonesia, seperti setiap judul cetak #278) — dibaca
 * halaman ringkasan PDF (Node) DAN lembar Ringkasan buku kerja (Go, lewat
 * muatan). Satu sumber, dua penulis.
 */
export const PACKAGE_EXCLUSION_TEXT: Record<PackageExclusionReason, string> = {
  module: "Modul laporan ini tidak aktif untuk perusahaan ini",
  role: "Peran Anda tidak berwenang membuka laporan ini",
};

export const PACKAGE_SUMMARY_TEXT = {
  title: "Paket Laporan",
  includedHeading: "Laporan yang disertakan",
  excludedHeading: "Laporan yang tidak disertakan",
  numberHeader: "No",
  reportHeader: "Laporan",
  sheetHeader: "Lembar",
  reasonHeader: "Alasan",
  nothingExcluded: "Tidak ada — semua laporan yang diminta disertakan.",
  sheetName: "Ringkasan",
} as const;
