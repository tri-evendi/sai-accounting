/**
 * Satu payload contoh untuk SETIAP laporan yang punya berkas ekspor (issue #323).
 *
 * Berkas ini bukan tes; ia bahan bagi tes yang harus menjalankan KEDUA perender
 * yang sungguhan — `buildReportSheet()` dan `generateStatementPDF()` — untuk
 * seluruh laporan sekaligus, bukan satu per satu. Sampai #323 tiap penjaga
 * bentuk membawa payload-nya sendiri karena masing-masing hanya mengurus satu
 * keluarga laporan; nama dokumen berlaku untuk ketiga belasnya, jadi payload-nya
 * perlu rumah bersama.
 *
 * Isinya sengaja sederhana — yang diuji berkas pemakainya adalah NAMA dokumen,
 * bukan angkanya. Yang tidak sederhana: tiap payload memuat cukup keadaan agar
 * perendernya benar-benar menggambar tabel (baris, total, dan pada beberapa
 * laporan catatan kakinya), sebab dokumen tanpa tabel juga tak akan membuktikan
 * judulnya tercetak.
 */
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

const PERIODE = "Periode 1 Jan 2026 - 31 Jan 2026";

/** Satu bagian Laba/Rugi dengan satu baris. */
const seksi = (code: string, name: string, amount: number) => ({
  lines: [{ code, name, amount }],
  total: amount,
});

export const CONTOH_PAYLOAD: StatementPayload[] = [
  {
    kind: "trial-balance",
    period: PERIODE,
    rows: [
      { code: "1-100", name: "Kas", debit: 5_000_000, credit: 0 },
      { code: "4-100", name: "Pendapatan", debit: 0, credit: 5_000_000 },
    ],
    totalDebit: 5_000_000,
    totalCredit: 5_000_000,
    balanced: true,
  },
  {
    kind: "income-statement",
    period: PERIODE,
    sales: seksi("4-100", "Pendapatan Usaha", 9_000_000),
    cogs: seksi("5-100", "Beban Pokok", 4_000_000),
    grossProfit: 5_000_000,
    operatingExpense: seksi("6-100", "Beban Gaji", 1_000_000),
    operatingProfit: 4_000_000,
    otherIncome: seksi("7-100", "Pendapatan Lain", 250_000),
    otherExpense: seksi("8-100", "Beban Lain", 150_000),
    netIncome: 4_100_000,
  },
  {
    kind: "balance-sheet",
    period: PERIODE,
    assets: [{ code: "1-100", name: "Kas", amount: 10_000_000 }],
    liabilities: [{ code: "2-100", name: "Utang Usaha", amount: 3_000_000 }],
    equity: [{ code: "3-100", name: "Modal Disetor", amount: 5_000_000 }],
    totalAssets: 10_000_000,
    totalLiabilities: 3_000_000,
    totalEquity: 7_000_000,
    netIncome: 2_000_000,
    totalLiabilitiesEquity: 10_000_000,
    balanced: true,
  },
  {
    kind: "cash-flow",
    period: PERIODE,
    groups: [
      {
        category: "operating",
        label: "Aktivitas Operasi",
        lines: [
          { code: "1-100", name: "Kas", inflow: 8_000_000, outflow: 2_000_000, net: 6_000_000 },
        ],
        inflow: 8_000_000,
        outflow: 2_000_000,
        net: 6_000_000,
      },
    ],
    totalInflow: 8_000_000,
    totalOutflow: 2_000_000,
    netChange: 6_000_000,
    openingCash: 1_000_000,
    closingCash: 7_000_000,
    reconciled: true,
    suspectUnrated: 0,
  },
  {
    kind: "stock-movement",
    period: PERIODE,
    rows: [
      {
        name: "Kopra Kering",
        unit: "kg",
        opening: 100,
        movedIn: 50,
        movedOut: 20,
        processed: 10,
        closing: 120,
      },
    ],
    totalOpening: 100,
    totalIn: 50,
    totalOut: 20,
    totalProcessed: 10,
    totalClosing: 120,
    hasProcess: true,
    dormantCount: 2,
  },
  {
    kind: "opname-history",
    period: PERIODE,
    sessions: [
      {
        dateISO: "2026-01-20",
        adjustments: [
          { itemName: "Kopra Kering", unit: "kg", variance: 5 },
          { itemName: "Arang Batok", unit: "kg", variance: -2 },
        ],
        increase: 5,
        decrease: 2,
      },
    ],
    sessionCount: 1,
    adjustmentCount: 2,
    totalIncrease: 5,
    totalDecrease: 2,
    netVariance: 3,
  },
  {
    kind: "sales-by-customer",
    period: PERIODE,
    rows: [
      {
        partyName: "PT Contoh Abadi",
        docCount: 3,
        grossBase: 15_000_000,
        returnBase: 1_250_000,
        netBase: 13_750_000,
        unratedCount: 0,
      },
    ],
    totals: {
      docCount: 3,
      grossBase: 15_000_000,
      returnBase: 1_250_000,
      netBase: 13_750_000,
      unratedCount: 1,
    },
  },
  {
    kind: "purchases-by-supplier",
    period: PERIODE,
    rows: [
      {
        partyName: "CV Contoh Jaya",
        docCount: 2,
        grossBase: 7_000_000,
        returnBase: 0,
        netBase: 7_000_000,
        unratedCount: 0,
      },
    ],
    totals: {
      docCount: 2,
      grossBase: 7_000_000,
      returnBase: 0,
      netBase: 7_000_000,
      unratedCount: 0,
    },
  },
  {
    kind: "receivables",
    period: "Per 31 Jan 2026",
    rows: [
      {
        partyName: "PT Contoh Abadi",
        documentNo: "INV-0001",
        date: "05 Jan 2026",
        dueDate: "20 Jan 2026",
        ageDays: 11,
        ageFromIssue: false,
        status: "Jatuh tempo",
        total: 5_000_000,
        currency: "IDR",
        outstandingBase: 5_000_000,
      },
    ],
    buckets: [
      { label: "Belum jatuh tempo", amount: 0 },
      { label: "1-30 hari", amount: 5_000_000 },
    ],
    total: 5_000_000,
    unresolved: 0,
  },
  {
    kind: "payables",
    period: "Per 31 Jan 2026",
    rows: [
      {
        partyName: "CV Contoh Jaya",
        documentNo: "BILL-0001",
        date: "07 Jan 2026",
        dueDate: null,
        ageDays: 24,
        ageFromIssue: true,
        status: "Belum jatuh tempo",
        total: 2_000_000,
        currency: "IDR",
        outstandingBase: 2_000_000,
      },
    ],
    buckets: [{ label: "1-30 hari", amount: 2_000_000 }],
    total: 2_000_000,
    unresolved: 1,
  },
  {
    kind: "stock-value",
    period: "Per 31 Jan 2026",
    rows: [
      { name: "Kopra Kering", unit: "kg", currentStock: 120, unitCost: 9_000, stockValue: 1_080_000 },
      { name: "Arang Batok", unit: "kg", currentStock: 40, unitCost: null, stockValue: null },
    ],
    totalValue: 1_080_000,
    uncostedCount: 1,
  },
  {
    kind: "cash-bank",
    period: PERIODE,
    rows: [
      { code: "1-100", name: "Kas Kecil", opening: 1_000_000, net: 500_000, closing: 1_500_000 },
    ],
    openingCash: 1_000_000,
    netChange: 500_000,
    closingCash: 1_500_000,
  },
  {
    kind: "budget-realization",
    period: PERIODE,
    rows: [
      {
        code: "6-100",
        name: "Beban Gaji",
        budget: 5_000_000,
        actual: 5_500_000,
        variance: 500_000,
        variancePct: 10,
        status: "Di atas anggaran",
      },
    ],
    totalBudget: 5_000_000,
    totalActual: 5_500_000,
    totalVariance: 500_000,
    totalVariancePct: 10,
    alertCount: 1,
    salesTarget: { target: 20_000_000, actual: 18_000_000, variance: -2_000_000 },
  },
];
