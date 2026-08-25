/**
 * Payload cetak satu laporan, dihitung dari id katalog + parameternya.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Sampai sekarang payload cetak hanya lahir DI DALAM halaman laporan: server
 * component membacanya dari buku besar, merender tabel, lalu menyerahkan objek
 * yang sama ke tombol PDF dan Excel. Itu properti yang bagus — cetakan tak
 * pernah bisa berbeda dari layar — tapi ia juga berarti satu-satunya jalan
 * menuju berkas adalah MEMBUKA halamannya lebih dulu.
 *
 * Dialog parameter di Pusat Laporan meminta hal yang tidak dimiliki jalan itu:
 * mengunduh tanpa singgah. Modul ini menyediakannya dengan menghitung payload
 * yang PERSIS sama dari parameter mentah — pembaca yang sama, label periode
 * yang sama, sehingga berkas yang diunduh dari dialog dan yang diunduh dari
 * halamannya adalah dokumen yang sama, bukan dua yang mirip.
 *
 * ══ SATU-SATUNYA TEMPAT PEMETAAN id → PEMBACA ══════════════════════════════
 * `switch` di bawah lengkap terhadap `payloadKind`, jadi jenis payload baru
 * yang lupa diberi pembaca ditolak `tsc` di sini — bukan muncul sebagai tombol
 * unduh yang menjawab 500.
 */
import { getBalanceSheet, getCashFlow, getIncomeStatement, getTrialBalance } from "@/lib/reports";
import { getOpnameHistory, getStockMovementReport, getStockValuePeriodReport } from "@/lib/stock-report";
import { getPurchasesBySupplier, getSalesByCustomer } from "@/lib/party-recap";
import { getBudgetReport, getSalesTargetRealization } from "@/lib/budget-report";
import type { VarianceStatus } from "@/lib/budget";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  PAYMENT_STATUS_LABELS,
  getPayables,
  getReceivables,
  type AgingBucket,
  type PaymentStatus,
} from "@/lib/receivables";
import { costCenterFilterLabel } from "@/lib/cost-center-options";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { resolveAsOf, resolveColumns, resolvePeriod, type ReportDefinition } from "@/lib/report-catalog";
import { resolveStockPeriod } from "@/lib/stock-period";
import { formatDate } from "@/lib/utils";

/** Parameter mentah dari URL — bentuknya sama dengan `searchParams` halaman. */
export interface ReportPayloadParams {
  from?: string;
  to?: string;
  asOf?: string;
  year?: string;
  month?: string;
  costCenter?: string;
  cols?: string;
}

/** Nama bulan untuk DOKUMEN CETAK — bahasa Indonesia, seperti isi `lib/pdf`. */
const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Kata untuk arah selisih; cetakan tak punya lencana berwarna. */
const VARIANCE_STATUS_TEXT: Record<VarianceStatus, string> = {
  over: "Di atas anggaran",
  under: "Di bawah anggaran",
  on_target: "Sesuai anggaran",
};

/**
 * `?year=&month=` → tahun & bulan yang sah, aturan yang SAMA dengan halaman
 * `/budget/report`: tahun 2000–2100, bulan 1–12, dan `month=0` berarti setahun
 * penuh. Nilai tak sah jatuh ke periode berjalan — alamat yang diedit tangan
 * tidak boleh mengirim `NaN` ke Prisma.
 */
export function resolveBudgetPeriod(
  yearRaw: string | undefined,
  monthRaw: string | undefined,
  now: Date = new Date()
): { year: number; month: number | undefined } {
  const y = Number(yearRaw);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : now.getFullYear();
  const m = monthRaw === undefined ? now.getMonth() + 1 : Number(monthRaw);
  if (m === 0) return { year, month: undefined };
  return {
    year,
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
  };
}

type ExportableReport = ReportDefinition & { payloadKind: StatementPayload["kind"] };

/**
 * Label periode yang IKUT TERCETAK di kepala dokumen.
 *
 * Bahasa Indonesia, seperti seluruh isi `lib/pdf`: berkas yang lepas dari
 * layarnya tidak membawa pilihan bahasa penggunanya. Kalimatnya sengaja sama
 * persis dengan yang disusun halaman-halaman laporan.
 */
function periodLabel(from: Date, to: Date, costCenter: string | null): string {
  return (
    `Periode ${formatDate(from)} – ${formatDate(to)}` +
    (costCenter ? ` · Pusat Biaya: ${costCenter}` : "")
  );
}

/**
 * Bentuk payload Umur Piutang / Umur Utang — MURNI, dari baris yang sudah
 * dibaca.
 *
 * Dipisah dari pembacaannya supaya HALAMAN piutang/utang bisa memakainya juga:
 * halaman itu sudah memegang barisnya (lengkap dengan saringan "hanya jatuh
 * tempo" yang sedang aktif), dan memanggil pembacanya sekali lagi hanya untuk
 * membuat berkas berarti berkasnya bisa memuat kumpulan dokumen yang berbeda
 * dari yang dilihat penggunanya.
 */
export function agingPayload(
  kind: "receivables" | "payables",
  asOf: Date,
  rows: {
    partyName: string;
    documentNo: string;
    date: Date;
    dueDate: Date | null;
    ageDays: number;
    ageFromIssue: boolean;
    status: PaymentStatus;
    total: number;
    currency: string;
    outstandingBase: number | null;
  }[],
  aging: { buckets: Record<AgingBucket, number>; total: number; unresolved: number },
  visibleColumns: string[] = []
): Extract<StatementPayload, { kind: "receivables" | "payables" }> {
  return {
    kind,
    period: `Per ${formatDate(asOf)}`,
    rows: rows.map((r) => ({
      partyName: r.partyName,
      documentNo: r.documentNo,
      date: formatDate(r.date),
      dueDate: r.dueDate ? formatDate(r.dueDate) : null,
      ageDays: r.ageDays,
      ageFromIssue: r.ageFromIssue,
      status: PAYMENT_STATUS_LABELS[r.status],
      total: r.total,
      currency: r.currency,
      outstandingBase: r.outstandingBase,
    })),
    buckets: AGING_BUCKETS.map((b) => ({
      label: AGING_BUCKET_LABELS[b],
      amount: aging.buckets[b],
    })),
    total: aging.total,
    unresolved: aging.unresolved,
    visibleColumns,
  };
}

/**
 * Bentuk payload Laporan Kas & Bank dari hasil pembaca arus kas — MURNI.
 *
 * Terpisah dari pembacanya karena halaman laporannya sudah memegang hasil itu:
 * satu pembacaan, dua pemakai (tabel & berkas), dan karena itu tak mungkin
 * berselisih.
 */
export function cashBankPayload(
  report: ReportDefinition,
  from: Date,
  to: Date,
  cf: {
    cashAccounts: { code: string; name: string; opening: number; closing: number; net: number }[];
    openingCash: number;
    netChange: number;
    closingCash: number;
  },
  cols?: string
): Extract<StatementPayload, { kind: "cash-bank" }> {
  return {
    kind: "cash-bank",
    period: periodLabel(from, to, null),
    rows: cf.cashAccounts.map(({ code, name, opening, net, closing }) => ({
      code,
      name,
      opening,
      net,
      closing,
    })),
    openingCash: cf.openingCash,
    netChange: cf.netChange,
    closingCash: cf.closingCash,
    visibleColumns: resolveColumns(report, cols),
  };
}

/**
 * Bentuk payload Realisasi vs Anggaran dari hasil kedua pembacanya — MURNI.
 *
 * Dipisah karena halaman `/budget/report` sudah memegang keduanya: satu
 * pembacaan, dua pemakai (tabel & berkas), dan karena itu tak bisa berselisih.
 */
export function budgetPayload(
  definition: ReportDefinition,
  year: number,
  month: number | undefined,
  budget: {
    rows: {
      code: string;
      name: string;
      budget: number;
      actual: number;
      variance: number;
      variancePct: number | null;
      status: VarianceStatus;
    }[];
    totals: {
      budget: number;
      actual: number;
      variance: number;
      variancePct: number | null;
      alertCount: number;
    };
  },
  sales: { hasTargets: boolean; totalTarget: number; actualSales: number; row: { variance: number } },
  cols?: string
): Extract<StatementPayload, { kind: "budget-realization" }> {
  return {
    kind: "budget-realization",
    period: month === undefined ? `Tahun ${year}` : `${MONTH_NAMES_ID[month - 1]} ${year}`,
    rows: budget.rows.map((r) => ({
      code: r.code,
      name: r.name,
      budget: r.budget,
      actual: r.actual,
      variance: r.variance,
      variancePct: r.variancePct,
      // Kata, bukan enum mentah: cetakan tak punya lencana berwarna, jadi arah
      // selisih harus terbaca sebagai teks.
      status: VARIANCE_STATUS_TEXT[r.status],
    })),
    totalBudget: budget.totals.budget,
    totalActual: budget.totals.actual,
    totalVariance: budget.totals.variance,
    totalVariancePct: budget.totals.variancePct,
    alertCount: budget.totals.alertCount,
    // Target penjualan hidup di halaman yang sama; tanpa target sama sekali ia
    // `null`, bukan nol — "target Rp 0 tercapai" adalah kalimat yang salah.
    salesTarget: sales.hasTargets
      ? { target: sales.totalTarget, actual: sales.actualSales, variance: sales.row.variance }
      : null,
    visibleColumns: resolveColumns(definition, cols),
  };
}

export async function buildReportPayload(
  report: ExportableReport,
  params: ReportPayloadParams
): Promise<StatementPayload> {
  switch (report.payloadKind) {
    case "trial-balance": {
      const { asOf } = resolveAsOf(params.asOf);
      const tb = await getTrialBalance(asOf);
      return {
        kind: "trial-balance",
        period: `Per ${formatDate(asOf)}`,
        rows: tb.rows,
        totalDebit: tb.totalDebit,
        totalCredit: tb.totalCredit,
        balanced: tb.balanced,
      };
    }

    case "balance-sheet": {
      const { asOf } = resolveAsOf(params.asOf);
      const bs = await getBalanceSheet(asOf);
      return {
        kind: "balance-sheet",
        period: `Per ${formatDate(asOf)}`,
        assets: bs.assets,
        liabilities: bs.liabilities,
        equity: bs.equity,
        totalAssets: bs.totalAssets,
        totalLiabilities: bs.totalLiabilities,
        totalEquity: bs.totalEquity,
        netIncome: bs.netIncome,
        totalLiabilitiesEquity: bs.totalLiabilitiesEquity,
        balanced: bs.balanced,
      };
    }

    case "income-statement": {
      const { from, to } = resolvePeriod(params.from, params.to);
      const costCenter = parseCostCenterFilter(params.costCenter);
      // Saringan aktif tanpa nama (pusat biaya terhapus / id salah ketik namun
      // lolos parse) tetap harus TERCETAK sebagai `#<id>`: dokumen yang hanya
      // memuat sebagian angka tanpa mengatakannya adalah yang paling mudah
      // salah dibaca setelah lepas dari layarnya.
      const name = costCenter !== undefined ? await costCenterFilterLabel(params.costCenter) : null;
      const label = costCenter !== undefined ? name ?? `#${costCenter}` : null;
      const is = await getIncomeStatement(from, to, undefined, costCenter);
      return {
        kind: "income-statement",
        period: periodLabel(from, to, label),
        sales: is.sales,
        cogs: is.cogs,
        grossProfit: is.grossProfit,
        operatingExpense: is.operatingExpense,
        operatingProfit: is.operatingProfit,
        otherIncome: is.otherIncome,
        otherExpense: is.otherExpense,
        netIncome: is.netIncome,
      };
    }

    case "cash-flow": {
      const { from, to } = resolvePeriod(params.from, params.to);
      const cf = await getCashFlow(from, to);
      return {
        kind: "cash-flow",
        period: periodLabel(from, to, null),
        groups: cf.groups.map((g) => ({
          // Ikut sejak issue #241 — `cashFlowLayout()` membedakan ember
          // diagnostik "Belum Terkategori" dari tiga seksi baku lewat kategori,
          // bukan lewat label yang bisa saja sudah diterjemahkan.
          category: g.category,
          label: g.label,
          lines: g.lines.map((l) => ({
            code: l.code,
            name: l.name,
            inflow: l.inflow,
            outflow: l.outflow,
            net: l.net,
          })),
          inflow: g.inflow,
          outflow: g.outflow,
          net: g.net,
        })),
        totalInflow: cf.totalInflow,
        totalOutflow: cf.totalOutflow,
        netChange: cf.netChange,
        openingCash: cf.openingCash,
        closingCash: cf.closingCash,
        reconciled: cf.reconciled,
        suspectUnrated: cf.suspectUnrated,
      };
    }

    case "stock-movement": {
      // `resolveStockPeriod`, bukan `resolvePeriod`: halaman Riwayat Stok
      // memakai yang ini, dan bawaannya berbeda (bulan berjalan, bukan awal
      // tahun). Memakai dua penentu periode berarti berkas dan layar bisa
      // menyebut periode berbeda dari parameter yang sama.
      const { from, to } = resolveStockPeriod(undefined, undefined, params.from, params.to);
      const r = await getStockMovementReport(from, to);
      return {
        kind: "stock-movement",
        period: periodLabel(from, to, null),
        rows: r.rows.map(({ name, unit, opening, movedIn, movedOut, processed, closing }) => ({
          name,
          unit,
          opening,
          movedIn,
          movedOut,
          processed,
          closing,
        })),
        totalOpening: r.totalOpening,
        totalIn: r.totalIn,
        totalOut: r.totalOut,
        totalProcessed: r.totalProcessed,
        totalClosing: r.totalClosing,
        hasProcess: r.hasProcess,
        dormantCount: r.dormantCount,
        visibleColumns: resolveColumns(report, params.cols),
      };
    }

    case "budget-realization": {
      // `?year=&month=`, dengan month=0 = setahun penuh — bentuk yang sudah
      // lama dibaca `/budget/report`, divalidasi dengan aturan yang sama supaya
      // alamat yang diedit tangan tidak berujung 500.
      const { year, month } = resolveBudgetPeriod(params.year, params.month);
      const [{ report: budget }, sales] = await Promise.all([
        getBudgetReport(year, month),
        getSalesTargetRealization(year, month),
      ]);
      return budgetPayload(report, year, month, budget, sales, params.cols);
    }

    case "cash-bank": {
      const { from, to } = resolvePeriod(params.from, params.to);
      const cf = await getCashFlow(from, to);
      return cashBankPayload(report, from, to, cf, params.cols);
    }

    case "stock-value": {
      /*
       * BERPERIODE sejak #492. Alasan penundaannya dulu — "menuntut mesin
       * costing bertanggal" — sudah tidak berlaku: mesin itu ada dan sudah
       * dipakai jalur posting (`averageUnitCostForItem`), dan `stock-value-report`
       * memakai fungsi yang SAMA alih-alih menulis aturan costing kedua.
       */
      const { from, to } = resolvePeriod(params.from, params.to);
      const r = await getStockValuePeriodReport(from, to);
      return {
        kind: "stock-value",
        period: `${formatDate(from)} — ${formatDate(to)}`,
        rows: r.rows,
        /* Nilai pada AKHIR periode — angka yang dicocokkan ke neraca per
           tanggal itu, bukan penjumlahan mutasi. */
        totalValue: r.totalClosingValue,
        revaluation: r.totalRevaluation,
        uncostedCount: r.uncostedCount,
        visibleColumns: resolveColumns(report, params.cols),
      };
    }

    case "receivables":
    case "payables": {
      const { asOf } = resolveAsOf(params.asOf);
      const result =
        report.payloadKind === "receivables"
          ? await getReceivables({ asOf })
          : await getPayables({ asOf });
      return agingPayload(
        report.payloadKind,
        asOf,
        result.rows,
        result.aging,
        resolveColumns(report, params.cols)
      );
    }

    case "sales-by-customer":
    case "purchases-by-supplier": {
      const { from, to } = resolvePeriod(params.from, params.to);
      const result =
        report.payloadKind === "sales-by-customer"
          ? await getSalesByCustomer(from, to)
          : await getPurchasesBySupplier(from, to);
      return {
        kind: report.payloadKind,
        period: periodLabel(from, to, null),
        rows: result.rows.map((r) => ({
          partyName: r.partyName,
          docCount: r.docCount,
          grossBase: r.grossBase,
          returnBase: r.returnBase,
          netBase: r.netBase,
          unratedCount: r.unratedCount,
        })),
        totals: {
          docCount: result.totals.docCount,
          grossBase: result.totals.grossBase,
          returnBase: result.totals.returnBase,
          netBase: result.totals.netBase,
          unratedCount: result.totals.unratedCount,
        },
        visibleColumns: resolveColumns(report, params.cols),
      };
    }

    case "opname-history": {
      const { from, to } = resolveStockPeriod(undefined, undefined, params.from, params.to);
      const h = await getOpnameHistory(from, to);
      return {
        kind: "opname-history",
        period: periodLabel(from, to, null),
        sessions: h.sessions,
        sessionCount: h.sessionCount,
        adjustmentCount: h.adjustmentCount,
        totalIncrease: h.totalIncrease,
        totalDecrease: h.totalDecrease,
        netVariance: h.netVariance,
      };
    }
  }
}
