/**
 * Shape of the multi-step Laba/Rugi — which bands are worth printing (issue #123).
 *
 * ── ONE rule, in ONE place, with NO dependencies ─────────────────────────────
 * The screen, the PDF and the spreadsheet must agree on the shape of the
 * statement: a printout carrying a "Laba Kotor" row the screen does not is a
 * report nobody trusts twice. So the rule lives here rather than being repeated
 * three times — and it lives in its own module, importing nothing, because its
 * three callers cannot share a heavier home: the page is a server component, the
 * PDF builder runs in the browser (jsPDF), and `@/lib/report-export` is pure by
 * contract and must not pull a PDF library in behind it.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A band with no lines is omitted, and so is the subtotal that band exists to
 * produce: with no HPP accounts "Laba Kotor" would merely restate total revenue,
 * and with no other income or expense "Laba Usaha" would merely restate the net
 * result. A subtotal that repeats the line above it teaches the reader to skim
 * past subtotals, which is worse than not printing one. So a service company
 * still sees exactly the statement it saw before — Pendapatan, Beban, Laba/Rugi
 * Bersih — while a trading company gets the full ladder.
 *
 * Penjualan and Beban Operasional are always shown, even when empty: they are the
 * anchors of the statement, and an empty period must still look like a report
 * rather than a lone total.
 */

export interface IncomeStatementLayout {
  showCogs: boolean;
  showGrossProfit: boolean;
  showOtherIncome: boolean;
  showOtherExpense: boolean;
  showOperatingProfit: boolean;
}

/** Structural on purpose — accepts the reader's result and the export payload alike. */
export interface IncomeStatementShape {
  cogs: { lines: readonly unknown[] };
  otherIncome: { lines: readonly unknown[] };
  otherExpense: { lines: readonly unknown[] };
}

export function incomeStatementLayout(statement: IncomeStatementShape): IncomeStatementLayout {
  const showCogs = statement.cogs.lines.length > 0;
  const showOtherIncome = statement.otherIncome.lines.length > 0;
  const showOtherExpense = statement.otherExpense.lines.length > 0;
  return {
    showCogs,
    showGrossProfit: showCogs,
    showOtherIncome,
    showOtherExpense,
    showOperatingProfit: showOtherIncome || showOtherExpense,
  };
}

/**
 * Gross margin as a percentage of revenue, or `null` when there is no revenue to
 * be a percentage of. Explicitly null rather than 0: a period with no sales has
 * no margin, and printing "0%" would state something the books do not say.
 */
export function grossMarginPct(grossProfit: number, totalSales: number): number | null {
  if (Math.round(totalSales * 100) === 0) return null;
  return (grossProfit / totalSales) * 100;
}

// ─── Kolom Riwayat Stok ──────────────────────────────────────────────────────

/**
 * Susunan kolom Riwayat Stok, dalam urutan kanoniknya.
 *
 * Ada di modul ini karena alasan yang sama dengan `incomeStatementLayout`:
 * layar, PDF, dan lembar sebar harus sepakat. Sebelumnya ketiganya menyusun
 * daftar kolomnya sendiri-sendiri — tiga salinan aturan `hasProcess` yang
 * kebetulan masih sama.
 */
export const STOCK_MOVEMENT_COLUMNS = [
  "name",
  "unit",
  "opening",
  "movedIn",
  "movedOut",
  "processed",
  "closing",
] as const;

export type StockMovementColumnId = (typeof STOCK_MOVEMENT_COLUMNS)[number];

/**
 * Judul kolom untuk DOKUMEN CETAK (PDF & lembar sebar) — tetap bahasa
 * Indonesia, seperti seluruh isi `lib/pdf`: berkas yang lepas dari layarnya
 * tidak membawa pilihan bahasa penggunanya. Layar memakai kamus.
 */
export const STOCK_MOVEMENT_HEADERS: Record<StockMovementColumnId, string> = {
  name: "Barang",
  unit: "Satuan",
  opening: "Saldo Awal",
  movedIn: "Masuk",
  movedOut: "Keluar",
  processed: "Diolah",
  closing: "Saldo Akhir",
};

/**
 * Kolom yang benar-benar dicetak, setelah dua penyaring yang urutannya penting:
 *
 * 1. **Isi laporan** — `Diolah` hanya ada bila periodenya memang punya mutasi
 *    olah. Ini bukan pilihan pengguna; kolom penuh tanda hubung bukan informasi.
 * 2. **Pilihan pengguna** (`visibleColumns` dari dialog parameter). Ia hanya
 *    boleh MENGURANGI: mencentang `Diolah` di periode tanpa mutasi olah tidak
 *    memunculkan kolom kosong.
 *
 * `name` tak pernah bisa dibuang — tabel angka tanpa nama barang tidak bisa
 * dibaca siapa pun, dan itu bukan laporan yang pengguna maksud.
 */
export function stockMovementColumns(report: {
  hasProcess: boolean;
  visibleColumns?: string[];
}): StockMovementColumnId[] {
  const available = STOCK_MOVEMENT_COLUMNS.filter(
    (id) => id !== "processed" || report.hasProcess
  );
  return selectColumns(available, report.visibleColumns, "name");
}

/**
 * Saring `available` dengan pilihan pengguna, mempertahankan urutan kanonik.
 *
 * Dua aturan yang berlaku untuk SETIAP laporan bertipe daftar: kolom `always`
 * tak pernah bisa dibuang (tabel angka tanpa kolom identitas tidak bisa dibaca
 * siapa pun), dan daftar kosong berarti "seluruhnya" — bukan "tidak satu pun",
 * yang hanya menghasilkan halaman kosong.
 */
export function selectColumns<T extends string>(
  available: readonly T[],
  visible: string[] | undefined,
  always: T
): T[] {
  if (!visible || visible.length === 0) return [...available];
  return available.filter((id) => id === always || visible.includes(id));
}

// ─── Kolom rekap per mitra (Penjualan per Pelanggan / Pembelian per Pemasok) ──

export const PARTY_RECAP_COLUMNS = ["party", "docCount", "gross", "returns", "net"] as const;

export type PartyRecapColumnId = (typeof PARTY_RECAP_COLUMNS)[number];

export function partyRecapColumns(report: { visibleColumns?: string[] }): PartyRecapColumnId[] {
  return selectColumns(PARTY_RECAP_COLUMNS, report.visibleColumns, "party");
}
