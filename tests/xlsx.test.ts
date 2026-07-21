/**
 * End-to-end proof that money survives the real spreadsheet writer as an exact
 * number (issue #19). The pure builder is unit-tested elsewhere; this drives the
 * whole path — payload → sheet model → ExcelJS workbook → bytes → re-parsed — and
 * asserts a fractional rupiah figure comes back out as a *number* equal to what
 * went in, and that the cell carries a number format rather than a baked-in
 * string. If anything on that path stringified or re-rounded the value, this
 * fails.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildReportSheet } from "@/lib/report-export";
import { buildWorkbookBuffer } from "@/lib/xlsx";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

const payload: StatementPayload = {
  kind: "income-statement",
  period: "Periode uji",
  revenue: [{ code: "4-100", name: "Penjualan", amount: 1_234_567.89 }],
  expense: [{ code: "5-100", name: "Beban", amount: 234_567.89 }],
  totalRevenue: 1_234_567.89,
  totalExpense: 234_567.89,
  netIncome: 1_000_000,
};

describe("buildWorkbookBuffer — money stays an exact number through ExcelJS", () => {
  it("round-trips a fractional rupiah value as a number with a number format", async () => {
    const buffer = await buildWorkbookBuffer([buildReportSheet(payload)]);
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];

    let found: { value: unknown; numFmt?: string } | null = null;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === 1_234_567.89) {
          found = { value: cell.value, numFmt: cell.numFmt };
        }
      });
    });

    expect(found).not.toBeNull();
    expect(typeof found!.value).toBe("number");
    expect(found!.value).toBe(1_234_567.89);
    expect(found!.numFmt).toContain("#,##0"); // formatted for display, not stringified
  });

  it("writes one worksheet per sheet model", async () => {
    const sheet = buildReportSheet(payload);
    const buffer = await buildWorkbookBuffer([sheet, sheet]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.worksheets).toHaveLength(2);
  });
});
