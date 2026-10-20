/**
 * Kosakata jenis laporan PDF — SATU daftar, dibaca kedua sisi.
 *
 * Ia terpisah dari `report-pdf.ts` karena registri di sana `server-only`:
 * isinya skema zod, penghitung baris, dan impor generator. Tombol di peramban
 * hanya butuh NAMA jenisnya, dan menyalin nama itu ke sisi klien berarti dua
 * daftar yang menyimpang tanpa galat — jenis yang diminta klien lalu dijawab
 * 404 oleh rute yang tidak pernah mengenalnya.
 */
export const REPORT_PDF_KINDS = ["statement", "stock", "opname", "finance"] as const;

export type ReportPdfKind = (typeof REPORT_PDF_KINDS)[number];

export function isReportPdfKind(nilai: string): nilai is ReportPdfKind {
  return (REPORT_PDF_KINDS as readonly string[]).includes(nilai);
}
