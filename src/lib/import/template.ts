/**
 * TEMPLAT IMPOR — baris yang dituliskan ke berkas `.xlsx` (issue #381).
 *
 * ══ KENAPA TEMPLATNYA DITURUNKAN DARI SPESIFIKASI KOLOM ═════════════════════
 * Templat dan validator adalah dua sisi dari satu janji. Ketika keduanya
 * ditulis terpisah — sebuah daftar judul di route, sebuah daftar aturan di
 * modul parse — mereka menyimpang pada perubahan pertama, dan gejalanya adalah
 * bentuk kegagalan yang paling membingungkan yang bisa dialami pengguna:
 * **berkas yang diunduh dari aplikasi ini ditolak oleh aplikasi ini.**
 *
 * Karena itu keduanya lahir dari `ColumnSpec` yang sama. Menambah kolom berarti
 * menambahnya sekali.
 *
 * MURNI: memulangkan matriks sel. Yang menulisnya jadi `.xlsx` adalah route,
 * lewat `@/lib/xlsx` — ExcelJS tidak pernah masuk ke modul yang diuji.
 */

import type { ColumnSpec } from "@/lib/import/spec";

export interface TemplateSheet {
  /** Baris judul + satu baris contoh. */
  rows: unknown[][];
  /** Lembar penjelas: kolom, wajib/opsional, dan keterangannya. */
  legend: unknown[][];
}

/**
 * Satu baris contoh, bukan nol dan bukan lima.
 *
 * Nol baris membuat orang menebak bentuk isiannya (dan tanggal adalah tempat
 * tebakan itu paling sering salah). Lima baris membuat sebagian orang MENYUNTING
 * contohnya alih-alih menggantinya, lalu mengimpor "PT Contoh Sejahtera" ke
 * dalam bukunya sendiri. Satu baris cukup untuk menunjukkan bentuknya dan
 * cukup mencolok untuk dihapus.
 */
export function buildTemplate(columns: readonly ColumnSpec[]): TemplateSheet {
  const header = columns.map((c) => c.header);
  const example = columns.map((c) => c.example ?? "");

  const legend: unknown[][] = [
    ["Kolom", "Wajib?", "Keterangan"],
    ...columns.map((c) => [
      c.header,
      c.required ? "WAJIB" : "opsional",
      c.hint ?? "",
    ]),
    [],
    ["Catatan umum", "", ""],
    [
      "Urutan kolom",
      "",
      "Bebas — kolom dikenali dari JUDULNYA, bukan posisinya. Kolom tambahan diabaikan.",
    ],
    [
      "Baris judul",
      "",
      "Baris pertama WAJIB berisi judul kolom. Jangan dihapus.",
    ],
    [
      "Angka",
      "",
      "1.234.567,89 maupun 1,234,567.89 diterima. Tanpa desimal, titik/koma dianggap pemisah ribuan.",
    ],
    [
      "Tanggal",
      "",
      "2026-01-31 atau 31/01/2026 (hari dulu, bukan bulan).",
    ],
    [
      "Baris salah",
      "",
      "Bila ADA satu baris yang salah, TIDAK ADA yang disimpan. Perbaiki lalu unggah ulang.",
    ],
  ];

  return { rows: [header, example], legend };
}
