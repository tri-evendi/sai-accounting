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

// ─── Bentuk Arus Kas ─────────────────────────────────────────────────────────

/**
 * Bentuk laporan Arus Kas — SATU penentu untuk layar, PDF, dan lembar sebar
 * (issue #241).
 *
 * ── Kenapa ia ada ───────────────────────────────────────────────────────────
 * Sebelum ini Arus Kas digambar TIGA kali: halaman `reports/cash-flow`,
 * `report-export.ts`, dan `pdf/statement-pdf.ts` masing-masing memutuskan
 * kolomnya, baris tetapnya, dan nasib kelompok kosongnya sendiri. Ketiganya
 * hijau di tes karena masing-masing benar menurut sumbernya sendiri, dan
 * akibatnya terlihat pengguna: periode tanpa mutasi Investasi menampilkan seksi
 * itu di layar dan tidak memuatnya sama sekali di berkas ekspor. Orang yang
 * mencocokkan layar dengan lampirannya menemukan seksi yang hilang, tanpa
 * penjelasan di kedua sisi.
 *
 * Modul ini sudah memegang pola yang benar untuk Laba/Rugi
 * (`incomeStatementLayout()`); yang kurang hanya penerapannya di sini.
 *
 * ── Tiga keputusan yang diambil sadar ───────────────────────────────────────
 *  1. **Kolom "Bersih" MENANG dan masuk ke layar.** Ia tadinya hanya ada di
 *     cetakan — angka yang tak pernah bisa diperiksa sebelum dikirim.
 *     Membuangnya dari ekspor akan MENGAMBIL kolom yang sudah dipakai orang
 *     untuk menjumlah; menambahkannya ke layar hanya memberi. Ikutannya: baris
 *     subtotal kini menyebut masuk/keluar/bersih di ketiga permukaan, bukan
 *     satu angka berarah di layar dan tiga angka di cetakan.
 *  2. **Kelompok kosong DICETAK di ketiganya** — tapi hanya tiga seksi baku
 *     (Operasi, Investasi, Pendanaan). Ia jangkar laporan: periode tanpa
 *     mutasi investasi tetap harus terbaca sebagai laporan arus kas yang utuh,
 *     dengan kalimat "tidak ada pergerakan", bukan sebagai laporan yang
 *     seksinya raib. Aturan yang sama persis dengan "Penjualan dan Beban
 *     Operasional selalu tampil" di `incomeStatementLayout()`.
 *  3. **"Belum Terkategori" hanya muncul kalau berisi.** Ia BUKAN seksi
 *     laporan melainkan ember diagnostik; yang kosong adalah kabar baik dan
 *     tidak perlu baris. Ini satu-satunya kelompok yang boleh hilang, dan
 *     layar sudah menerapkannya sejak awal.
 *  4. **Kas awal & akhir adalah BARIS TABEL di ketiganya.** Laporan arus kas
 *     yang tidak menunjukkan awal + perubahan = akhir di dalam tabelnya bukan
 *     laporan arus kas. Kartu ringkas di atas tabel layar tetap ada — ia
 *     mengulang baris yang kini ada di ketiga permukaan, bukan bentuk keempat.
 */

/**
 * Kategori arus kas. Sengaja ditulis ulang di sini alih-alih diimpor dari
 * `@/lib/reports`: modul ini TIDAK mengimpor apa pun (lihat kepala berkas), dan
 * `reports.ts` menyeret Prisma. Kalau kelima-nya suatu saat berbeda, `tsc`
 * menolak di titik `payload.category = g.category` — jadi duplikasi ini dijaga
 * tipe, bukan kebiasaan.
 */
export type CashFlowCategoryId = "operating" | "investing" | "financing" | "uncategorised";

/** Ember diagnostik, bukan seksi laporan — lihat keputusan 3 di atas. */
const UNCATEGORISED: CashFlowCategoryId = "uncategorised";

export interface CashFlowLineShape {
  code: string;
  name: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowGroupShape {
  category: CashFlowCategoryId;
  /** Nama kelompok dalam bahasa DOKUMEN CETAK. Layar menggantinya dari kamus. */
  label: string;
  lines: readonly CashFlowLineShape[];
  inflow: number;
  outflow: number;
  net: number;
}

/** Struktural dengan sengaja — muat untuk hasil pembaca laporan maupun payload ekspor. */
export interface CashFlowShape {
  groups: readonly CashFlowGroupShape[];
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
}

export type CashFlowRowKind =
  | "opening"
  | "group"
  | "line"
  | "empty"
  | "subtotal"
  | "closing"
  | "total";

export interface CashFlowLayoutRow {
  kind: CashFlowRowKind;
  /** Kelompok asal; tak ada untuk baris tetap (awal / akhir / total). */
  category?: CashFlowCategoryId;
  label: string;
  /** Hanya `kind: "line"` — kode akun, dipisah dari namanya agar layar bisa menggayainya. */
  code?: string;
  name?: string;
  /**
   * `null` berarti kolom ini TIDAK BERLAKU untuk baris ini, dan setiap
   * permukaan menggambarnya kosong. Ia bukan nol: kas awal periode tidak
   * "masuk nol rupiah", ia bukan arus sama sekali (Prinsip Inti MASTER.md).
   */
  inflow: number | null;
  outflow: number | null;
  net: number | null;
}

/**
 * Label baris yang bukan milik satu akun. Bentuk fungsi untuk yang menyisipkan
 * nama kelompok, supaya layar bisa memasok terjemahan dengan susunan katanya
 * sendiri.
 */
export interface CashFlowLabels {
  opening: string;
  closing: string;
  total: string;
  empty: string;
  subtotal: (group: string) => string;
  /** `printLabel` = `group.label`; layar mengabaikannya dan memakai kamus. */
  group: (category: CashFlowCategoryId, printLabel: string) => string;
}

/**
 * Label untuk DOKUMEN CETAK — bahasa Indonesia, seperti seluruh isi `lib/pdf`:
 * berkas yang lepas dari layarnya tidak membawa pilihan bahasa penggunanya.
 *
 * Kamus `id.json` memuat kalimat yang SAMA PERSIS (`reports.openingCashRow`,
 * `reports.closingCashRow`, `reports.netCashRow`, `reports.noCashMovement`,
 * `reports.groupSubtotal`, `cashFlowCategory.*`). Itu bukan kebetulan yang
 * dibiarkan: `tests/cash-flow-shape.test.ts` membandingkan label layar
 * berbahasa Indonesia dengan label di sini baris demi baris.
 */
export const CASH_FLOW_PRINT_LABELS: CashFlowLabels = {
  opening: "Kas & setara kas awal periode",
  closing: "Kas & setara kas akhir periode",
  total: "Kenaikan / Penurunan Kas",
  empty: "Tidak ada pergerakan kas pada periode ini.",
  subtotal: (group) => `Jumlah ${group}`,
  group: (_category, printLabel) => printLabel,
};

/**
 * Nominal untuk DOKUMEN CETAK: kolom yang tak berlaku dibiarkan KOSONG, nol
 * ditulis "-", sisanya diserahkan ke pemformat rupiah pemanggilnya.
 *
 * Nol dan "tak berlaku" sengaja berbeda rupa, dan keduanya bukan "Rp 0": akun
 * yang tidak menerima kas pada periode ini tidak menerima NOL rupiah, dan kas
 * awal periode bukan arus sama sekali. Lembar sebar adalah pengecualian yang
 * ditulis di `report-export.ts` — angkanya harus tetap bisa dijumlah.
 */
export function cashFlowPrintAmount(
  value: number | null,
  format: (amount: number) => string
): string {
  if (value === null) return "";
  return Math.round(value * 100) === 0 ? "-" : format(value);
}

/**
 * Keterangan rekonsiliasi pada baris kaki, untuk DOKUMEN CETAK.
 *
 * Layar menyampaikan hal yang sama lewat lencana di sebelah label — bentuk yang
 * tidak punya padanan di kertas. Karena itu ia ANOTASI, bukan bagian labelnya:
 * penjaga bentuk membandingkan label pokoknya, lalu memeriksa anotasi ini
 * terpisah.
 */
export function cashFlowReconciliationNote(reconciled: boolean): string {
  return reconciled ? "(cocok dengan buku besar)" : "(TIDAK COCOK — periksa buku besar)";
}

export const CASH_FLOW_COLUMNS = ["item", "inflow", "outflow", "net"] as const;

export type CashFlowColumnId = (typeof CASH_FLOW_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const CASH_FLOW_HEADERS: Record<CashFlowColumnId, string> = {
  item: "Sumber / Penggunaan Kas",
  inflow: "Kas Masuk (IDR)",
  outflow: "Kas Keluar (IDR)",
  net: "Bersih (IDR)",
};

/**
 * Seluruh baris laporan Arus Kas, dalam urutan kanoniknya, dengan angkanya
 * sudah teratasi. Yang tersisa bagi tiap permukaan hanyalah MENGGAMBAR baris —
 * tidak ada satu pun keputusan bentuk di luar fungsi ini.
 */
export function cashFlowLayout(
  statement: CashFlowShape,
  labels: CashFlowLabels = CASH_FLOW_PRINT_LABELS
): CashFlowLayoutRow[] {
  const rows: CashFlowLayoutRow[] = [
    {
      kind: "opening",
      label: labels.opening,
      inflow: null,
      outflow: null,
      net: statement.openingCash,
    },
  ];

  for (const g of statement.groups) {
    if (g.category === UNCATEGORISED && g.lines.length === 0) continue;
    const label = labels.group(g.category, g.label);
    rows.push({
      kind: "group",
      category: g.category,
      label,
      inflow: null,
      outflow: null,
      net: null,
    });
    if (g.lines.length === 0) {
      rows.push({
        kind: "empty",
        category: g.category,
        label: labels.empty,
        inflow: null,
        outflow: null,
        net: null,
      });
    } else {
      for (const l of g.lines) {
        rows.push({
          kind: "line",
          category: g.category,
          label: `${l.code}  ${l.name}`.trim(),
          code: l.code,
          name: l.name,
          inflow: l.inflow,
          outflow: l.outflow,
          net: l.net,
        });
      }
    }
    rows.push({
      kind: "subtotal",
      category: g.category,
      label: labels.subtotal(label),
      inflow: g.inflow,
      outflow: g.outflow,
      net: g.net,
    });
  }

  rows.push({
    kind: "closing",
    label: labels.closing,
    inflow: null,
    outflow: null,
    net: statement.closingCash,
  });
  // Baris kaki: total masuk, total keluar, dan perubahan bersih periode.
  // Digambar di `<tfoot>` (layar), `foot` (autoTable), dan sebagai baris
  // terakhir lembar sebar — tempat yang berbeda, urutan yang sama.
  rows.push({
    kind: "total",
    label: labels.total,
    inflow: statement.totalInflow,
    outflow: statement.totalOutflow,
    net: statement.netChange,
  });

  return rows;
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

// ─── Kolom Nilai Persediaan ──────────────────────────────────────────────────

export const STOCK_VALUE_COLUMNS = [
  "name",
  "unit",
  "currentStock",
  "unitCost",
  "stockValue",
] as const;

export type StockValueColumnId = (typeof STOCK_VALUE_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const STOCK_VALUE_HEADERS: Record<StockValueColumnId, string> = {
  name: "Barang",
  unit: "Satuan",
  currentStock: "Saldo",
  unitCost: "Biaya/Unit (IDR)",
  stockValue: "Nilai (IDR)",
};

export function stockValueColumns(report: { visibleColumns?: string[] }): StockValueColumnId[] {
  return selectColumns(STOCK_VALUE_COLUMNS, report.visibleColumns, "name");
}

// ─── Kolom Laporan Kas & Bank ────────────────────────────────────────────────

export const CASH_BANK_COLUMNS = ["account", "opening", "net", "closing"] as const;

export type CashBankColumnId = (typeof CASH_BANK_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const CASH_BANK_HEADERS: Record<CashBankColumnId, string> = {
  account: "Akun Kas & Bank",
  opening: "Saldo Awal (IDR)",
  net: "Perubahan (IDR)",
  closing: "Saldo Akhir (IDR)",
};

export function cashBankColumns(report: { visibleColumns?: string[] }): CashBankColumnId[] {
  return selectColumns(CASH_BANK_COLUMNS, report.visibleColumns, "account");
}

// ─── Kolom Umur Piutang / Umur Utang ─────────────────────────────────────────

export const AGING_COLUMNS = [
  "party",
  "documentNo",
  "date",
  "dueDate",
  "age",
  "status",
  "total",
  "outstanding",
] as const;

export type AgingColumnId = (typeof AGING_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const AGING_HEADERS: Record<AgingColumnId, string> = {
  party: "Mitra",
  documentNo: "Dokumen",
  date: "Tanggal",
  dueDate: "Jatuh Tempo",
  age: "Umur",
  status: "Status",
  total: "Nilai Dokumen",
  outstanding: "Sisa (IDR)",
};

export function agingColumns(report: { visibleColumns?: string[] }): AgingColumnId[] {
  return selectColumns(AGING_COLUMNS, report.visibleColumns, "party");
}

// ─── Kolom Realisasi vs Anggaran ─────────────────────────────────────────────

export const BUDGET_COLUMNS = [
  "account",
  "budget",
  "actual",
  "variance",
  "variancePct",
  "status",
] as const;

export type BudgetColumnId = (typeof BUDGET_COLUMNS)[number];

/** Judul kolom untuk DOKUMEN CETAK — bahasa Indonesia; layar memakai kamus. */
export const BUDGET_HEADERS: Record<BudgetColumnId, string> = {
  account: "Akun",
  budget: "Anggaran (IDR)",
  actual: "Realisasi (IDR)",
  variance: "Selisih (IDR)",
  variancePct: "Selisih %",
  status: "Keterangan",
};

export function budgetColumns(report: { visibleColumns?: string[] }): BudgetColumnId[] {
  return selectColumns(BUDGET_COLUMNS, report.visibleColumns, "account");
}
