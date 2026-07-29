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
import { incomeStatementLayout } from "@/lib/statement-layout";

/**
 * How a cell's value should be rendered by the spreadsheet, without changing it.
 *
 * `quantity` is NOT money and must never borrow its format: stock is
 * `Decimal(15,3)`, so 12.5 kg has to survive as 12,5 rather than being rounded to
 * a whole rupiah by the currency mask (issue #126).
 */
export type CellFormat = "text" | "money" | "quantity";

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

/**
 * Quantity display: thousands separated, up to three decimals, trailing zeros
 * dropped (`#` rather than `0`). Matches `Decimal(15,3)` in the schema, so a
 * whole number reads "1.200" and a fractional one "12,5" — never "1.200,000".
 */
export const QUANTITY_NUMBER_FORMAT = "#,##0.###;[Red]-#,##0.###";

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

/** A whole band of the multi-step Laba/Rugi: heading, its lines, its total. */
function sectionRows(
  heading: string,
  s: { lines: { code: string; name: string; amount: number }[]; total: number }
): SheetCell[][] {
  return [
    headingRow(heading, 2),
    ...statementLineRows(s.lines),
    [text(`Total ${heading}`, true), money(s.total, true)],
  ];
}

function buildIncomeStatementSheet(
  p: Extract<StatementPayload, { kind: "income-statement" }>
): SheetModel {
  // Same bands, same collapse rule as the screen and the PDF — one helper decides.
  const layout = incomeStatementLayout(p);
  const rows: SheetCell[][] = [
    ...sectionRows("Pendapatan", p.sales),
    ...(layout.showCogs ? sectionRows("Beban Pokok Penjualan", p.cogs) : []),
    ...(layout.showGrossProfit ? [[text("LABA KOTOR", true), money(p.grossProfit, true)]] : []),
    ...sectionRows("Beban Operasional", p.operatingExpense),
    ...(layout.showOperatingProfit
      ? [[text("LABA USAHA", true), money(p.operatingProfit, true)]]
      : []),
    ...(layout.showOtherIncome ? sectionRows("Pendapatan Lain-lain", p.otherIncome) : []),
    ...(layout.showOtherExpense ? sectionRows("Beban Lain-lain", p.otherExpense) : []),
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

function buildStockMovementSheet(
  p: Extract<StatementPayload, { kind: "stock-movement" }>
): SheetModel {
  // Quantities, never money — see the CellFormat note above.
  const q = (value: number, bold = false): SheetCell => ({
    value,
    format: "quantity",
    align: "right",
    bold,
  });

  const columns: SheetColumn[] = [
    { header: "Barang", width: 34 },
    { header: "Satuan", width: 12 },
    { header: "Saldo Awal", width: 14 },
    { header: "Masuk", width: 14 },
    { header: "Keluar", width: 14 },
  ];
  // The `Diolah` column exists only when the period has such a movement — the
  // same rule the screen and the PDF apply, so all three have identical columns.
  if (p.hasProcess) columns.push({ header: "Diolah", width: 14 });
  columns.push({ header: "Saldo Akhir", width: 14 });

  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) => {
        const cells: SheetCell[] = [text(r.name), text(r.unit || "-"), q(r.opening), q(r.movedIn), q(r.movedOut)];
        if (p.hasProcess) cells.push(q(r.processed));
        cells.push(q(r.closing));
        return cells;
      })
    : [[text("Tidak ada mutasi pada periode ini."), ...columns.slice(1).map(() => text(null))]];

  const footer: SheetCell[] = [
    text("Total", true),
    text(null),
    q(p.totalOpening, true),
    q(p.totalIn, true),
    q(p.totalOut, true),
  ];
  if (p.hasProcess) footer.push(q(p.totalProcessed, true));
  footer.push(q(p.totalClosing, true));
  rows.push(footer);

  if (p.dormantCount > 0) {
    rows.push([
      text(`Catatan: ${p.dormantCount} barang tanpa saldo awal dan tanpa mutasi tidak ditampilkan.`),
      ...columns.slice(1).map(() => text(null)),
    ]);
  }

  return { name: "Kartu Stok", title: "Kartu Stok / Mutasi Persediaan", period: p.period, columns, rows };
}

function buildOpnameHistorySheet(
  p: Extract<StatementPayload, { kind: "opname-history" }>
): SheetModel {
  const q = (value: number, bold = false): SheetCell => ({
    value,
    format: "quantity",
    align: "right",
    bold,
  });

  const rows: SheetCell[][] = [];
  for (const s of p.sessions) {
    // Tanggalnya jadi baris judul sesi, bukan kolom yang diulang tiap baris:
    // satu hitung ulang adalah satu peristiwa, dan lembar sebarnya harus
    // terbaca begitu.
    rows.push([text(`Hitung ulang ${s.dateISO}`, true), text(null), q(s.increase, true), q(-s.decrease, true)]);
    for (const a of s.adjustments) {
      rows.push([text(`   ${a.itemName}`), text(a.unit || "-"), q(a.variance), text(null)]);
    }
  }
  if (rows.length === 0) {
    rows.push([text("Tidak ada hitung ulang stok pada periode ini."), text(null), text(null), text(null)]);
  }
  rows.push([
    text(`${p.sessionCount} kali hitung ulang · ${p.adjustmentCount} penyesuaian`, true),
    text("Selisih bersih", true),
    q(p.netVariance, true),
    text(null),
  ]);

  return {
    name: "Riwayat Opname",
    title: "Riwayat Hitung Ulang Stok (Stok Opname)",
    period: p.period,
    columns: [
      { header: "Tanggal / Barang", width: 40 },
      { header: "Satuan", width: 12 },
      { header: "Selisih", width: 16 },
      { header: "Susut", width: 16 },
    ],
    rows,
  };
}

/** Map any statement payload to its sheet model. One entry point, one mapping. */
export function buildReportSheet(payload: StatementPayload): SheetModel {
  switch (payload.kind) {
    case "stock-movement":
      return buildStockMovementSheet(payload);
    case "opname-history":
      return buildOpnameHistorySheet(payload);
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
