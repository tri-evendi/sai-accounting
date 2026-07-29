/**
 * The Excel sheet-model builder (issue #19).
 *
 * The one hazard worth pinning: a money cell that no longer equals the report
 * figure it came from — either because it was turned into a formatted string, or
 * because it was re-rounded / float-mangled on the way into the sheet. Every
 * assertion here compares a money cell to the *exact* number in the payload the
 * report page produced (the same payload that feeds the PDF), including awkward
 * fractional values, so a regression that stringifies or drifts a figure fails
 * loudly. The pure builder is tested with no spreadsheet library present at all.
 */
import { describe, it, expect } from "vitest";
import { buildReportSheet, type SheetCell, type SheetModel } from "@/lib/report-export";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

/** Money values, in row order, exactly as the builder placed them. */
function moneyValues(sheet: SheetModel): number[] {
  const out: number[] = [];
  for (const row of sheet.rows) {
    for (const cell of row) {
      if (cell.format === "money") {
        expect(typeof cell.value).toBe("number"); // never a string
        out.push(cell.value as number);
      }
    }
  }
  return out;
}

function cellFor(sheet: SheetModel, predicate: (label: string) => boolean): SheetCell[] {
  const row = sheet.rows.find(
    (r) => typeof r[0]?.value === "string" && predicate(r[0].value as string)
  );
  if (!row) throw new Error("row not found");
  return row;
}

describe("buildReportSheet — income statement", () => {
  const payload: StatementPayload = {
    kind: "income-statement",
    period: "Periode 1 Jan 2026 – 31 Jul 2026",
    sales: {
      lines: [
        { code: "4-100", name: "Penjualan Ekspor", amount: 1_234_567.89 },
        { code: "4-200", name: "Penjualan Lokal", amount: 500_000.5 },
      ],
      total: 1_734_568.39,
    },
    cogs: {
      lines: [{ code: "5-100", name: "Beban Pokok Penjualan", amount: 900_000.11 }],
      total: 900_000.11,
    },
    grossProfit: 834_568.28,
    operatingExpense: {
      lines: [{ code: "6-100", name: "Beban Gaji", amount: 400_000.33 }],
      total: 400_000.33,
    },
    operatingProfit: 434_567.95,
    otherIncome: {
      lines: [{ code: "7-100", name: "Selisih Kurs", amount: 10_000 }],
      total: 10_000,
    },
    otherExpense: {
      lines: [{ code: "8-100", name: "Beban Bunga", amount: 5_000 }],
      total: 5_000,
    },
    netIncome: 439_567.95,
  };

  it("carries every figure through as an exact number, in multi-step order", () => {
    const sheet = buildReportSheet(payload);
    expect(moneyValues(sheet)).toEqual([
      1_234_567.89,
      500_000.5,
      1_734_568.39, // Total Pendapatan
      900_000.11,
      900_000.11, // Total Beban Pokok Penjualan
      834_568.28, // LABA KOTOR
      400_000.33,
      400_000.33, // Total Beban Operasional
      434_567.95, // LABA USAHA
      10_000,
      10_000, // Total Pendapatan Lain-lain
      5_000,
      5_000, // Total Beban Lain-lain
      439_567.95, // Laba bersih
    ]);
  });

  it("prints the two step subtotals with their exact values", () => {
    const sheet = buildReportSheet(payload);
    expect(cellFor(sheet, (l) => l === "LABA KOTOR")[1].value).toBe(834_568.28);
    expect(cellFor(sheet, (l) => l === "LABA USAHA")[1].value).toBe(434_567.95);
  });

  /**
   * The collapse rule (see `@/lib/statement-layout`): a business with no HPP and
   * no other income/expense accounts must get exactly the single-step statement
   * it had before — no empty bands, and no "Laba Kotor" row merely restating
   * total revenue.
   */
  it("collapses to a single-step statement when the extra bands are empty", () => {
    const sheet = buildReportSheet({
      ...payload,
      cogs: { lines: [], total: 0 },
      grossProfit: 1_734_568.39,
      operatingProfit: 1_334_568.06,
      otherIncome: { lines: [], total: 0 },
      otherExpense: { lines: [], total: 0 },
      netIncome: 1_334_568.06,
    });
    const labels = sheet.rows.map((r) => String(r[0]?.value ?? ""));
    expect(labels).not.toContain("LABA KOTOR");
    expect(labels).not.toContain("LABA USAHA");
    expect(labels.filter((l) => l.startsWith("Total "))).toEqual([
      "Total Pendapatan",
      "Total Beban Operasional",
    ]);
    expect(moneyValues(sheet)).toEqual([
      1_234_567.89,
      500_000.5,
      1_734_568.39, // Total Pendapatan
      400_000.33,
      400_000.33, // Total Beban Operasional
      1_334_568.06, // Laba bersih
    ]);
  });

  it("labels a positive net as LABA BERSIH and keeps the exact value", () => {
    const sheet = buildReportSheet(payload);
    const row = cellFor(sheet, (l) => l.startsWith("LABA BERSIH"));
    expect(row[1].value).toBe(439_567.95);
  });

  it("labels a negative net as RUGI BERSIH", () => {
    const sheet = buildReportSheet({ ...payload, netIncome: -50_000 });
    const row = cellFor(sheet, (l) => l.startsWith("RUGI"));
    expect(row[1].value).toBe(-50_000);
  });

  it("does not stringify or re-round a fractional rupiah value", () => {
    const sheet = buildReportSheet(payload);
    // 1_234_567.89 must survive verbatim — not 1_234_568, not "1.234.567,89".
    expect(moneyValues(sheet)).toContain(1_234_567.89);
  });
});

describe("buildReportSheet — balance sheet", () => {
  const payload: StatementPayload = {
    kind: "balance-sheet",
    period: "Per 31 Jul 2026",
    assets: [{ code: "1-100", name: "Kas", amount: 9_000_000 }],
    liabilities: [{ code: "2-100", name: "Utang Usaha", amount: 2_000_000 }],
    equity: [{ code: "3-100", name: "Modal", amount: 5_000_000 }],
    totalAssets: 9_000_000,
    totalLiabilities: 2_000_000,
    totalEquity: 5_000_000,
    netIncome: 2_000_000,
    totalLiabilitiesEquity: 9_000_000,
    balanced: true,
  };

  it("matches the report totals exactly, and folds current earnings into equity", () => {
    const sheet = buildReportSheet(payload);
    expect(moneyValues(sheet)).toEqual([
      9_000_000, // Kas
      9_000_000, // Total Aset
      2_000_000, // Utang Usaha
      2_000_000, // Total Liabilitas
      5_000_000, // Modal
      2_000_000, // Laba / Rugi Berjalan
      7_000_000, // Total Ekuitas = totalEquity + netIncome
      9_000_000, // Total Liabilitas + Ekuitas
    ]);
  });

  it("flags an unbalanced sheet in the total label", () => {
    const sheet = buildReportSheet({ ...payload, balanced: false });
    const row = cellFor(sheet, (l) => l.includes("Total Liabilitas + Ekuitas"));
    expect(row[0].value).toContain("TIDAK SEIMBANG");
  });
});

describe("buildReportSheet — trial balance & cash flow", () => {
  it("keeps debit and credit columns as exact numbers", () => {
    const sheet = buildReportSheet({
      kind: "trial-balance",
      period: "Per 31 Jul 2026",
      rows: [{ code: "1-100", name: "Kas", debit: 1_500_000.75, credit: 0 }],
      totalDebit: 1_500_000.75,
      totalCredit: 1_500_000.75,
      balanced: true,
    });
    expect(moneyValues(sheet)).toEqual([1_500_000.75, 0, 1_500_000.75, 1_500_000.75]);
  });

  it("prints a non-empty uncategorised group and totals net change exactly", () => {
    const sheet = buildReportSheet({
      kind: "cash-flow",
      period: "Periode",
      groups: [
        {
          label: "Belum Terkategori",
          lines: [{ code: "9-999", name: "Akun Aneh", inflow: 250_000.25, outflow: 0, net: 250_000.25 }],
          inflow: 250_000.25,
          outflow: 0,
          net: 250_000.25,
        },
      ],
      totalInflow: 250_000.25,
      totalOutflow: 0,
      netChange: 250_000.25,
      openingCash: 1_000_000,
      closingCash: 1_250_000.25,
      reconciled: true,
      suspectUnrated: 0,
    });
    const values = moneyValues(sheet);
    expect(values).toContain(250_000.25);
    expect(values).toContain(1_000_000); // opening
    expect(values).toContain(1_250_000.25); // closing
    // The uncategorised section is present, never dropped.
    const heading = sheet.rows.find((r) => r[0]?.value === "Belum Terkategori");
    expect(heading).toBeDefined();
  });
});
