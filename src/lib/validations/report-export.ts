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

const money = z.number().finite();
const line = z.object({ code: z.string(), name: z.string(), amount: money });

const trialBalance = z.object({
  kind: z.literal("trial-balance"),
  period: z.string(),
  rows: z.array(z.object({ code: z.string(), name: z.string(), debit: money, credit: money })),
  totalDebit: money,
  totalCredit: money,
  balanced: z.boolean(),
});

const section = z.object({ lines: z.array(line), total: money });

const incomeStatement = z.object({
  kind: z.literal("income-statement"),
  period: z.string(),
  sales: section,
  cogs: section,
  grossProfit: money,
  operatingExpense: section,
  operatingProfit: money,
  otherIncome: section,
  otherExpense: section,
  netIncome: money,
});

const balanceSheet = z.object({
  kind: z.literal("balance-sheet"),
  period: z.string(),
  assets: z.array(line),
  liabilities: z.array(line),
  equity: z.array(line),
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
  groups: z.array(
    z.object({
      label: z.string(),
      lines: z.array(
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
const columnSelection = z.array(z.string()).optional();

const stockMovement = z.object({
  kind: z.literal("stock-movement"),
  period: z.string(),
  rows: z.array(
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
  sessions: z.array(
    z.object({
      dateISO: z.string(),
      adjustments: z.array(
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
  rows: z.array(partyRecapRow),
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
  rows: z.array(
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
  buckets: z.array(z.object({ label: z.string(), amount: money })),
  total: money,
  unresolved: z.number().int().nonnegative(),
});

/**
 * Nilai Persediaan. `unitCost`/`stockValue` boleh null — barang tanpa dasar
 * biaya tidak punya nilai yang jujur, dan Rp 0 menyatakan bahwa barang yang ada
 * wujudnya tidak bernilai apa-apa. Saldo adalah KUANTITAS, bukan uang.
 */
const stockValue = z.object({
  kind: z.literal("stock-value"),
  period: z.string(),
  rows: z.array(
    z.object({
      name: z.string(),
      unit: z.string().nullable(),
      currentStock: quantity,
      unitCost: money.nullable(),
      stockValue: money.nullable(),
    })
  ),
  totalValue: money,
  uncostedCount: z.number().int().nonnegative(),
  visibleColumns: columnSelection,
});

/** Laporan Kas & Bank — saldo awal, perubahan, dan saldo akhir tiap akun. */
const cashBank = z.object({
  kind: z.literal("cash-bank"),
  period: z.string(),
  rows: z.array(
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
]);

export type StatementPayloadInput = z.infer<typeof statementPayloadSchema>;
