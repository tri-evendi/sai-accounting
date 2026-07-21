/**
 * Report → spreadsheet sheet model (issue #19).
 *
 * ── PURE, and deliberately the ONLY place the row/column mapping lives ────────
 * This module turns an already-computed report payload into a plain `SheetModel`
 * — a description of cells, their kinds and their number formats — and imports no
 * spreadsheet library at all. `@/lib/xlsx` is the thin adapter that walks a
 * `SheetModel` into an ExcelJS workbook; keeping the mapping here means it can be
 * unit-tested without a single binary byte, and the Excel export can never drift
 * from the on-screen report because both consume the exact same `StatementPayload`
 * the page already built (the one that also feeds the PDF button).
 *
 * ── Numbers stay numbers, and stay exact ─────────────────────────────────────
 * Money cells carry the payload's number straight through — no `toFixed`, no
 * `* 100`, no re-rounding. The reader already produced an IDR-base figure rounded
 * to the ledger's precision; a spreadsheet must preserve that value so a user can
 * sum a column and get the same total the report shows. Formatting (thousands
 * separators, the "Rp" prefix, red parentheses for negatives) is a *display*
 * concern applied by the number format, never by mutating the value.
 */
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

/** How a cell's value should be rendered by the spreadsheet, without changing it. */
export type CellFormat = "text" | "money";

export interface SheetCell {
  /** The raw value. Money cells MUST be a number so the spreadsheet can sum them. */
  value: string | number | null;
  format?: CellFormat; // default "text"
  bold?: boolean;
  align?: "left" | "right";
}

export interface SheetColumn {
  header: string;
  /** Approximate character width for the column. */
  width: number;
}

export interface SheetModel {
  /** Worksheet tab name (≤ 31 chars, no Excel-forbidden chars). */
  name: string;
  /** Human title printed as the first row. */
  title: string;
  /** Period / as-of caption printed under the title. */
  period: string;
  columns: SheetColumn[];
  rows: SheetCell[][];
}

/**
 * Excel number format for IDR money.
 *
 * `#,##0` matches the on-screen `formatCurrency(x, "IDR")` (id-ID, no decimals),
 * so the exported figure reads identically to the page. The underlying cell value
 * keeps its full precision regardless of this display format. Negatives get red
 * parentheses — the design system forbids colour as the *only* signal, and the
 * parentheses are that second signal.
 */
export const IDR_NUMBER_FORMAT = '"Rp" #,##0;[Red]("Rp" #,##0)';

const money = (value: number, bold = false): SheetCell => ({
  value,
  format: "money",
  align: "right",
  bold,
});
const text = (value: string | null, bold = false): SheetCell => ({ value, bold });

/** A section heading spanning the label column, with the rest of the row blank. */
function headingRow(label: string, cols: number): SheetCell[] {
  const row: SheetCell[] = [text(label, true)];
  while (row.length < cols) row.push(text(null));
  return row;
}

function statementLineRows(
  lines: { code: string; name: string; amount: number }[]
): SheetCell[][] {
  if (lines.length === 0) return [[text("Tidak ada data."), text(null)]];
  return lines.map((l) => [text(`${l.code}  ${l.name}`.trim()), money(l.amount)]);
}

function buildIncomeStatementSheet(
  p: Extract<StatementPayload, { kind: "income-statement" }>
): SheetModel {
  const rows: SheetCell[][] = [
    headingRow("Pendapatan", 2),
    ...statementLineRows(p.revenue),
    [text("Total Pendapatan", true), money(p.totalRevenue, true)],
    headingRow("Beban", 2),
    ...statementLineRows(p.expense),
    [text("Total Beban", true), money(p.totalExpense, true)],
    [
      text(p.netIncome >= 0 ? "LABA BERSIH" : "RUGI BERSIH", true),
      money(p.netIncome, true),
    ],
  ];
  return {
    name: "Laba Rugi",
    title: "Laporan Laba / Rugi",
    period: p.period,
    columns: [
      { header: "Keterangan", width: 48 },
      { header: "Jumlah (IDR)", width: 22 },
    ],
    rows,
  };
}

function buildBalanceSheetSheet(
  p: Extract<StatementPayload, { kind: "balance-sheet" }>
): SheetModel {
  const rows: SheetCell[][] = [
    headingRow("Aset", 2),
    ...statementLineRows(p.assets),
    [text("Total Aset", true), money(p.totalAssets, true)],
    headingRow("Liabilitas", 2),
    ...statementLineRows(p.liabilities),
    [text("Total Liabilitas", true), money(p.totalLiabilities, true)],
    headingRow("Ekuitas", 2),
    ...statementLineRows(p.equity),
    [text("Laba / Rugi Berjalan"), money(p.netIncome)],
    [text("Total Ekuitas", true), money(p.totalEquity + p.netIncome, true)],
    [
      text(
        p.balanced
          ? "Total Liabilitas + Ekuitas (Seimbang)"
          : "Total Liabilitas + Ekuitas (TIDAK SEIMBANG)",
        true
      ),
      money(p.totalLiabilitiesEquity, true),
    ],
  ];
  return {
    name: "Neraca",
    title: "Neraca",
    period: p.period,
    columns: [
      { header: "Keterangan", width: 48 },
      { header: "Jumlah (IDR)", width: 22 },
    ],
    rows,
  };
}

function buildTrialBalanceSheet(
  p: Extract<StatementPayload, { kind: "trial-balance" }>
): SheetModel {
  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) => [
        text(r.code),
        text(r.name),
        money(r.debit),
        money(r.credit),
      ])
    : [[text(""), text("Belum ada saldo."), text(null), text(null)]];
  rows.push([
    text(""),
    text(p.balanced ? "Total (Seimbang)" : "Total (TIDAK SEIMBANG)", true),
    money(p.totalDebit, true),
    money(p.totalCredit, true),
  ]);
  return {
    name: "Neraca Saldo",
    title: "Neraca Saldo",
    period: p.period,
    columns: [
      { header: "Kode", width: 12 },
      { header: "Nama Akun", width: 40 },
      { header: "Debit (IDR)", width: 20 },
      { header: "Kredit (IDR)", width: 20 },
    ],
    rows,
  };
}

function buildCashFlowSheet(
  p: Extract<StatementPayload, { kind: "cash-flow" }>
): SheetModel {
  const rows: SheetCell[][] = [
    [text("Kas & setara kas awal periode", true), text(null), text(null), money(p.openingCash, true)],
  ];
  // Empty groups are skipped; a non-empty "Belum Terkategori" prints like any
  // other section — never merged into operating, never omitted (mirrors the PDF).
  for (const g of p.groups) {
    if (g.lines.length === 0) continue;
    rows.push(headingRow(g.label, 4));
    for (const l of g.lines) {
      rows.push([
        text(`${l.code}  ${l.name}`.trim()),
        money(l.inflow),
        money(l.outflow),
        money(l.net),
      ]);
    }
    rows.push([
      text(`Jumlah ${g.label}`, true),
      money(g.inflow, true),
      money(g.outflow, true),
      money(g.net, true),
    ]);
  }
  rows.push([
    text("Kas & setara kas akhir periode", true),
    text(null),
    text(null),
    money(p.closingCash, true),
  ]);
  rows.push([
    text(
      p.reconciled
        ? "Kenaikan / Penurunan Kas (cocok dengan buku besar)"
        : "Kenaikan / Penurunan Kas (TIDAK COCOK)",
      true
    ),
    money(p.totalInflow, true),
    money(p.totalOutflow, true),
    money(p.netChange, true),
  ]);
  return {
    name: "Arus Kas",
    title: "Laporan Arus Kas",
    period: p.period,
    columns: [
      { header: "Keterangan", width: 44 },
      { header: "Kas Masuk (IDR)", width: 20 },
      { header: "Kas Keluar (IDR)", width: 20 },
      { header: "Bersih (IDR)", width: 20 },
    ],
    rows,
  };
}

/** Map any statement payload to its sheet model. One entry point, one mapping. */
export function buildReportSheet(payload: StatementPayload): SheetModel {
  switch (payload.kind) {
    case "income-statement":
      return buildIncomeStatementSheet(payload);
    case "balance-sheet":
      return buildBalanceSheetSheet(payload);
    case "trial-balance":
      return buildTrialBalanceSheet(payload);
    case "cash-flow":
      return buildCashFlowSheet(payload);
  }
}
