/**
 * Baris transaksi Laporan Kas & Bank → bagian `transactions` muatannya.
 *
 * Sejak 09 §5 ditutup pemanggilnya SATU: `financeReportPayload`
 * (`src/lib/report-pdf-payload.ts`), di server, atas baris Prisma (`Date` +
 * `Decimal`). Bentuk JSON (`Decimal` sebagai STRING) tetap diterima — itu
 * bentuk yang dulu dioper tombol beranda dari `GET /api/finance`, dan
 * regresinya (21 Okt 2026: 400 di SETIAP buku, "Gagal membuat dokumen.")
 * terpotret di `tests/finance-report-rows.test.ts`. Pemeta yang menerima
 * keduanya tidak bisa menyimpang menurut asal barisnya.
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
