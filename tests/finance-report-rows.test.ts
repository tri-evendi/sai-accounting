/**
 * Muatan PDF Kas & Bank dari KEDUA jalur lolos skema rute.
 *
 * 21 Okt 2026: tombol pratinjau di beranda mengoper baris `GET /api/finance`
 * mentah — `Decimal` sebagai string — dan `/api/reports/pdf/finance` menolaknya
 * 400 di setiap buku. Tes ini memaku bentuk JSON itu pada skema rute.
 */
import { describe, expect, it } from "vitest";
import { financeReportPayloadSchema } from "@/lib/validations/report-pdf";
import { toFinanceReportRows } from "@/lib/finance-report-rows";

/* Bentuk satu baris `GET /api/finance` persis seperti diterima peramban. */
const BARIS_API = {
  id: 12,
  type: "bank",
  date: "2026-07-25T03:00:00.000Z",
  description: "[CONTOH] Transport & bensin",
  currency: "IDR",
  debit: "0",
  credit: "950000",
  rate: null,
  baseAmount: null,
  note: null,
};

describe("muatan PDF Kas & Bank", () => {
  it("baris API mentah DITOLAK skema — sebab regresinya", () => {
    const hasil = financeReportPayloadSchema.safeParse({ balances: [], transactions: [BARIS_API] });
    expect(hasil.success).toBe(false);
  });

  it("baris API lewat pemeta → lolos, nominalnya angka", () => {
    const transactions = toFinanceReportRows([BARIS_API]);
    const hasil = financeReportPayloadSchema.safeParse({ balances: [], transactions });
    expect(hasil.success).toBe(true);
    expect(transactions[0]).toMatchObject({ debit: 0, credit: 950000 });
  });

  it("baris Prisma (Date + Decimal) menghasilkan bentuk yang sama", () => {
    const desimal = (s: string) => ({ toString: () => s });
    const [baris] = toFinanceReportRows([
      { ...BARIS_API, date: new Date("2026-07-25T03:00:00.000Z"), debit: desimal("0"), credit: desimal("950000.00") },
    ]);
    expect(baris).toEqual(toFinanceReportRows([BARIS_API])[0]);
  });
});
