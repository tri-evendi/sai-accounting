/**
 * PDF export for the four financial statements (issue #18):
 * Neraca Saldo, Laba/Rugi, Neraca and Arus Kas.
 *
 * Same approach as every other export in this folder — build a jsPDF document
 * with `jspdf-autotable` and hand it back to the caller to `.save()` — so there
 * is one PDF stack in the app, not two. A single entry point covers all four
 * statements because they share a header, a footer and the same money format;
 * only the table body differs, which is what the tagged `StatementPayload`
 * selects on.
 *
 * Every figure is IDR base (see the header of `src/lib/reports.ts`); the reports
 * never mix currencies, so the export does not either.
 */
import { PRINT_BRAND } from "@/lib/pdf/brand";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  incomeStatementLayout,
  agingColumns,
  agingHeaders,
  balanceSheetBalanceNote,
  balanceSheetLayout,
  budgetColumns,
  cashBankColumns,
  cashFlowLayout,
  cashFlowPrintAmount,
  cashFlowReconciliationNote,
  partyRecapColumns,
  splitBalanceSheetRows,
  splitIncomeStatementRows,
  splitTrialBalanceRows,
  stockMovementColumns,
  stockValueColumns,
  trialBalanceBalanceNote,
  trialBalanceLayout,
  trialBalancePrintAmount,
  BALANCE_SHEET_COLUMNS,
  BALANCE_SHEET_HEADERS,
  BUDGET_HEADERS,
  CASH_BANK_HEADERS,
  CASH_FLOW_COLUMNS,
  CASH_FLOW_HEADERS,
  INCOME_STATEMENT_COLUMNS,
  INCOME_STATEMENT_HEADERS,
  STOCK_MOVEMENT_HEADERS,
  STOCK_VALUE_HEADERS,
  TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_HEADERS,
  type AgingColumnId,
  type BalanceSheetLayoutRow,
  type BalanceSheetRowKind,
  type BudgetColumnId,
  type CashBankColumnId,
  type CashFlowCategoryId,
  type IncomeStatementLayoutRow,
  type IncomeStatementRowKind,
  type PartyRecapColumnId,
  type StockMovementColumnId,
  type StockValueColumnId,
  type TrialBalanceLayoutRow,
} from "@/lib/statement-layout";

/** A plain, serialisable line — server components pass these to the client button. */
export interface StatementRow {
  code: string;
  name: string;
  amount: number;
}

/** One band of the multi-step Laba/Rugi, serialisable (issue #123). */
export interface StatementSectionPayload {
  lines: StatementRow[];
  total: number;
}

export interface CashFlowGroupPayload {
  /**
   * Kategori kanonik. Ada di payload sejak issue #241 karena bentuk laporan
   * bergantung padanya: "Belum Terkategori" adalah ember diagnostik yang boleh
   * hilang saat kosong, tiga seksi baku lainnya tidak — dan `cashFlowLayout()`
   * tidak bisa membedakannya dari `label` yang sudah diterjemahkan.
   */
  category: CashFlowCategoryId;
  label: string;
  lines: { code: string; name: string; inflow: number; outflow: number; net: number }[];
  inflow: number;
  outflow: number;
  net: number;
}

export type StatementPayload =
  | {
      kind: "trial-balance";
      period: string;
      rows: { code: string; name: string; debit: number; credit: number }[];
      totalDebit: number;
      totalCredit: number;
      balanced: boolean;
    }
  | {
      kind: "income-statement";
      period: string;
      sales: StatementSectionPayload;
      cogs: StatementSectionPayload;
      grossProfit: number;
      operatingExpense: StatementSectionPayload;
      operatingProfit: number;
      otherIncome: StatementSectionPayload;
      otherExpense: StatementSectionPayload;
      netIncome: number;
    }
  | {
      kind: "balance-sheet";
      period: string;
      assets: StatementRow[];
      liabilities: StatementRow[];
      equity: StatementRow[];
      totalAssets: number;
      totalLiabilities: number;
      totalEquity: number;
      netIncome: number;
      totalLiabilitiesEquity: number;
      balanced: boolean;
    }
  /**
   * Kartu Stok (issue #126). Quantities, not money — every figure here is
   * `Decimal(15,3)` and must never be rendered with the rupiah formatter.
   */
  | {
      kind: "stock-movement";
      period: string;
      rows: {
        name: string;
        unit: string | null;
        opening: number;
        movedIn: number;
        movedOut: number;
        processed: number;
        closing: number;
      }[];
      totalOpening: number;
      totalIn: number;
      totalOut: number;
      totalProcessed: number;
      totalClosing: number;
      hasProcess: boolean;
      dormantCount: number;
      /**
       * Kolom yang dipilih pengguna di dialog parameter (`?cols=`). Tak diisi =
       * seluruh kolom yang punya isi. Ia hanya boleh mengurangi — lihat
       * `stockMovementColumns()`.
       */
      visibleColumns?: string[];
    }
  /** Riwayat Hitung Ulang Stok (issue #129). Quantities, signed by direction. */
  | {
      kind: "opname-history";
      period: string;
      sessions: {
        dateISO: string;
        adjustments: { itemName: string; unit: string | null; variance: number }[];
        increase: number;
        decrease: number;
      }[];
      sessionCount: number;
      adjustmentCount: number;
      totalIncrease: number;
      totalDecrease: number;
      netVariance: number;
    }
  /**
   * Rekap per mitra — dua laporan berbentuk sama (Penjualan per Pelanggan,
   * Pembelian per Pemasok). Jenisnya dipisah, bukan satu jenis dengan penanda
   * sisi, supaya judul dokumen & nama lembarnya tetap satu peta tanpa cabang.
   *
   * Semua nominal IDR base. Dokumen valas tanpa kurs TIDAK ikut dijumlahkan —
   * `unratedCount` membawanya supaya cetakan bisa mengatakannya, persis seperti
   * layar. Angka yang diam-diam kehilangan sebagian dokumennya adalah cara
   * termudah sebuah rekap dipercaya padahal salah.
   */
  | {
      kind: "sales-by-customer" | "purchases-by-supplier";
      period: string;
      rows: {
        partyName: string | null;
        docCount: number;
        grossBase: number;
        returnBase: number;
        netBase: number;
        unratedCount: number;
      }[];
      totals: {
        docCount: number;
        grossBase: number;
        returnBase: number;
        netBase: number;
        unratedCount: number;
      };
      visibleColumns?: string[];
    }
  /**
   * Umur Piutang / Umur Utang — dokumen belum lunas per satu tanggal, beserta
   * ringkasan embernya.
   *
   * `outstandingBase` boleh `null`: dokumen valas tanpa kurs tidak punya nilai
   * IDR yang jujur. Ia TIDAK dijadikan nol (itu akan menyusutkan total tanpa
   * bersuara) melainkan dibawa apa adanya dan dihitung di `unresolved`, persis
   * seperti di layar.
   */
  | {
      kind: "receivables" | "payables";
      period: string;
      rows: {
        partyName: string;
        documentNo: string;
        date: string;
        dueDate: string | null;
        ageDays: number;
        ageFromIssue: boolean;
        status: string;
        total: number;
        currency: string;
        outstandingBase: number | null;
      }[];
      buckets: { label: string; amount: number }[];
      total: number;
      unresolved: number;
      visibleColumns?: string[];
    }
  /**
   * Nilai Persediaan — saldo & nilai tiap komoditas saat ini.
   *
   * `unitCost`/`stockValue` boleh `null`: barang tanpa dasar biaya (legacy
   * tanpa `unit_cost`) tidak punya nilai yang jujur, dan Rp 0 akan menyatakan
   * bahwa barang yang ada wujudnya tidak bernilai apa-apa.
   */
  | {
      kind: "stock-value";
      period: string;
      rows: {
        name: string;
        unit: string | null;
        currentStock: number;
        unitCost: number | null;
        stockValue: number | null;
      }[];
      totalValue: number;
      uncostedCount: number;
      visibleColumns?: string[];
    }
  /**
   * Laporan Kas & Bank — saldo awal, perubahan, dan saldo akhir TIAP akun kas
   * & bank pada satu periode. Sumbernya pembaca arus kas yang sama, jadi
   * "perubahan" di sini tak bisa berselisih dengan arus kas bersih di sana.
   */
  | {
      kind: "cash-bank";
      period: string;
      rows: { code: string; name: string; opening: number; net: number; closing: number }[];
      openingCash: number;
      netChange: number;
      closingCash: number;
      visibleColumns?: string[];
    }
  /**
   * Realisasi vs Anggaran — rencana, kenyataan, dan selisihnya per akun.
   *
   * `status` sudah berupa kata ("Di atas anggaran"/"Di bawah anggaran"/"Sesuai
   * anggaran"), bukan enum mentah: cetakan tidak punya lencana berwarna, jadi
   * arah selisih harus terbaca sebagai teks. `variancePct` boleh `null` — akun
   * beranggaran nol tidak punya persentase, dan "0%" akan menyatakan sesuatu
   * yang tidak dikatakan angkanya.
   */
  | {
      kind: "budget-realization";
      period: string;
      rows: {
        code: string;
        name: string;
        budget: number;
        actual: number;
        variance: number;
        variancePct: number | null;
        status: string;
      }[];
      totalBudget: number;
      totalActual: number;
      totalVariance: number;
      totalVariancePct: number | null;
      alertCount: number;
      /** Ringkasan target penjualan periode yang sama; null bila tak ada target. */
      salesTarget: { target: number; actual: number; variance: number } | null;
      visibleColumns?: string[];
    }
  | {
      kind: "cash-flow";
      period: string;
      groups: CashFlowGroupPayload[];
      totalInflow: number;
      totalOutflow: number;
      netChange: number;
      openingCash: number;
      closingCash: number;
      reconciled: boolean;
      suspectUnrated: number;
    };

export const STATEMENT_TITLES: Record<StatementPayload["kind"], string> = {
  "trial-balance": "Neraca Saldo",
  "income-statement": "Laporan Laba / Rugi",
  "balance-sheet": "Neraca",
  "cash-flow": "Laporan Arus Kas",
  "stock-movement": "Kartu Stok / Mutasi Persediaan",
  "opname-history": "Riwayat Hitung Ulang Stok (Stok Opname)",
  "sales-by-customer": "Penjualan per Pelanggan",
  "purchases-by-supplier": "Pembelian per Pemasok",
  receivables: "Piutang & Umur Piutang",
  payables: "Utang & Umur Utang",
  "stock-value": "Nilai Persediaan",
  "cash-bank": "Laporan Kas & Bank",
  "budget-realization": "Realisasi vs Anggaran",
};

/**
 * Judul kolom rekap mitra untuk DOKUMEN CETAK — bahasa Indonesia, seperti
 * seluruh isi modul ini. Kolom pihaknya berbeda per laporan; sisanya sama.
 *
 * DIEKSPOR hanya supaya `tests/print-label-dictionary.test.ts` bisa
 * membandingkannya dengan nilai kamus Indonesia yang dibaca layar (issue #298);
 * tidak ada kode produksi lain yang memakainya.
 */
export const PARTY_RECAP_HEADERS: Record<
  "sales-by-customer" | "purchases-by-supplier",
  Record<PartyRecapColumnId, string>
> = {
  "sales-by-customer": {
    party: "Pelanggan",
    docCount: "Dokumen",
    gross: "Penjualan Kotor (IDR)",
    returns: "Retur (IDR)",
    net: "Bersih (IDR)",
  },
  "purchases-by-supplier": {
    party: "Pemasok",
    docCount: "Dokumen",
    gross: "Pembelian Kotor (IDR)",
    returns: "Retur (IDR)",
    net: "Bersih (IDR)",
  },
};

/** Tanggal hitung ulang, format layar (id-ID) — bukan ISO mentah "2026-07-30". */
function opnameDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

/** Kuantitas bertanda: "+40" / "−12,5". Tanda adalah penanda NON-WARNA-nya. */
function signedQty(value: number): string {
  const text = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

/**
 * Quantity, id-ID, up to three decimals with trailing zeros dropped — the screen
 * uses `formatNumber` from `@/lib/utils`, and this must agree with it or the
 * printout and the page would disagree on the same figure.
 */
function qty(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value);
}

const BRAND = PRINT_BRAND;

/** IDR, id-ID, no decimals — matches `formatCurrency` in the UI so the two agree. */
function rp(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Where the last autoTable finished — jspdf-autotable stashes this on the doc. */
function afterTable(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY;
}

function header(doc: jsPDF, title: string, period: string, company: { name: string; address: string }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company.name, pageWidth / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(12);
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(period, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")} · Nilai dalam IDR`, pageWidth / 2, y, {
    align: "center",
  });

  return y + 8;
}

/**
 * Badan + kaki tabel Arus Kas sebagai teks — dipisah dari penggambarnya supaya
 * bisa DIBANDINGKAN dengan lembar sebar dan layar tanpa satu byte PDF pun
 * (issue #241). Bentuknya seluruhnya milik `cashFlowLayout()`; di sini hanya
 * ada penulisan angka dan takuk baris akun.
 */
export function cashFlowPrintRows(payload: Extract<StatementPayload, { kind: "cash-flow" }>): {
  body: string[][];
  foot: string[];
} {
  const rows = cashFlowLayout(payload).map((r) => [
    // Takuk baris akun adalah tampilan, bukan bentuk — kertas tidak punya
    // `paddingInlineStart`.
    r.kind === "line" ? `   ${r.label}` : r.label,
    cashFlowPrintAmount(r.inflow, rp),
    cashFlowPrintAmount(r.outflow, rp),
    cashFlowPrintAmount(r.net, rp),
  ]);
  // Baris terakhir `cashFlowLayout()` selalu barisan kaki — lihat modul itu.
  const foot = rows[rows.length - 1];
  foot[0] = `${foot[0]} ${cashFlowReconciliationNote(payload.reconciled)}`;
  return { body: rows.slice(0, -1), foot };
}

/**
 * Badan + kaki tabel Neraca sebagai teks — dipisah dari penggambarnya supaya
 * bisa DIBANDINGKAN dengan lembar sebar dan layar tanpa satu byte PDF pun
 * (issue #258, pola yang sama dengan `cashFlowPrintRows`). Bentuknya seluruhnya
 * milik `balanceSheetLayout()`; di sini hanya ada penulisan angka dan takuk
 * baris akun.
 */
export function balanceSheetPrintRows(
  payload: Extract<StatementPayload, { kind: "balance-sheet" }>
): { body: string[][]; foot: string[][]; bodyKinds: BalanceSheetRowKind[] } {
  const { body, foot } = splitBalanceSheetRows(balanceSheetLayout(payload));
  const cell = (r: BalanceSheetLayoutRow, label: string): string[] => [
    // Takuk baris akun adalah tampilan, bukan bentuk — kertas tidak punya
    // `paddingInlineStart`.
    r.kind === "line" ? `   ${label}` : label,
    // Kolom yang tidak berlaku tetap KOSONG, tak pernah "Rp 0" (Prinsip Inti
    // MASTER.md). Nol yang memang nol tertulis apa adanya — di neraca ia
    // pernyataan posisi, bukan ketiadaan arus.
    r.amount === null ? "" : rp(r.amount),
  ];
  return {
    body: body.map((r) => cell(r, r.label)),
    // Keseimbangan adalah ANOTASI pada baris penutup terakhir — lencana di
    // layar, tanda kurung di sini dan di lembar sebar.
    foot: foot.map((r, i) =>
      cell(
        r,
        i === foot.length - 1 ? `${r.label} ${balanceSheetBalanceNote(payload.balanced)}` : r.label
      )
    ),
    bodyKinds: body.map((r) => r.kind),
  };
}

/**
 * Badan + kaki tabel Neraca Saldo sebagai teks — dipisah dari penggambarnya
 * supaya bisa DIBANDINGKAN dengan lembar sebar dan layar tanpa satu byte PDF
 * pun (issue #275, pola yang sama dengan `cashFlowPrintRows` dan
 * `balanceSheetPrintRows`). Bentuknya seluruhnya milik `trialBalanceLayout()`;
 * di sini hanya ada penulisan angka.
 *
 * `foot` KOSONG pada buku yang belum punya satu jurnal pun — `autoTable`
 * menggambar tabel tanpa kaki, jadi cetakannya tidak lagi menyatakan "Total
 * (Seimbang)" tentang buku yang tidak berisi apa-apa.
 */
export function trialBalancePrintRows(
  payload: Extract<StatementPayload, { kind: "trial-balance" }>
): { body: string[][]; foot: string[][] } {
  const { body, foot } = splitTrialBalanceRows(trialBalanceLayout(payload));
  const cell = (r: TrialBalanceLayoutRow, name: string): string[] => [
    r.code ?? "",
    name,
    // Kolom yang tidak berlaku tetap KOSONG, tak pernah "Rp 0" (Prinsip Inti
    // MASTER.md); nol ditulis "-" — akun yang tidak bersaldo di sisi itu.
    trialBalancePrintAmount(r.debit, rp),
    trialBalancePrintAmount(r.credit, rp),
  ];
  return {
    body: body.map((r) => cell(r, r.name)),
    // Keseimbangan adalah ANOTASI pada baris Total — lencana di layar, tanda
    // kurung di sini dan di lembar sebar.
    foot: foot.map((r) => cell(r, `${r.name} ${trialBalanceBalanceNote(payload.balanced)}`)),
  };
}

/**
 * Badan + kaki tabel Laba/Rugi sebagai teks — dipisah dari penggambarnya supaya
 * bisa DIBANDINGKAN dengan lembar sebar dan layar tanpa satu byte PDF pun
 * (issue #274, pola yang sama dengan tiga laporan sebelumnya). Bentuknya
 * seluruhnya milik `incomeStatementLayout()`; di sini hanya ada penulisan angka,
 * takuk baris akun, dan penempelan anotasi.
 */
export function incomeStatementPrintRows(
  payload: Extract<StatementPayload, { kind: "income-statement" }>
): { body: string[][]; foot: string[][]; bodyKinds: IncomeStatementRowKind[] } {
  const { body, foot } = splitIncomeStatementRows(incomeStatementLayout(payload));
  const cell = (r: IncomeStatementLayoutRow): string[] => [
    // Takuk baris akun adalah tampilan, bukan bentuk — kertas tidak punya
    // `paddingInlineStart`. Anotasi (marjin kotor, arah hasil) dalam tanda
    // kurung; di layar ia span kecil berwarna.
    (r.kind === "line" ? `   ${r.label}` : r.label) + (r.note === undefined ? "" : ` (${r.note})`),
    // Kolom yang tidak berlaku tetap KOSONG, tak pernah "Rp 0" (Prinsip Inti
    // MASTER.md). Nol yang memang nol tertulis apa adanya — di laporan laba/rugi
    // ia pernyataan tentang periodenya, bukan ketiadaan arus seperti di Arus Kas.
    r.amount === null ? "" : rp(r.amount),
  ];
  return {
    body: body.map(cell),
    foot: foot.map(cell),
    bodyKinds: body.map((r) => r.kind),
  };
}

export function generateStatementPDF(payload: StatementPayload, company: { name: string; address: string }): jsPDF {
  const doc = new jsPDF();
  /*
   * `const` sejak issue #274: Laba/Rugi adalah cabang TERAKHIR yang menggeser
   * titik tulis sendiri — satu `autoTable` per band, lalu `doc.text()` di
   * antaranya. Sekarang keempat laporan keuangan menggambar SATU tabel yang
   * dimulai tepat di bawah kepala dokumen, jadi tidak ada lagi kursor vertikal
   * yang berjalan.
   */
  const y = header(doc, STATEMENT_TITLES[payload.kind], payload.period, company);

  if (payload.kind === "trial-balance") {
    const { body, foot } = trialBalancePrintRows(payload);
    autoTable(doc, {
      startY: y,
      head: [TRIAL_BALANCE_COLUMNS.map((c) => TRIAL_BALANCE_HEADERS[c])],
      body,
      foot,
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    });
  }

  if (payload.kind === "income-statement") {
    /*
     * SATU tabel, bukan satu per band (issue #274) — dan tidak satu pun baris
     * yang digambar `doc.text()`. Dulu tiap band punya tabelnya sendiri dengan
     * judul band sebagai KEPALA tabel, sementara "LABA KOTOR", "LABA USAHA" dan
     * "LABA BERSIH" berdiri di luar tabel mana pun sebagai teks lepas: tidak
     * bisa dijumlah, tidak ikut tersalin, dan lepas dari perataan kolomnya.
     *
     * Judul band & subtotal kehilangan latar berwarnanya, jadi ketebalan huruf
     * yang menggantikannya — sama persis dengan Neraca (#258).
     */
    const { body, foot, bodyKinds } = incomeStatementPrintRows(payload);
    autoTable(doc, {
      startY: y,
      head: [INCOME_STATEMENT_COLUMNS.map((c) => INCOME_STATEMENT_HEADERS[c])],
      body,
      foot,
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        if (bodyKinds[data.row.index] !== "line") data.cell.styles.fontStyle = "bold";
      },
    });
  }

  if (payload.kind === "balance-sheet") {
    /*
     * SATU tabel, bukan tiga (issue #258). Dulu tiap seksi punya tabelnya
     * sendiri — dengan judul seksi sebagai KEPALA tabel — sehingga urutan &
     * jumlah barisnya tak bisa dibandingkan dengan layar maupun lembar sebar,
     * dan baris penutupnya berdiri di luar tabel mana pun sebagai teks lepas.
     *
     * Judul seksi & subtotal kehilangan latar berwarnanya, jadi ketebalan huruf
     * yang menggantikannya: sebuah laporan keuangan yang seluruh barisnya
     * serupa tidak bisa dibaca sekilas.
     */
    const { body, foot, bodyKinds } = balanceSheetPrintRows(payload);
    autoTable(doc, {
      startY: y,
      head: [BALANCE_SHEET_COLUMNS.map((c) => BALANCE_SHEET_HEADERS[c])],
      body,
      foot,
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        if (bodyKinds[data.row.index] !== "line") data.cell.styles.fontStyle = "bold";
      },
    });
  }

  if (payload.kind === "stock-movement") {
    // Susunan kolomnya diputuskan `stockMovementColumns()` — satu aturan yang
    // dipakai layar, lembar sebar, dan cetakan ini (isi laporan dulu, baru
    // pilihan pengguna).
    const cols = stockMovementColumns(payload);
    const head = cols.map((c) => STOCK_MOVEMENT_HEADERS[c]);

    const row = (r: (typeof payload.rows)[number]) =>
      cols.map((c) => (c === "name" ? r.name : c === "unit" ? r.unit || "-" : qty(r[c])));
    const totals: Record<StockMovementColumnId, string> = {
      name: "Total",
      unit: "",
      opening: qty(payload.totalOpening),
      movedIn: qty(payload.totalIn),
      movedOut: qty(payload.totalOut),
      processed: qty(payload.totalProcessed),
      closing: qty(payload.totalClosing),
    };
    const footer = cols.map((c) => totals[c]);

    // Right-align every numeric column, whichever count this report has.
    const columnStyles: Record<number, { halign: "right" }> = {};
    cols.forEach((c, i) => {
      if (c !== "name" && c !== "unit") columnStyles[i] = { halign: "right" };
    });

    autoTable(doc, {
      startY: y,
      head: [head],
      body: payload.rows.length
        ? payload.rows.map(row)
        : [["Tidak ada mutasi pada periode ini.", ...Array(head.length - 1).fill("")]],
      foot: [footer],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });

    // Dormant items are omitted from the table; saying so is what keeps the
    // omission honest rather than making the master look shorter than it is.
    if (payload.dormantCount > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Catatan: ${payload.dormantCount} barang tanpa saldo awal dan tanpa mutasi pada periode ini tidak ditampilkan.`,
        14,
        afterTable(doc) + 6
      );
    }
  }

  if (payload.kind === "opname-history") {
    autoTable(doc, {
      startY: y,
      head: [["Tanggal Hitung", "Barang", "Satuan", "Selisih"]],
      body: payload.sessions.length
        ? payload.sessions.flatMap((s) => [
            [
              { content: `Hitung ulang ${opnameDate(s.dateISO)}`, colSpan: 2, styles: { fontStyle: "bold" as const } },
              { content: `Lebih ${signedQty(s.increase)}`, styles: { halign: "right" as const } },
              { content: `Susut ${signedQty(-s.decrease)}`, styles: { halign: "right" as const } },
            ],
            ...s.adjustments.map((a) => ["", `   ${a.itemName}`, a.unit || "-", signedQty(a.variance)]),
          ])
        : [["", "Tidak ada hitung ulang stok pada periode ini.", "", ""]],
      foot: [
        [
          `${payload.sessionCount} kali hitung ulang`,
          `${payload.adjustmentCount} penyesuaian barang`,
          "Selisih bersih",
          signedQty(payload.netVariance),
        ],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" } },
    });
  }

  if (payload.kind === "sales-by-customer" || payload.kind === "purchases-by-supplier") {
    const cols = partyRecapColumns(payload);
    const headers = PARTY_RECAP_HEADERS[payload.kind];
    // Baris tanpa mitra tercatat: layar menuliskannya sebagai teks redup, dan
    // cetakan tidak punya warna redup — jadi ia diberi nama di sini, bukan
    // dibiarkan sebagai sel kosong yang terbaca sebagai kelalaian.
    const noParty = payload.kind === "sales-by-customer" ? "Tanpa pelanggan" : "Tanpa pemasok";
    const cell = (
      r: (typeof payload.rows)[number] | (typeof payload.totals & { partyName: string })
    ) => ({
      party: "partyName" in r ? r.partyName ?? noParty : "",
      docCount: String(r.docCount),
      gross: rp(r.grossBase),
      // Retur = pengurang. Tandanya yang menyatakannya, bukan warna.
      returns: r.returnBase > 0 ? rp(-r.returnBase) : rp(0),
      net: rp(r.netBase),
    });

    const columnStyles: Record<number, { halign: "right" }> = {};
    cols.forEach((c, i) => {
      if (c !== "party") columnStyles[i] = { halign: "right" };
    });

    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => headers[c])],
      body: payload.rows.length
        ? payload.rows.map((r) => {
            const values = cell(r);
            return cols.map((c) => values[c]);
          })
        : [["Tidak ada dokumen pada periode ini.", ...Array(cols.length - 1).fill("")]],
      foot: [
        cols.map((c) => (c === "party" ? "Total" : cell({ ...payload.totals, partyName: "" })[c])),
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });

    // Dokumen valas tanpa kurs tidak ikut dijumlahkan. Angka yang diam-diam
    // kehilangan sebagian dokumennya adalah cara termudah rekap ini dipercaya
    // padahal salah — jadi cetakan mengatakannya, sama seperti layar.
    if (payload.totals.unratedCount > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Catatan: ${payload.totals.unratedCount} dokumen valas tanpa kurs tidak ikut dijumlahkan.`,
        14,
        afterTable(doc) + 6
      );
    }
  }

  if (payload.kind === "budget-realization") {
    const cols = budgetColumns(payload);
    const pct = (value: number | null) =>
      value === null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
    const cell = (r: (typeof payload.rows)[number], c: BudgetColumnId): string => {
      switch (c) {
        case "account":
          return `${r.code}  ${r.name}`.trim();
        case "budget":
          return rp(r.budget);
        case "actual":
          return rp(r.actual);
        // Selisih selalu bertanda: arahnya adalah isi laporan ini, dan cetakan
        // tidak punya warna untuk menyampaikannya.
        case "variance":
          return `${r.variance > 0 ? "+" : ""}${rp(r.variance)}`;
        case "variancePct":
          return pct(r.variancePct);
        case "status":
          return r.status;
      }
    };

    const columnStyles: Record<number, { halign: "right" }> = {};
    cols.forEach((c, i) => {
      if (c !== "account" && c !== "status") columnStyles[i] = { halign: "right" };
    });

    const totals: Record<BudgetColumnId, string> = {
      account: "Total",
      budget: rp(payload.totalBudget),
      actual: rp(payload.totalActual),
      variance: `${payload.totalVariance > 0 ? "+" : ""}${rp(payload.totalVariance)}`,
      variancePct: pct(payload.totalVariancePct),
      status: payload.alertCount > 0 ? `${payload.alertCount} akun melewati ambang` : "",
    };

    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => BUDGET_HEADERS[c])],
      body: payload.rows.length
        ? payload.rows.map((r) => cols.map((c) => cell(r, c)))
        : [["Belum ada anggaran untuk periode ini.", ...Array(cols.length - 1).fill("")]],
      foot: [cols.map((c) => totals[c])],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });

    // Target penjualan hidup di halaman yang sama dengan realisasi anggaran,
    // jadi cetakannya pun membawanya — sebagai blok terpisah, karena ia
    // membandingkan hal yang berbeda (satu angka target, bukan per akun).
    if (payload.salesTarget) {
      autoTable(doc, {
        startY: afterTable(doc) + 6,
        head: [["Target Penjualan", "Target", "Realisasi", "Selisih"]],
        body: [
          [
            "Total penjualan periode ini",
            rp(payload.salesTarget.target),
            rp(payload.salesTarget.actual),
            `${payload.salesTarget.variance > 0 ? "+" : ""}${rp(payload.salesTarget.variance)}`,
          ],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: BRAND },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
    }
  }

  if (payload.kind === "cash-bank") {
    const cols = cashBankColumns(payload);
    const cell = (r: (typeof payload.rows)[number], c: CashBankColumnId) =>
      c === "account" ? `${r.code}  ${r.name}`.trim() : rp(r[c]);

    const columnStyles: Record<number, { halign: "right" }> = {};
    cols.forEach((c, i) => {
      if (c !== "account") columnStyles[i] = { halign: "right" };
    });

    const totals: Record<CashBankColumnId, string> = {
      account: "Total",
      opening: rp(payload.openingCash),
      net: rp(payload.netChange),
      closing: rp(payload.closingCash),
    };

    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => CASH_BANK_HEADERS[c])],
      body: payload.rows.length
        ? payload.rows.map((r) => cols.map((c) => cell(r, c)))
        : [["Tidak ada akun kas & bank yang bergerak pada periode ini.", ...Array(cols.length - 1).fill("")]],
      foot: [cols.map((c) => totals[c])],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });
  }

  if (payload.kind === "stock-value") {
    const cols = stockValueColumns(payload);
    const cell = (r: (typeof payload.rows)[number], c: StockValueColumnId) => {
      if (c === "name") return r.name;
      if (c === "unit") return r.unit || "-";
      if (c === "currentStock") return qty(r.currentStock);
      // Barang tanpa dasar biaya: garis, bukan Rp 0. Nol menyatakan "tidak
      // bernilai", dan itu bukan yang buku besar katakan tentang barang yang
      // ada wujudnya — ia hanya belum punya biaya perolehan tercatat.
      const value = c === "unitCost" ? r.unitCost : r.stockValue;
      return value == null ? "—" : rp(value);
    };

    const columnStyles: Record<number, { halign: "right" }> = {};
    cols.forEach((c, i) => {
      if (c !== "name" && c !== "unit") columnStyles[i] = { halign: "right" };
    });

    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => STOCK_VALUE_HEADERS[c])],
      body: payload.rows.length
        ? payload.rows.map((r) => cols.map((c) => cell(r, c)))
        : [["Belum ada barang.", ...Array(cols.length - 1).fill("")]],
      foot: [
        cols.map((c) =>
          c === "name" ? "Total Nilai Persediaan" : c === "stockValue" ? rp(payload.totalValue) : ""
        ),
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });

    if (payload.uncostedCount > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Catatan: ${payload.uncostedCount} barang bersaldo belum punya dasar biaya, jadi nilainya tidak ikut dijumlahkan.`,
        14,
        afterTable(doc) + 6
      );
    }
  }

  if (payload.kind === "receivables" || payload.kind === "payables") {
    // Ringkasan ember lebih dulu: pertanyaan pertama yang dibawa orang ke
    // laporan ini adalah "berapa yang sudah lewat 90 hari", bukan "dokumen apa
    // saja". Daftar dokumennya menyusul sebagai buktinya.
    autoTable(doc, {
      startY: y,
      head: [payload.buckets.map((b) => b.label)],
      body: [payload.buckets.map((b) => rp(b.amount))],
      foot: [[`Total: ${rp(payload.total)}`, ...Array(payload.buckets.length - 1).fill("")]],
      styles: { fontSize: 9, halign: "right" },
      headStyles: { fillColor: BRAND, halign: "right" },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", halign: "left" },
    });

    const cols = agingColumns(payload);
    // Judul kolomnya — termasuk kolom pihak — datang dari `statement-layout.ts`,
    // satu penentu untuk PDF dan lembar sebar (#310).
    const headers = agingHeaders(payload.kind);
    const cell = (r: (typeof payload.rows)[number], c: AgingColumnId): string => {
      switch (c) {
        case "party":
          return r.partyName;
        case "documentNo":
          return r.documentNo;
        case "date":
          return r.date;
        case "dueDate":
          return r.dueDate ?? "-";
        // Umur yang dihitung dari TANGGAL DOKUMEN (bukan jatuh tempo, yang
        // tidak ada) diberi tanda — tanpa itu dua angka yang artinya berbeda
        // berdiri di kolom yang sama.
        case "age":
          return `${r.ageDays} hari${r.ageFromIssue ? " *" : ""}`;
        case "status":
          return r.status;
        case "total":
          return `${r.currency} ${r.total.toLocaleString("id-ID")}`;
        // Dokumen valas tanpa kurs: garis, bukan nol. Nol adalah pernyataan
        // "tidak ada sisa", dan itu bukan yang buku besar katakan.
        case "outstanding":
          return r.outstandingBase == null ? "—" : rp(r.outstandingBase);
      }
    };

    const columnStyles: Record<number, { halign: "right" }> = {};
    cols.forEach((c, i) => {
      if (c === "age" || c === "total" || c === "outstanding") columnStyles[i] = { halign: "right" };
    });

    autoTable(doc, {
      startY: afterTable(doc) + 6,
      head: [cols.map((c) => headers[c])],
      body: payload.rows.length
        ? payload.rows.map((r) => cols.map((c) => cell(r, c)))
        : [["Tidak ada dokumen yang belum lunas.", ...Array(cols.length - 1).fill("")]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: BRAND },
      columnStyles,
    });

    const notes: string[] = [];
    if (payload.rows.some((r) => r.ageFromIssue)) {
      notes.push("* Umur dihitung dari tanggal dokumen karena tanggal jatuh temponya tidak ada.");
    }
    if (payload.unresolved > 0) {
      notes.push(
        `${payload.unresolved} dokumen valas tanpa kurs tidak punya nilai IDR, jadi tidak ikut dijumlahkan.`
      );
    }
    if (notes.length > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      let noteY = afterTable(doc) + 6;
      for (const n of notes) {
        doc.text(n, 14, noteY);
        noteY += 5;
      }
    }
  }

  if (payload.kind === "cash-flow") {
    const { body, foot } = cashFlowPrintRows(payload);
    autoTable(doc, {
      startY: y,
      head: [CASH_FLOW_COLUMNS.map((c) => CASH_FLOW_HEADERS[c])],
      body,
      foot: [foot],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    if (payload.suspectUnrated > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Catatan: ${payload.suspectUnrated} baris mata uang asing tercatat dengan kurs 1. Nilai IDR-nya perlu diperiksa.`,
        14,
        afterTable(doc) + 6
      );
    }
  }

  return doc;
}
