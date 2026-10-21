/**
 * Baris transaksi Laporan Kas & Bank → muatan `/api/reports/pdf/finance`.
 *
 * Dua pemanggil, satu pemeta: halaman Kas & Bank (baris Prisma, `Date` +
 * `Decimal`) dan tombol pratinjau di beranda (JSON `GET /api/finance`, tempat
 * `Decimal` tiba sebagai STRING). Sejak tahap 1c PDF-nya digambar server dan
 * skemanya menuntut `number`; tombol beranda mengoper baris API mentah dan
 * ditolak 400 di SETIAP buku — terpotret di sapuan visual 21 Okt 2026 sebagai
 * "Gagal membuat dokumen.", sementara tombol yang sama di halaman Kas & Bank
 * lulus karena halamannya sudah mengonversi. Dua pemeta menyimpang tanpa galat;
 * karena itu tinggal satu.
 */
// `import type` — terhapus saat kompilasi, jadi jsPDF tidak ikut ke peramban.
import type { FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export interface FinanceRowSource {
  date: Date | string;
  type: string;
  description: string;
  currency: string;
  /** `Decimal` (server), string desimal (JSON), atau angka. */
  debit: { toString(): string } | string | number;
  credit: { toString(): string } | string | number;
}

export function toFinanceReportRows(rows: readonly FinanceRowSource[]): FinanceReportRow[] {
  return rows.map((tx) => ({
    date: typeof tx.date === "string" ? tx.date : tx.date.toISOString(),
    type: tx.type,
    description: tx.description,
    currency: tx.currency,
    debit: Number(tx.debit.toString()),
    credit: Number(tx.credit.toString()),
  }));
}
