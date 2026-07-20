/**
 * Period lock (tutup buku bulanan) — issue #13.
 *
 * A closed month must stay exactly as it was reported. Since issue #9 the
 * ledger is written from two directions: by hand through Jurnal Umum, and
 * automatically whenever a source document (invoice, contract, payment, cash
 * entry, supplier transaction, stock movement) is created, edited or deleted.
 * Guarding only the first would leave the second free to silently rewrite a
 * closed month.
 *
 * So the guard lives at the ledger primitives themselves — `postJournal` and
 * `reverseJournal` in `@/lib/ledger` — which every one of those paths funnels
 * through. Auto-posting runs inside the *same* `$transaction` as the source
 * write, so a throw here rolls the document back too: there is no way to edit a
 * closed-period document and keep the edit.
 *
 * This module deliberately imports nothing from `@/lib/ledger` (that would be a
 * cycle) and nothing from `@/lib/reports` (that would drag report aggregation
 * into every posting path). The close/reopen services live in
 * `@/lib/period-close`.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/** Root client or an interactive-transaction client — same shape as LedgerClient. */
export type PeriodClient = typeof prisma | Prisma.TransactionClient;

export const PERIOD_STATUSES = ["open", "closed"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const MONTH_NAMES = [
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
] as const;

/** "Maret 2026" — used in UI labels and in the error message users see. */
export function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** The (year, month) a transaction date belongs to. */
export function periodOf(date: Date): { year: number; month: number } {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** First instant of the month and the last instant of its final day. */
export function periodBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

/**
 * Raised when a write would land in a closed period.
 * Carries the period so the API layer can name it in a machine-readable way.
 */
export class ClosedPeriodError extends Error {
  readonly year: number;
  readonly month: number;

  constructor(year: number, month: number) {
    super(
      `Periode ${periodLabel(year, month)} sudah ditutup (tutup buku). ` +
        `Transaksi bertanggal di periode tersebut tidak dapat dibuat, diubah, atau dihapus ` +
        `agar laporan yang sudah terbit tetap konsisten. ` +
        `Bila koreksi memang diperlukan, minta Manager membuka kembali periode itu di menu ` +
        `Tutup Periode, atau catat koreksinya sebagai transaksi di periode yang masih terbuka.`
    );
    this.name = "ClosedPeriodError";
    this.year = year;
    this.month = month;
  }
}

/**
 * Is the month containing `date` closed?
 * A month with no `periods` row counts as OPEN — closing is opt-in, so enabling
 * this feature on an existing database freezes nothing retroactively.
 */
export async function isPeriodClosed(
  date: Date,
  client: PeriodClient = prisma
): Promise<boolean> {
  const { year, month } = periodOf(date);
  const row = await client.period.findFirst({
    where: { year, month, status: "closed" },
    select: { id: true },
  });
  return row != null;
}

/** Throw ClosedPeriodError unless the month containing `date` is open. */
export async function assertPeriodOpen(
  date: Date,
  client: PeriodClient = prisma
): Promise<void> {
  if (await isPeriodClosed(date, client)) {
    const { year, month } = periodOf(date);
    throw new ClosedPeriodError(year, month);
  }
}
