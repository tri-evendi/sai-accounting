/**
 * Validation for the statement-export payload (issue #19).
 *
 * The Excel export API is handed the *same* serialisable `StatementPayload` the
 * report page built for its PDF button — this schema is the trust boundary that
 * turns that untyped JSON back into a known shape before `@/lib/report-export`
 * maps it to a sheet. It intentionally mirrors `StatementPayload` in
 * `@/lib/pdf/statement-pdf`; the `satisfies` check in the route keeps the two in
 * lock-step at compile time. Money fields are plain finite numbers (they may be
 * negative — a loss, a contra-asset), never re-rounded here.
 */
import { z } from "zod";

import { EXPORT_MAX_COLUMNS, EXPORT_MAX_ROWS } from "@sai/core/export-limits";

const money = z.number().finite();
const line = z.object({ code: z.string(), name: z.string(), amount: money });

/**
 * Array BARIS, berbatas (03 §4).
 *
 * Ditulis satu kali di sini alih-alih `.max(...)` di tujuh belas tempat: batas
 * yang disalin tujuh belas kali adalah batas yang akan terlupa di tempat ke
 * delapan belas, dan array tak berbatas di batas kepercayaan tidak kelihatan
 * salah saat dibaca.
 *
 * Ini lapis PERTAMA dari tiga, bukan satu-satunya. Pemutus akhirnya tetap
 * jumlah baris `SheetModel` yang dihitung di rutenya — karena array bersarang
 * (grup arus kas, sesi hitung ulang) membuat batas per-array TIDAK sama dengan
 * batas total, dan yang dilindungi ialah lembar sebarnya, bukan muatannya.
 * Lapis ketiganya batas byte badan permintaan, yang berdiri sebelum satu baris
 * pun diurai.
 */
const rows = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(EXPORT_MAX_ROWS);

const trialBalance = z.object({
  kind: z.literal("trial-balance"),
  period: z.string(),
  rows: rows(z.object({ code: z.string(), name: z.string(), debit: money, credit: money })),
  totalDebit: money,
  totalCredit: money,
  balanced: z.boolean(),
});

const section = z.object({ lines: rows(line), total: money });

/**
 * Kolom PEMBANDING Laba Rugi & Neraca (#557) — OPSIONAL, dan DIBAWA.
 *
 * Sampai 22 Okt 2026 skema ini tidak menyebut `priorPeriod`/`prior`, dan
 * `z.object` MEMBUANG kunci yang tidak disebutnya. Halaman mengirim
 * pembandingnya, `buildReportSheet`/PDF sanggup menggambarnya — dan berkas
 * yang diunduh dari halaman komparatif tetap SATU kolom, tanpa satu galat pun.
 * Dua sisi yang benar sendiri-sendiri dengan satu batas kepercayaan yang
 * diam-diam memotong di tengahnya; `tests/report-export-compare.test.ts`
 * menjaganya kini.
 *
 * Batasnya sama dengan muatan berjalan: setiap array baris lewat `rows()`.
 */
const incomeStatementPrior = z.object({
  sales: section,
  cogs: section,
  grossProfit: money,
  operatingExpense: section,
  operatingProfit: money,
  otherIncome: section,
  otherExpense: section,
  netIncome: money,
});

const incomeStatement = z.object({
  kind: z.literal("income-statement"),
  period: z.string(),
  priorPeriod: z.string().optional(),
  prior: incomeStatementPrior.optional(),
  sales: section,
  cogs: section,
  grossProfit: money,
  operatingExpense: section,
  operatingProfit: money,
  otherIncome: section,
  otherExpense: section,
  netIncome: money,
});

/**
 * Neraca pembanding — termasuk pecahan #555 (`currentYearIncome` /
 * `priorUnclosedIncome`) yang dikirim halaman bersama `prior`, sebab
 * `balanceSheetLayout` membacanya untuk memecah blok ekuitas pembanding. Lihat
 * `balanceSheetPrior` di `report-payload.ts` untuk akibatnya.
 */
const balanceSheetPrior = z.object({
  assets: rows(line),
  liabilities: rows(line),
  equity: rows(line),
  totalAssets: money,
  totalLiabilities: money,
  totalEquity: money,
  netIncome: money,
  currentYearIncome: money.optional(),
  priorUnclosedIncome: money.optional(),
  totalLiabilitiesEquity: money,
  balanced: z.boolean(),
});

const balanceSheet = z.object({
  kind: z.literal("balance-sheet"),
  period: z.string(),
  priorPeriod: z.string().optional(),
  prior: balanceSheetPrior.optional(),
  assets: rows(line),
  liabilities: rows(line),
  equity: rows(line),
  totalAssets: money,
  totalLiabilities: money,
  totalEquity: money,
  netIncome: money,
  totalLiabilitiesEquity: money,
  balanced: z.boolean(),
});

const cashFlow = z.object({
  kind: z.literal("cash-flow"),
  period: z.string(),
  groups: rows(
    z.object({
      /*
       * Kategori kanonik (issue #241). Enum, bukan `z.string()`: bentuk
       * laporan bergantung padanya — "Belum Terkategori" adalah ember
       * diagnostik yang boleh hilang saat kosong, tiga seksi baku tidak — dan
       * kategori asing yang lolos ke sini akan digambar sebagai seksi baku
       * tanpa satu pun tanda.
       */
      category: z.enum(["operating", "investing", "financing", "uncategorised"]),
      label: z.string(),
      lines: rows(
        z.object({
          code: z.string(),
          name: z.string(),
          inflow: money,
          outflow: money,
          net: money,
        })
      ),
      inflow: money,
      outflow: money,
      net: money,
    })
  ),
  totalInflow: money,
  totalOutflow: money,
  netChange: money,
  openingCash: money,
  closingCash: money,
  reconciled: z.boolean(),
  suspectUnrated: z.number().int().nonnegative(),
});

/**
 * Kartu Stok (issue #126). `quantity` is a plain finite number like `money` —
 * it may be negative (an oversold item, a correction) and is never re-rounded
 * here; `Decimal(15,3)` precision has to survive to the spreadsheet.
 */
const quantity = z.number().finite();

/**
 * Kolom yang dipilih pengguna di dialog parameter.
 *
 * WAJIB dideklarasikan di skema meskipun opsional: zod MENANGGALKAN kunci yang
 * tak dikenalnya, jadi field yang lupa ditulis di sini tidak ditolak — ia
 * hilang diam-diam, dan lembar sebarnya tetap memuat seluruh kolom seolah
 * pengguna tak pernah memilih apa pun.
 *
 * Isinya tidak divalidasi terhadap daftar kolom laporan: `stockMovementColumns`
 * / `partyRecapColumns` hanya pernah MENYARING kolom yang ada, jadi id asing
 * paling jauh tidak berefek — bukan kolom karangan di dalam berkas.
 */
const columnSelection = z.array(z.string()).max(EXPORT_MAX_COLUMNS).optional();

const stockMovement = z.object({
  kind: z.literal("stock-movement"),
  period: z.string(),
  rows: rows(
    z.object({
      name: z.string(),
      unit: z.string().nullable(),
      opening: quantity,
      movedIn: quantity,
      movedOut: quantity,
      processed: quantity,
      closing: quantity,
    })
  ),
  totalOpening: quantity,
  totalIn: quantity,
  totalOut: quantity,
  totalProcessed: quantity,
  totalClosing: quantity,
  hasProcess: z.boolean(),
  dormantCount: z.number().int().nonnegative(),
  visibleColumns: columnSelection,
});

/** Riwayat Hitung Ulang Stok (issue #129). `variance` is signed by direction. */
const opnameHistory = z.object({
  kind: z.literal("opname-history"),
  period: z.string(),
  sessions: rows(
    z.object({
      dateISO: z.string(),
      adjustments: rows(
        z.object({
          itemName: z.string(),
          unit: z.string().nullable(),
          variance: quantity,
        })
      ),
      increase: quantity,
      decrease: quantity,
    })
  ),
  sessionCount: z.number().int().nonnegative(),
  adjustmentCount: z.number().int().nonnegative(),
  totalIncrease: quantity,
  totalDecrease: quantity,
  netVariance: quantity,
});

/**
 * Rekap per mitra — Penjualan per Pelanggan & Pembelian per Pemasok, dua
 * laporan berbentuk sama. Semua nominal IDR base; `unratedCount` membawa
 * dokumen valas tanpa kurs yang TIDAK ikut dijumlahkan, supaya berkasnya bisa
 * mengatakannya persis seperti layar.
 */
const partyRecapRow = z.object({
  partyName: z.string().nullable(),
  docCount: z.number().int().nonnegative(),
  grossBase: money,
  returnBase: money,
  netBase: money,
  unratedCount: z.number().int().nonnegative(),
});

const partyRecap = z.object({
  kind: z.enum(["sales-by-customer", "purchases-by-supplier"]),
  period: z.string(),
  rows: rows(partyRecapRow),
  totals: z.object({
    docCount: z.number().int().nonnegative(),
    grossBase: money,
    returnBase: money,
    netBase: money,
    unratedCount: z.number().int().nonnegative(),
  }),
  visibleColumns: columnSelection,
});

/**
 * Umur Piutang / Umur Utang. `outstandingBase` boleh null — dokumen valas tanpa
 * kurs tidak punya nilai IDR yang jujur, dan menjadikannya nol akan menyusutkan
 * total tanpa bersuara.
 */
const aging = z.object({
  kind: z.enum(["receivables", "payables"]),
  period: z.string(),
  rows: rows(
    z.object({
      partyName: z.string(),
      documentNo: z.string(),
      date: z.string(),
      dueDate: z.string().nullable(),
      ageDays: z.number().int(),
      ageFromIssue: z.boolean(),
      status: z.string(),
      total: money,
      currency: z.string(),
      outstandingBase: money.nullable(),
    })
  ),
  buckets: rows(z.object({ label: z.string(), amount: money })),
  total: money,
  unresolved: z.number().int().nonnegative(),
  visibleColumns: columnSelection,
});

/**
 * Nilai Persediaan PER PERIODE (#492). Setiap nilai boleh null — barang tanpa
 * dasar biaya tidak punya nilai yang jujur, dan Rp 0 menyatakan bahwa barang
 * yang ada wujudnya tidak bernilai apa-apa. Kuantitas adalah KUANTITAS, bukan
 * uang, jadi ia memakai `quantity` (3 desimal), bukan `money`.
 *
 * `revaluation` boleh negatif dan memang sering negatif: ia selisih penilaian
 * akibat rata-rata tertimbang yang bergeser selama periode. Dicetak apa adanya,
 * sebab selisih yang disembunyikan akan ditemukan berbulan-bulan kemudian oleh
 * orang yang mencocokkan laporan ini dengan neraca.
 */
const stockValue = z.object({
  kind: z.literal("stock-value"),
  period: z.string(),
  rows: rows(
    z.object({
      code: z.string(),
      name: z.string(),
      unit: z.string().nullable(),
      openingQty: quantity,
      openingValue: money.nullable(),
      inQty: quantity,
      inValue: money.nullable(),
      outQty: quantity,
      outValue: money.nullable(),
      closingQty: quantity,
      closingValue: money.nullable(),
    })
  ),
  totalValue: money,
  revaluation: money,
  uncostedCount: z.number().int().nonnegative(),
  visibleColumns: columnSelection,
});

/** Laporan Kas & Bank — saldo awal, perubahan, dan saldo akhir tiap akun. */
const cashBank = z.object({
  kind: z.literal("cash-bank"),
  period: z.string(),
  rows: rows(
    z.object({
      code: z.string(),
      name: z.string(),
      opening: money,
      net: money,
      closing: money,
    })
  ),
  openingCash: money,
  netChange: money,
  closingCash: money,
  visibleColumns: columnSelection,
});

/**
 * Realisasi vs Anggaran. `variancePct` boleh null — akun beranggaran nol tak
 * punya penyebut, dan "0%" akan menyatakan sesuatu yang tidak dikatakan angkanya.
 */
const budgetRealization = z.object({
  kind: z.literal("budget-realization"),
  period: z.string(),
  rows: rows(
    z.object({
      code: z.string(),
      name: z.string(),
      budget: money,
      actual: money,
      variance: money,
      variancePct: money.nullable(),
      status: z.string(),
    })
  ),
  totalBudget: money,
  totalActual: money,
  totalVariance: money,
  totalVariancePct: money.nullable(),
  alertCount: z.number().int().nonnegative(),
  salesTarget: z
    .object({ target: money, actual: money, variance: money })
    .nullable(),
  visibleColumns: columnSelection,
});

export const statementPayloadSchema = z.discriminatedUnion("kind", [
  trialBalance,
  incomeStatement,
  balanceSheet,
  cashFlow,
  stockMovement,
  opnameHistory,
  partyRecap,
  aging,
  stockValue,
  cashBank,
  budgetRealization,
]);

export type StatementPayloadInput = z.infer<typeof statementPayloadSchema>;
