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
import {
  incomeStatementLayout,
  partyRecapColumns,
  stockMovementColumns,
  STOCK_MOVEMENT_HEADERS,
  type PartyRecapColumnId,
  type StockMovementColumnId,
} from "@/lib/statement-layout";

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

/** Tanggal hitung ulang, format layar (id-ID) — bukan ISO mentah "2026-07-30". */
function opnameSheetDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

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
    [text("Akumulasi Laba/Rugi"), money(p.netIncome)],
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

  // The same helper the screen and the PDF ask, so all three have identical
  // columns — including when the user narrowed them in the parameter dialog.
  const cols = stockMovementColumns(p);
  const WIDTHS: Record<StockMovementColumnId, number> = {
    name: 34,
    unit: 12,
    opening: 14,
    movedIn: 14,
    movedOut: 14,
    processed: 14,
    closing: 14,
  };
  const columns: SheetColumn[] = cols.map((c) => ({
    header: STOCK_MOVEMENT_HEADERS[c],
    width: WIDTHS[c],
  }));

  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) =>
        cols.map((c) =>
          c === "name" ? text(r.name) : c === "unit" ? text(r.unit || "-") : q(r[c])
        )
      )
    : [[text("Tidak ada mutasi pada periode ini."), ...columns.slice(1).map(() => text(null))]];

  const totals: Record<StockMovementColumnId, SheetCell> = {
    name: text("Total", true),
    unit: text(null),
    opening: q(p.totalOpening, true),
    movedIn: q(p.totalIn, true),
    movedOut: q(p.totalOut, true),
    processed: q(p.totalProcessed, true),
    closing: q(p.totalClosing, true),
  };
  rows.push(cols.map((c) => totals[c]));

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
    // terbaca begitu. Kolom "Lebih"/"Susut" masing-masing SATU arti — angka
    // positif, arah dari kolomnya (audit 2026-07: dua jenis baris dulu memakai
    // kolom yang sama untuk makna berbeda).
    rows.push([text(`Hitung ulang ${opnameSheetDate(s.dateISO)}`, true), text(null), q(s.increase, true), q(s.decrease, true)]);
    for (const a of s.adjustments) {
      rows.push([
        text(`   ${a.itemName}`),
        text(a.unit || "-"),
        a.variance > 0 ? q(a.variance) : text(null),
        a.variance < 0 ? q(-a.variance) : text(null),
      ]);
    }
  }
  if (rows.length === 0) {
    rows.push([text("Tidak ada hitung ulang stok pada periode ini."), text(null), text(null), text(null)]);
  }
  rows.push([
    text(
      `${p.sessionCount} kali hitung ulang · ${p.adjustmentCount} penyesuaian · Selisih bersih`,
      true
    ),
    text(null),
    p.netVariance >= 0 ? q(p.netVariance, true) : text(null),
    p.netVariance < 0 ? q(-p.netVariance, true) : text(null),
  ]);

  return {
    name: "Riwayat Opname",
    title: "Riwayat Hitung Ulang Stok (Stok Opname)",
    period: p.period,
    columns: [
      { header: "Tanggal / Barang", width: 40 },
      { header: "Satuan", width: 12 },
      { header: "Lebih", width: 16 },
      { header: "Susut", width: 16 },
    ],
    rows,
  };
}

function buildPartyRecapSheet(
  p: Extract<StatementPayload, { kind: "sales-by-customer" | "purchases-by-supplier" }>
): SheetModel {
  const cols = partyRecapColumns(p);
  const sales = p.kind === "sales-by-customer";
  const HEADERS: Record<PartyRecapColumnId, string> = {
    party: sales ? "Pelanggan" : "Pemasok",
    docCount: "Dokumen",
    gross: sales ? "Penjualan Kotor (IDR)" : "Pembelian Kotor (IDR)",
    returns: "Retur (IDR)",
    net: "Bersih (IDR)",
  };
  const WIDTHS: Record<PartyRecapColumnId, number> = {
    party: 36,
    docCount: 12,
    gross: 22,
    returns: 20,
    net: 22,
  };
  const noParty = sales ? "Tanpa pelanggan" : "Tanpa pemasok";

  // Jumlah dokumen adalah CACAH, bukan uang: formatnya tak boleh meminjam
  // topeng rupiah (12 dokumen bukan "Rp 12").
  const count = (value: number, bold = false): SheetCell => ({ value, align: "right", bold });

  const cells = (
    r: { partyName?: string | null; docCount: number; grossBase: number; returnBase: number; netBase: number },
    label: string | null,
    bold = false
  ): Record<PartyRecapColumnId, SheetCell> => ({
    party: text(label ?? r.partyName ?? noParty, bold),
    docCount: count(r.docCount, bold),
    gross: money(r.grossBase, bold),
    // Retur = pengurang, dan tandanya yang menyatakannya — bukan warna.
    returns: money(r.returnBase > 0 ? -r.returnBase : 0, bold),
    net: money(r.netBase, bold),
  });

  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) => {
        const c = cells(r, null);
        return cols.map((id) => c[id]);
      })
    : [[text("Tidak ada dokumen pada periode ini."), ...cols.slice(1).map(() => text(null))]];

  const totals = cells(p.totals, "Total", true);
  rows.push(cols.map((id) => totals[id]));

  if (p.totals.unratedCount > 0) {
    rows.push([
      text(`Catatan: ${p.totals.unratedCount} dokumen valas tanpa kurs tidak ikut dijumlahkan.`),
      ...cols.slice(1).map(() => text(null)),
    ]);
  }

  return {
    name: sales ? "Penjualan per Pelanggan" : "Pembelian per Pemasok",
    title: sales ? "Penjualan per Pelanggan" : "Pembelian per Pemasok",
    period: p.period,
    columns: cols.map((id) => ({ header: HEADERS[id], width: WIDTHS[id] })),
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
    case "sales-by-customer":
    case "purchases-by-supplier":
      return buildPartyRecapSheet(payload);
  }
}
