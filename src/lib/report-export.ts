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
  agingColumns,
  agingHeaders,
  balanceSheetBalanceNote,
  balanceSheetLayout,
  budgetColumns,
  cashBankColumns,
  cashFlowLayout,
  cashFlowReconciliationNote,
  incomeStatementLayout,
  partyRecapColumns,
  splitBalanceSheetRows,
  splitIncomeStatementRows,
  splitTrialBalanceRows,
  stockMovementColumns,
  stockValueColumns,
  trialBalanceBalanceNote,
  trialBalanceLayout,
  BALANCE_SHEET_COLUMNS,
  BALANCE_SHEET_HEADERS,
  BUDGET_HEADERS,
  CASH_BANK_HEADERS,
  CASH_FLOW_COLUMNS,
  CASH_FLOW_HEADERS,
  INCOME_STATEMENT_COLUMNS,
  INCOME_STATEMENT_HEADERS,
  PARTY_RECAP_HEADERS,
  PARTY_RECAP_NO_PARTY,
  STOCK_MOVEMENT_HEADERS,
  STOCK_VALUE_HEADERS,
  TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_HEADERS,
  type AgingColumnId,
  type BalanceSheetColumnId,
  type BalanceSheetLayoutRow,
  type BudgetColumnId,
  type CashBankColumnId,
  type CashFlowColumnId,
  type IncomeStatementColumnId,
  type IncomeStatementLayoutRow,
  type PartyRecapColumnId,
  type StockMovementColumnId,
  type StockValueColumnId,
  type TrialBalanceColumnId,
  type TrialBalanceLayoutRow,
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

/**
 * Lebar kolom Laba/Rugi. Lebarnya urusan lembar sebar sendiri (PDF mengatur
 * kolomnya lain); judulnya TIDAK — itu datang dari `INCOME_STATEMENT_HEADERS`
 * bersama cetakan. Angkanya sama dengan Neraca karena tabelnya memang sama
 * bentuknya: keterangan lebar, satu kolom nominal.
 */
const INCOME_STATEMENT_WIDTHS: Record<IncomeStatementColumnId, number> = {
  item: 48,
  amount: 22,
};

function buildIncomeStatementSheet(
  p: Extract<StatementPayload, { kind: "income-statement" }>
): SheetModel {
  // Bentuknya seluruhnya milik `incomeStatementLayout()` — band mana yang
  // tampil, urutan barisnya, kalimat band kosong, label anak tangganya, dan
  // anotasinya (issue #274).
  const { body, foot } = splitIncomeStatementRows(incomeStatementLayout(p));
  const cell = (r: IncomeStatementLayoutRow): SheetCell[] => {
    const bold = r.kind !== "line";
    // Anotasi (marjin kotor, arah hasil) dalam tanda kurung — di layar ia span
    // kecil berwarna; di sini dan di PDF ia mengikuti labelnya.
    const label = r.note === undefined ? r.label : `${r.label} (${r.note})`;
    /*
     * Nol tetap ANGKA nol di sini. Satu-satunya alasan lembar sebar ada adalah
     * agar kolomnya bisa dijumlah, dan teks di tengah kolom mematikan `SUM`.
     * Yang TIDAK BERLAKU (judul band, kalimat band kosong) tetap sel kosong,
     * bukan nol.
     */
    return [text(label, bold), r.amount === null ? text(null) : money(r.amount, bold)];
  };
  return {
    name: "Laba Rugi",
    title: "Laporan Laba / Rugi",
    period: p.period,
    columns: INCOME_STATEMENT_COLUMNS.map((c) => ({
      header: INCOME_STATEMENT_HEADERS[c],
      width: INCOME_STATEMENT_WIDTHS[c],
    })),
    rows: [...body.map(cell), ...foot.map(cell)],
  };
}

/**
 * Lebar kolom Neraca. Lebarnya urusan lembar sebar sendiri (PDF mengatur
 * kolomnya lain); judulnya TIDAK — itu datang dari `BALANCE_SHEET_HEADERS`
 * bersama cetakan.
 */
const BALANCE_SHEET_WIDTHS: Record<BalanceSheetColumnId, number> = {
  item: 48,
  amount: 22,
};

function buildBalanceSheetSheet(
  p: Extract<StatementPayload, { kind: "balance-sheet" }>
): SheetModel {
  // Bentuknya seluruhnya milik `balanceSheetLayout()` — urutan barisnya, tempat
  // "Akumulasi Laba/Rugi" duduk, kalimat seksi kosong, dan penjumlahan
  // ekuitasnya (issue #258).
  const { body, foot } = splitBalanceSheetRows(balanceSheetLayout(p));
  const cell = (r: BalanceSheetLayoutRow, label: string): SheetCell[] => {
    const bold = r.kind !== "line";
    /*
     * Nol tetap ANGKA nol di sini. Satu-satunya alasan lembar sebar ada adalah
     * agar kolomnya bisa dijumlah, dan teks di tengah kolom mematikan `SUM`.
     * Yang TIDAK BERLAKU (judul seksi, kalimat "tidak ada akun") tetap sel
     * kosong, bukan nol.
     */
    return [text(label, bold), r.amount === null ? text(null) : money(r.amount, bold)];
  };
  const rows: SheetCell[][] = [
    ...body.map((r) => cell(r, r.label)),
    // Keseimbangan adalah ANOTASI pada baris penutup terakhir — lencana di
    // layar, tanda kurung di sini dan di PDF.
    ...foot.map((r, i) =>
      cell(r, i === foot.length - 1 ? `${r.label} ${balanceSheetBalanceNote(p.balanced)}` : r.label)
    ),
  ];
  return {
    name: "Neraca",
    title: "Neraca",
    period: p.period,
    columns: BALANCE_SHEET_COLUMNS.map((c) => ({
      header: BALANCE_SHEET_HEADERS[c],
      width: BALANCE_SHEET_WIDTHS[c],
    })),
    rows,
  };
}

/**
 * Lebar kolom Neraca Saldo. Lebarnya urusan lembar sebar sendiri (PDF mengatur
 * kolomnya lain); judulnya TIDAK — itu datang dari `TRIAL_BALANCE_HEADERS`
 * bersama cetakan.
 */
const TRIAL_BALANCE_WIDTHS: Record<TrialBalanceColumnId, number> = {
  code: 12,
  name: 40,
  debit: 20,
  credit: 20,
};

function buildTrialBalanceSheet(
  p: Extract<StatementPayload, { kind: "trial-balance" }>
): SheetModel {
  // Bentuknya seluruhnya milik `trialBalanceLayout()` — termasuk keputusan
  // bahwa buku yang belum punya satu jurnal pun TIDAK mendapat baris Total,
  // sama seperti di layar (issue #275).
  const { body, foot } = splitTrialBalanceRows(trialBalanceLayout(p));
  const cell = (r: TrialBalanceLayoutRow, name: string): SheetCell[] => {
    const bold = r.kind !== "line";
    /*
     * Nol tetap ANGKA nol di sini, bukan "-" seperti di layar dan PDF. Ini
     * pengecualian yang disengaja (#241): satu-satunya alasan lembar sebar ada
     * adalah agar kolomnya bisa dijumlah, dan sebuah "-" di tengah kolom
     * mematikan `SUM`. Yang TIDAK BERLAKU tetap sel kosong, bukan nol.
     */
    const amount = (value: number | null): SheetCell =>
      value === null ? text(null) : money(value, bold);
    return [text(r.code ?? null, bold), text(name, bold), amount(r.debit), amount(r.credit)];
  };
  const rows: SheetCell[][] = [
    ...body.map((r) => cell(r, r.name)),
    // Keseimbangan adalah ANOTASI pada baris Total — lencana di layar, tanda
    // kurung di sini dan di PDF.
    ...foot.map((r) => cell(r, `${r.name} ${trialBalanceBalanceNote(p.balanced)}`)),
  ];
  return {
    name: "Neraca Saldo",
    title: "Neraca Saldo",
    period: p.period,
    columns: TRIAL_BALANCE_COLUMNS.map((c) => ({
      header: TRIAL_BALANCE_HEADERS[c],
      width: TRIAL_BALANCE_WIDTHS[c],
    })),
    rows,
  };
}

/**
 * Lebar kolom Arus Kas, sejajar dengan `CASH_FLOW_COLUMNS`. Lebarnya urusan
 * lembar sebar sendiri (PDF mengatur kolomnya lain); judulnya TIDAK — itu
 * datang dari `CASH_FLOW_HEADERS` bersama cetakan.
 */
const CASH_FLOW_WIDTHS: Record<CashFlowColumnId, number> = {
  item: 44,
  inflow: 20,
  outflow: 20,
  net: 20,
};

function buildCashFlowSheet(
  p: Extract<StatementPayload, { kind: "cash-flow" }>
): SheetModel {
  // Bentuknya seluruhnya milik `cashFlowLayout()` — kelompok mana yang tampil,
  // urutan barisnya, dan kolom mana yang berlaku per baris (issue #241).
  const rows = cashFlowLayout(p).map((r): SheetCell[] => {
    const bold = r.kind !== "line";
    const label =
      r.kind === "total"
        ? `${r.label} ${cashFlowReconciliationNote(p.reconciled)}`
        : r.label;
    /*
     * Nol tetap ANGKA nol di sini, bukan "-" seperti di layar dan PDF. Ini
     * pengecualian yang disengaja: satu-satunya alasan lembar sebar ada adalah
     * agar kolomnya bisa dijumlah, dan sebuah "-" di tengah kolom mematikan
     * `SUM`. Yang TIDAK BERLAKU tetap sel kosong (`null`), bukan nol —
     * "kas awal periode" bukan arus masuk sebesar nol rupiah.
     */
    const amount = (value: number | null): SheetCell =>
      value === null ? text(null) : money(value, bold);
    return [
      // Baris kelompok berdiri sendiri di kolom pertama; kolom nominalnya tak
      // berlaku, jadi selnya kosong (bukan nol).
      text(label, bold),
      amount(r.inflow),
      amount(r.outflow),
      amount(r.net),
    ];
  });
  return {
    name: "Arus Kas",
    title: "Laporan Arus Kas",
    period: p.period,
    columns: CASH_FLOW_COLUMNS.map((c) => ({
      header: CASH_FLOW_HEADERS[c],
      width: CASH_FLOW_WIDTHS[c],
    })),
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
  // Judul kolomnya datang dari `statement-layout.ts`, satu penentu untuk lembar
  // sebar dan PDF (#315). Lebarnya TIDAK ikut: itu urusan lembar sebar, dan
  // PDF-nya tidak memakainya sama sekali.
  const headers = PARTY_RECAP_HEADERS[p.kind];
  const WIDTHS: Record<PartyRecapColumnId, number> = {
    party: 36,
    docCount: 12,
    gross: 22,
    returns: 20,
    net: 22,
  };
  // Nama baris tanpa mitra tercatat datang dari `statement-layout.ts` (#322).
  // Ia dulu ditulis sebaris di sini DAN di `statement-pdf.ts` — dua salinan di
  // dalam badan fungsi, jadi menyunting satu sisi membuat Excel dan PDF laporan
  // yang sama berhenti sepakat tanpa satu tes pun merah.
  const noParty = PARTY_RECAP_NO_PARTY[p.kind];

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
    columns: cols.map((id) => ({ header: headers[id], width: WIDTHS[id] })),
    rows,
  };
}

const AGING_WIDTHS: Record<AgingColumnId, number> = {
  party: 30,
  documentNo: 20,
  date: 14,
  dueDate: 14,
  age: 12,
  status: 24,
  total: 18,
  outstanding: 20,
};

function buildAgingSheet(
  p: Extract<StatementPayload, { kind: "receivables" | "payables" }>
): SheetModel {
  const receivable = p.kind === "receivables";
  // Judul kolomnya — termasuk kolom pihak — datang dari `statement-layout.ts`,
  // satu penentu untuk lembar sebar dan PDF (#310).
  const headers = agingHeaders(p.kind);

  const cols = agingColumns(p);
  const rows: SheetCell[][] = [];

  /** Satu baris selebar kolom yang sedang tampil, sisanya kosong. */
  const pad = (cells: SheetCell[]): SheetCell[] => {
    const row = [...cells];
    while (row.length < cols.length) row.push(text(null));
    return row.slice(0, Math.max(cols.length, 1));
  };
  /** Baris ringkasan: labelnya di kolom pertama, nilainya di kolom TERAKHIR. */
  const summary = (label: SheetCell, value: SheetCell): SheetCell[] => {
    if (cols.length === 1) return [label];
    const row = pad([label]);
    row[row.length - 1] = value;
    return row;
  };

  // Ringkasan ember sebagai baris berlabel, bukan kolom terpisah: satu lembar
  // dengan dua tabel bersebelahan tak bisa disortir maupun dijumlahkan.
  rows.push(pad([text("Ringkasan umur", true)]));
  for (const b of p.buckets) {
    rows.push(summary(text(b.label), money(b.amount)));
  }
  rows.push(summary(text("Total", true), money(p.total, true)));
  rows.push(pad([]));

  rows.push(pad([text("Rincian dokumen", true)]));
  if (p.rows.length === 0) {
    rows.push(pad([text("Tidak ada dokumen yang belum lunas.")]));
  }
  const cell = (r: (typeof p.rows)[number], c: AgingColumnId): SheetCell => {
    switch (c) {
      case "party":
        return text(r.partyName);
      case "documentNo":
        return text(r.documentNo);
      case "date":
        return text(r.date);
      case "dueDate":
        return text(r.dueDate ?? "-");
      // Umur yang dihitung dari TANGGAL DOKUMEN (karena jatuh temponya tidak
      // ada) diberi tanda bintang: dua angka yang artinya berbeda tak boleh
      // berdiri tanpa penanda di kolom yang sama. Karena itu ia teks, bukan
      // angka — dan penjelasannya ada di catatan kaki lembar ini.
      case "age":
        return { value: r.ageFromIssue ? `${r.ageDays} *` : r.ageDays, align: "right" };
      case "status":
        return text(r.status);
      // Nilai dokumen dalam MATA UANGNYA SENDIRI — kolomnya bercampur mata
      // uang, jadi angkanya tidak boleh memakai topeng rupiah.
      case "total":
        return { value: r.total, align: "right" };
      // Valas tanpa kurs: sel kosong, bukan nol. Nol menyatakan "tidak ada
      // sisa", dan itu bukan yang buku besar katakan.
      case "outstanding":
        return r.outstandingBase == null ? text(null) : money(r.outstandingBase);
    }
  };
  for (const r of p.rows) {
    rows.push(cols.map((c) => cell(r, c)));
  }

  const notes: string[] = [];
  if (p.rows.some((r) => r.ageFromIssue)) {
    notes.push("* Umur dihitung dari tanggal dokumen karena tanggal jatuh temponya tidak ada.");
  }
  if (p.unresolved > 0) {
    notes.push(
      `${p.unresolved} dokumen valas tanpa kurs tidak punya nilai IDR, jadi tidak ikut dijumlahkan.`
    );
  }
  if (notes.length > 0) {
    rows.push(pad([]));
    for (const n of notes) rows.push(pad([text(n)]));
  }

  return {
    name: receivable ? "Umur Piutang" : "Umur Utang",
    title: receivable ? "Piutang & Umur Piutang" : "Utang & Umur Utang",
    period: p.period,
    columns: cols.map((c) => ({
      header: headers[c],
      width: AGING_WIDTHS[c],
    })),
    rows,
  };
}

function buildStockValueSheet(
  p: Extract<StatementPayload, { kind: "stock-value" }>
): SheetModel {
  const cols = stockValueColumns(p);
  const WIDTHS: Record<StockValueColumnId, number> = {
    name: 34,
    unit: 12,
    currentStock: 16,
    unitCost: 20,
    stockValue: 22,
  };
  // Saldo adalah KUANTITAS `Decimal(15,3)`; biaya & nilai adalah uang. Dua
  // format berbeda di satu tabel, dan meminjamkan topeng rupiah ke saldo akan
  // membulatkan 12,5 kg menjadi Rp 13.
  const cell = (r: (typeof p.rows)[number], c: StockValueColumnId): SheetCell => {
    if (c === "name") return text(r.name);
    if (c === "unit") return text(r.unit || "-");
    if (c === "currentStock") return { value: r.currentStock, format: "quantity", align: "right" };
    const value = c === "unitCost" ? r.unitCost : r.stockValue;
    // Tanpa dasar biaya: sel KOSONG, bukan nol — nol menyatakan "tidak
    // bernilai" tentang barang yang ada wujudnya.
    return value == null ? text(null) : money(value);
  };

  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) => cols.map((c) => cell(r, c)))
    : [[text("Belum ada barang."), ...cols.slice(1).map(() => text(null))]];

  rows.push(
    cols.map((c) =>
      c === "name"
        ? text("Total Nilai Persediaan", true)
        : c === "stockValue"
          ? money(p.totalValue, true)
          : text(null)
    )
  );

  if (p.uncostedCount > 0) {
    rows.push([
      text(
        `Catatan: ${p.uncostedCount} barang bersaldo belum punya dasar biaya, jadi nilainya tidak ikut dijumlahkan.`
      ),
      ...cols.slice(1).map(() => text(null)),
    ]);
  }

  return {
    name: "Nilai Persediaan",
    title: "Nilai Persediaan",
    period: p.period,
    columns: cols.map((c) => ({ header: STOCK_VALUE_HEADERS[c], width: WIDTHS[c] })),
    rows,
  };
}

function buildCashBankSheet(p: Extract<StatementPayload, { kind: "cash-bank" }>): SheetModel {
  const cols = cashBankColumns(p);
  const WIDTHS: Record<CashBankColumnId, number> = {
    account: 40,
    opening: 22,
    net: 22,
    closing: 22,
  };

  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) =>
        cols.map((c) => (c === "account" ? text(`${r.code}  ${r.name}`.trim()) : money(r[c])))
      )
    : [
        [
          text("Tidak ada akun kas & bank yang bergerak pada periode ini."),
          ...cols.slice(1).map(() => text(null)),
        ],
      ];

  const totals: Record<CashBankColumnId, SheetCell> = {
    account: text("Total", true),
    opening: money(p.openingCash, true),
    net: money(p.netChange, true),
    closing: money(p.closingCash, true),
  };
  rows.push(cols.map((c) => totals[c]));

  return {
    name: "Kas & Bank",
    title: "Laporan Kas & Bank",
    period: p.period,
    columns: cols.map((c) => ({ header: CASH_BANK_HEADERS[c], width: WIDTHS[c] })),
    rows,
  };
}

function buildBudgetSheet(
  p: Extract<StatementPayload, { kind: "budget-realization" }>
): SheetModel {
  const cols = budgetColumns(p);
  const WIDTHS: Record<BudgetColumnId, number> = {
    account: 40,
    budget: 20,
    actual: 20,
    variance: 20,
    variancePct: 14,
    status: 22,
  };

  // Persentase sebagai ANGKA, bukan teks "+12,3%": lembar sebar yang menerima
  // angka bisa mengurutkan dan menyaringnya. Persen yang tak terdefinisi
  // (anggaran nol) tetap sel kosong — "0%" menyatakan hal yang tidak dikatakan.
  const cell = (
    r: { code: string; name: string; budget: number; actual: number; variance: number; variancePct: number | null; status: string },
    c: BudgetColumnId,
    bold = false
  ): SheetCell => {
    switch (c) {
      case "account":
        return text(`${r.code}  ${r.name}`.trim(), bold);
      case "budget":
        return money(r.budget, bold);
      case "actual":
        return money(r.actual, bold);
      case "variance":
        return money(r.variance, bold);
      case "variancePct":
        return r.variancePct === null
          ? text(null)
          : { value: r.variancePct, align: "right", bold };
      case "status":
        return text(r.status, bold);
    }
  };

  const rows: SheetCell[][] = p.rows.length
    ? p.rows.map((r) => cols.map((c) => cell(r, c)))
    : [[text("Belum ada anggaran untuk periode ini."), ...cols.slice(1).map(() => text(null))]];

  rows.push(
    cols.map((c) =>
      cell(
        {
          code: "",
          name: "Total",
          budget: p.totalBudget,
          actual: p.totalActual,
          variance: p.totalVariance,
          variancePct: p.totalVariancePct,
          status: p.alertCount > 0 ? `${p.alertCount} akun melewati ambang` : "",
        },
        c,
        true
      )
    )
  );

  if (p.salesTarget) {
    rows.push(cols.map(() => text(null)));
    rows.push([text("Target Penjualan", true), ...cols.slice(1).map(() => text(null))]);
    rows.push(
      cols.map((c) =>
        cell(
          {
            code: "",
            name: "Total penjualan periode ini",
            budget: p.salesTarget!.target,
            actual: p.salesTarget!.actual,
            variance: p.salesTarget!.variance,
            variancePct: null,
            status: "",
          },
          c
        )
      )
    );
  }

  return {
    name: "Realisasi vs Anggaran",
    title: "Realisasi vs Anggaran",
    period: p.period,
    columns: cols.map((c) => ({ header: BUDGET_HEADERS[c], width: WIDTHS[c] })),
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
    case "receivables":
    case "payables":
      return buildAgingSheet(payload);
    case "stock-value":
      return buildStockValueSheet(payload);
    case "cash-bank":
      return buildCashBankSheet(payload);
    case "budget-realization":
      return buildBudgetSheet(payload);
  }
}
