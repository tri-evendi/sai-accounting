/**
 * Tutup buku bulanan — the pre-close inspection and the close/reopen services.
 *
 * The lock itself lives in `@/lib/period` (imported by the ledger); this module
 * is the operator-facing half and is only reached from the Tutup Periode page.
 * Every balance shown here is read back through `@/lib/reports`, so the numbers
 * a Manager approves are literally the ones the reports show.
 */
import { prisma } from "@/lib/prisma";
import { userDisplayName, userNamesByIds } from "@/lib/users-directory";
import { getBalanceSheet, getTrialBalance } from "@/lib/reports";
import { type PeriodStatus, periodBounds } from "@/lib/period";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { monthNames } from "@/lib/i18n/labels";
import { translate, type Dictionary } from "@/lib/i18n/dictionary";

/*
 * ── Bahasa: dibaca DI SINI, bukan diserahkan ke pemanggil ──────────────────
 *
 * Modul ini sudah server-only (Prisma) dan hanya dijangkau dari route handler
 * `/api/periods*` serta halaman server `/periods` — ketiganya berjalan di dalam
 * satu permintaan, jadi `getT()` boleh membaca cookie bahasa persis seperti
 * halaman server. Efeknya: `PeriodCheck.label`/`.detail` dan label bulan sampai
 * ke layar dalam bahasa pengguna TANPA mengubah bentuk `PeriodSummary` —
 * ketiganya tetap string biasa.
 */

/** "Maret 2026" dalam bahasa aktif — kembaran `periodLabel` (@/lib/period). */
function localePeriodLabel(dictionary: Dictionary, year: number, month: number): string {
  return translate(dictionary, "common.monthOfYear", {
    month: monthNames(dictionary)[month - 1] ?? month,
    year,
  });
}

export type CheckStatus = "ok" | "warning" | "blocker";

export interface PeriodCheck {
  id: string;
  /** Plain-language name of what was inspected. */
  label: string;
  status: CheckStatus;
  /** One sentence: the finding, and what to do about it. */
  detail: string;
}

export interface PeriodSummary {
  year: number;
  month: number;
  label: string;
  status: PeriodStatus;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
  journalCount: number;
  totalDebit: number;
  totalCredit: number;
  checks: PeriodCheck[];
  blockerCount: number;
  warningCount: number;
  /** True when the period is open and no blocker was found. */
  canClose: boolean;
}

const cents = (n: number) => Math.round(n * 100);
const eq = (a: number, b: number) => cents(a) === cents(b);

/**
 * Inspect a month and report whether it is safe to lock.
 *
 * Blockers are integrity faults that would freeze a wrong number into the
 * books; warnings are judgement calls left to the Manager.
 */
export async function getPeriodSummary(year: number, month: number): Promise<PeriodSummary> {
  const { start, end } = periodBounds(year, month);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const label = (y: number, m: number) => localePeriodLabel(dictionary, y, m);

  const [existing, journals, lineGroups] = await Promise.all([
    // Nama penutupnya TIDAK bisa di-`include` lagi: pengguna hidup di basis
    // data kendali (issue #104), dan relasi Prisma tidak menyeberangi basis
    // data. Id-nya dibaca di sini, namanya dicari sesudahnya.
    prisma.period.findUnique({
      where: { year_month: { year, month } },
    }),
    prisma.journal.findMany({
      where: { date: { gte: start, lte: end } },
      select: { id: true, number: true },
    }),
    prisma.journalLine.groupBy({
      by: ["journalId"],
      _sum: { baseDebit: true, baseCredit: true },
      where: { journal: { date: { gte: start, lte: end } } },
    }),
  ]);

  const numberById = new Map(journals.map((j) => [j.id, j.number]));
  let totalDebit = 0;
  let totalCredit = 0;
  const unbalanced: string[] = [];

  for (const g of lineGroups) {
    const debit = Number(g._sum.baseDebit ?? 0);
    const credit = Number(g._sum.baseCredit ?? 0);
    totalDebit += debit;
    totalCredit += credit;
    if (!eq(debit, credit)) {
      unbalanced.push(numberById.get(g.journalId) ?? `#${g.journalId}`);
    }
  }

  // Cumulative position as at the last day of the month — the same figures the
  // Neraca Saldo and Neraca pages render.
  const [trialBalance, balanceSheet] = await Promise.all([
    getTrialBalance(end),
    getBalanceSheet(end),
  ]);

  const checks: PeriodCheck[] = [];

  // ── Blockers: ledger integrity ──
  checks.push(
    unbalanced.length === 0
      ? {
          id: "journals_balanced",
          label: t("periodClose.checkJournalsBalanced"),
          status: "ok",
          detail: t("periodClose.checkJournalsBalancedOk", { count: journals.length }),
        }
      : {
          id: "journals_balanced",
          label: t("periodClose.checkJournalsBalanced"),
          status: "blocker",
          detail: t("periodClose.checkJournalsBalancedFail", {
            count: unbalanced.length,
            list: unbalanced.slice(0, 5).join(", "),
            more: unbalanced.length > 5 ? t("periodClose.andOthers") : "",
          }),
        }
  );

  checks.push(
    trialBalance.balanced
      ? {
          id: "trial_balance",
          label: t("periodClose.checkTrialBalance"),
          status: "ok",
          detail: t("periodClose.checkTrialBalanceOk"),
        }
      : {
          id: "trial_balance",
          label: t("periodClose.checkTrialBalance"),
          status: "blocker",
          detail: t("periodClose.checkTrialBalanceFail", {
            debit: trialBalance.totalDebit.toLocaleString("id-ID"),
            credit: trialBalance.totalCredit.toLocaleString("id-ID"),
          }),
        }
  );

  // ── Warnings: judgement calls ──
  const negativeAssets = balanceSheet.assets.filter((a) => a.amount < 0);
  checks.push(
    negativeAssets.length === 0
      ? {
          id: "negative_balances",
          label: t("periodClose.checkNegativeAssets"),
          status: "ok",
          detail: t("periodClose.checkNegativeAssetsOk"),
        }
      : {
          id: "negative_balances",
          label: t("periodClose.checkNegativeAssets"),
          status: "warning",
          detail: t("periodClose.checkNegativeAssetsWarn", {
            count: negativeAssets.length,
            list: negativeAssets
              .slice(0, 5)
              .map((a) => `${a.code} ${a.name}`)
              .join(", "),
            more: negativeAssets.length > 5 ? t("periodClose.andOthers") : "",
          }),
        }
  );

  // A gap in the sequence usually means a month was skipped by accident.
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const prevBounds = periodBounds(prev.year, prev.month);
  const [prevRow, prevJournalCount] = await Promise.all([
    prisma.period.findUnique({ where: { year_month: { year: prev.year, month: prev.month } } }),
    prisma.journal.count({
      where: { date: { gte: prevBounds.start, lte: prevBounds.end } },
    }),
  ]);
  const prevOpen = prevRow?.status !== "closed" && prevJournalCount > 0;
  checks.push(
    prevOpen
      ? {
          id: "previous_period",
          label: t("periodClose.checkPrevPeriod"),
          status: "warning",
          detail: t("periodClose.checkPrevPeriodWarn", {
            period: label(prev.year, prev.month),
            count: prevJournalCount,
          }),
        }
      : {
          id: "previous_period",
          label: t("periodClose.checkPrevPeriod"),
          status: "ok",
          detail: t("periodClose.checkPrevPeriodOk", { period: label(prev.year, prev.month) }),
        }
  );

  if (journals.length === 0) {
    checks.push({
      id: "has_transactions",
      label: t("periodClose.checkHasTransactions"),
      status: "warning",
      detail: t("periodClose.checkHasTransactionsWarn"),
    });
  }

  if (end.getTime() > Date.now()) {
    checks.push({
      id: "period_ended",
      label: t("periodClose.checkPeriodEnded"),
      status: "warning",
      detail: t("periodClose.checkPeriodEndedWarn", { period: label(year, month) }),
    });
  }

  const blockerCount = checks.filter((c) => c.status === "blocker").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;
  const status = (existing?.status as PeriodStatus | undefined) ?? "open";

  return {
    year,
    month,
    label: label(year, month),
    status,
    closedAt: existing?.closedAt?.toISOString() ?? null,
    closedByName: await userDisplayName(existing?.closedById),
    note: existing?.note ?? null,
    journalCount: journals.length,
    totalDebit,
    totalCredit,
    checks,
    blockerCount,
    warningCount,
    canClose: status === "open" && blockerCount === 0,
  };
}

/** Lock a month. Callers must have confirmed `canClose` on a fresh summary. */
export async function closePeriod(params: {
  year: number;
  month: number;
  userId: number;
  note?: string | null;
}) {
  const { year, month, userId, note } = params;
  return prisma.period.upsert({
    where: { year_month: { year, month } },
    create: {
      year,
      month,
      status: "closed",
      closedAt: new Date(),
      closedById: userId,
      note: note ?? null,
    },
    update: {
      status: "closed",
      closedAt: new Date(),
      closedById: userId,
      note: note ?? null,
    },
  });
}

/**
 * Unlock a month.
 * `closedAt`/`closedById` are cleared because they describe the *current* lock,
 * which no longer exists — the durable who/when/why history is the audit log,
 * which the route writes for every close and reopen. `note` keeps the reason so
 * the page can show why this month is open again.
 */
export async function reopenPeriod(params: {
  year: number;
  month: number;
  reason: string;
}) {
  const { year, month, reason } = params;
  return prisma.period.upsert({
    where: { year_month: { year, month } },
    create: { year, month, status: "open", note: reason },
    update: { status: "open", closedAt: null, closedById: null, note: reason },
  });
}

/**
 * Months worth offering in the UI: every month that has journals, plus every
 * month with a `periods` row, newest first.
 */
export async function listPeriods(limit = 24) {
  const dictionary = await getDictionary(await getLocale());
  const [rows, bounds] = await Promise.all([
    prisma.period.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.journal.aggregate({ _min: { date: true }, _max: { date: true } }),
  ]);

  const byKey = new Map(rows.map((r) => [`${r.year}-${r.month}`, r]));
  // Satu pencarian nama untuk SELURUH daftar, bukan satu per baris: penutup
  // periode biasanya orang yang sama berulang kali (issue #104).
  const closerNames = await userNamesByIds(
    rows.map((r) => r.closedById).filter((id): id is number => id != null)
  );
  const months: { year: number; month: number }[] = [];

  const max = bounds._max.date ?? new Date();
  const min = bounds._min.date ?? max;
  const cursor = new Date(max.getFullYear(), max.getMonth(), 1);
  const floor = new Date(min.getFullYear(), min.getMonth(), 1);

  while (cursor >= floor && months.length < limit) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  for (const r of rows) {
    if (!months.some((m) => m.year === r.year && m.month === r.month)) {
      months.push({ year: r.year, month: r.month });
    }
  }
  months.sort((a, b) => b.year - a.year || b.month - a.month);

  return months.slice(0, limit).map((m) => {
    const row = byKey.get(`${m.year}-${m.month}`);
    return {
      year: m.year,
      month: m.month,
      label: localePeriodLabel(dictionary, m.year, m.month),
      status: (row?.status as PeriodStatus | undefined) ?? "open",
      closedAt: row?.closedAt?.toISOString() ?? null,
      closedByName: row?.closedById != null ? closerNames.get(row.closedById) ?? null : null,
      note: row?.note ?? null,
    };
  });
}
