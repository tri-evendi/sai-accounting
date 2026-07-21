/**
 * Minimal in-memory stand-in for a Prisma TransactionClient.
 *
 * Only the handful of operations the posting engine performs are implemented —
 * enough to drive postForSource/repostForSource/unpostForSource end to end and
 * assert on the journals produced, with no database and no network.
 *
 * Deliberately has no `$transaction`, which is exactly how a real
 * `Prisma.TransactionClient` behaves — so this also exercises the engine's
 * "join the caller's transaction" path.
 */
import type { Prisma } from "@/generated/prisma/client";

export interface FakeLine {
  id: number;
  journalId: number;
  accountId: number;
  debit: number;
  credit: number;
  currency: string;
  rate: number;
  baseDebit: number;
  baseCredit: number;
  memo: string | null;
}

export interface FakeJournal {
  id: number;
  number: string;
  date: Date;
  type: string;
  note: string | null;
  sourceType: string | null;
  sourceId: number | null;
  isReversed: boolean;
  reversalOfId: number | null;
  lines: FakeLine[];
}

export interface FakeMapping {
  key: string;
  currency: string;
  accountId: number;
  isActive: boolean;
}

/**
 * A row in `periods`. Tests may push to / mutate the seeded array between calls
 * to simulate a Manager closing a month mid-flight — the fake reads it live.
 */
export interface FakePeriod {
  year: number;
  month: number;
  status: string;
}

/**
 * A row in `exchange_rates` (issue #43) — the settlement-date rate of one
 * currency against IDR. Seeding none is the realistic default: it is what makes
 * a cross-currency settlement refuse to post.
 */
export interface FakeExchangeRate {
  currency: string;
  rateDate: Date;
  rate: number;
  isActive?: boolean;
}

export interface FakeSeed {
  mappings?: FakeMapping[];
  exchangeRates?: FakeExchangeRate[];
  periods?: FakePeriod[];
  invoices?: Record<number, unknown>;
  contracts?: Record<number, unknown>;
  invoicePayments?: Record<number, unknown>;
  contractPayments?: Record<number, unknown>;
  supplierTransactions?: Record<number, unknown>;
  cashAccounts?: Record<number, unknown>;
  stocks?: Record<number, unknown>;
  stockMovements?: unknown[];
  /** Uang muka (issue #26). Seed the nested advance/invoice/purchase inline. */
  advancePayments?: Record<number, unknown>;
  advanceApplications?: Record<number, unknown>;
}

type Where = Record<string, unknown>;

const matchesIn = (value: unknown, cond: unknown): boolean => {
  if (cond && typeof cond === "object" && "in" in (cond as Where)) {
    return ((cond as { in: unknown[] }).in ?? []).includes(value);
  }
  if (cond && typeof cond === "object" && "not" in (cond as Where)) {
    return value !== (cond as { not: unknown }).not;
  }
  if (cond && typeof cond === "object" && "startsWith" in (cond as Where)) {
    return String(value).startsWith(String((cond as { startsWith: string }).startsWith));
  }
  // Date comparators, ANDed rather than short-circuited: the exchange-rate
  // lookup (issue #43) sends {gte, lte} together to pin one calendar day, and
  // honouring only the first would silently widen it to "any date up to".
  if (cond && typeof cond === "object" && ("lte" in (cond as Where) || "gte" in (cond as Where))) {
    const t = new Date(value as Date).getTime();
    const { gte, lte } = cond as { gte?: Date; lte?: Date };
    if (gte !== undefined && t < new Date(gte).getTime()) return false;
    if (lte !== undefined && t > new Date(lte).getTime()) return false;
    return true;
  }
  return value === cond;
};

const matches = (row: Record<string, unknown>, where: Where): boolean =>
  Object.entries(where).every(([k, v]) => matchesIn(row[k], v));

export function createFakeClient(seed: FakeSeed = {}) {
  const journals: FakeJournal[] = [];
  let journalId = 0;
  let lineId = 0;

  const mappings = seed.mappings ?? [];
  const findOne = (table: Record<number, unknown> | undefined, id: number) =>
    (table?.[id] as Record<string, unknown> | undefined) ?? null;

  const client = {
    // ── journals ──
    journal: {
      findMany: async ({ where }: { where: Where }) =>
        journals.filter((j) => matches(j as unknown as Record<string, unknown>, where)),
      count: async ({ where }: { where: Where }) =>
        journals.filter((j) => matches(j as unknown as Record<string, unknown>, where)).length,
      findUnique: async ({ where }: { where: { id: number } }) =>
        journals.find((j) => j.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: Partial<FakeJournal> }) => {
        const j = journals.find((x) => x.id === where.id)!;
        Object.assign(j, data);
        return j;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        journalId += 1;
        const rawLines =
          (data.lines as { create: Omit<FakeLine, "id" | "journalId">[] } | undefined)?.create ?? [];
        const journal: FakeJournal = {
          id: journalId,
          number: data.number as string,
          date: data.date as Date,
          type: (data.type as string) ?? "general",
          note: (data.note as string) ?? null,
          sourceType: (data.sourceType as string) ?? null,
          sourceId: (data.sourceId as number) ?? null,
          isReversed: false,
          reversalOfId: (data.reversalOfId as number) ?? null,
          lines: rawLines.map((l) => {
            lineId += 1;
            return { ...l, id: lineId, journalId } as FakeLine;
          }),
        };
        journals.push(journal);
        return journal;
      },
    },

    // ── period lock ──
    period: {
      findFirst: async ({ where }: { where: Where }) =>
        (seed.periods ?? []).find((p) =>
          matches(p as unknown as Record<string, unknown>, where)
        ) ?? null,
    },

    // ── account mappings ──
    accountMapping: {
      findMany: async ({ where }: { where: Where }) =>
        mappings.filter((m) => matches(m as unknown as Record<string, unknown>, where)),
    },

    // ── settlement-date exchange rates (issue #43) ──
    exchangeRate: {
      findFirst: async ({ where }: { where: Where }) =>
        (seed.exchangeRates ?? [])
          .map((r) => ({ isActive: true, ...r }))
          .find((r) => matches(r as unknown as Record<string, unknown>, where)) ?? null,
    },

    // ── source records ──
    invoice: { findUnique: async ({ where }: { where: { id: number } }) => findOne(seed.invoices, where.id) },
    contract: { findUnique: async ({ where }: { where: { id: number } }) => findOne(seed.contracts, where.id) },
    invoicePayment: {
      findUnique: async ({ where }: { where: { id: number } }) => findOne(seed.invoicePayments, where.id),
    },
    contractPayment: {
      findUnique: async ({ where }: { where: { id: number } }) => findOne(seed.contractPayments, where.id),
    },
    supplierTransaction: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        findOne(seed.supplierTransactions, where.id),
    },
    cashAccount: {
      findUnique: async ({ where }: { where: { id: number } }) => findOne(seed.cashAccounts, where.id),
    },
    advancePayment: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        findOne(seed.advancePayments, where.id),
    },
    advanceApplication: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        findOne(seed.advanceApplications, where.id),
    },
    stock: {
      findUnique: async ({ where }: { where: { id: number } }) => findOne(seed.stocks, where.id),
      findMany: async ({ where }: { where: Where }) =>
        (seed.stockMovements ?? []).filter((m) =>
          matches(m as Record<string, unknown>, where)
        ),
    },

    /** Test helper — every journal created so far, in creation order. */
    _journals: journals,
  };

  return client as unknown as Prisma.TransactionClient & { _journals: FakeJournal[] };
}

// ─── Read-side fake: journal lines + accounts, for the report modules ────────

/**
 * A second in-memory stand-in, aimed at the *read* side rather than the posting
 * engine. `src/lib/reports.ts` and `getAccountLedger` query journal lines through
 * groupBy / aggregate / findMany with a nested journal-date filter, none of which
 * the posting fake above needs — so those four operations are implemented here
 * over a seeded set of journals.
 *
 * The point of driving trial balance, ledger and cash flow through *one* seed is
 * that the reports can be cross-checked against each other on identical data,
 * which is exactly what issue #18's "konsisten dengan Buku Besar" asks for.
 */
export interface FakeAccount {
  id: number;
  code: string;
  name: string;
  type: string;
  normalBalance?: string;
  currency?: string;
}

export interface FakeSeedLine {
  accountId: number;
  debit?: number;
  credit?: number;
  currency?: string;
  rate?: number;
  memo?: string | null;
}

export interface FakeSeedJournal {
  id?: number;
  number?: string;
  date: Date;
  note?: string | null;
  lines: FakeSeedLine[];
}

interface ResolvedLine {
  id: number;
  journalId: number;
  accountId: number;
  debit: number;
  credit: number;
  currency: string;
  rate: number;
  baseDebit: number;
  baseCredit: number;
  memo: string | null;
  journal: { id: number; number: string; date: Date; note: string | null };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Apply a Prisma date filter ({gte,lte,lt}) to a journal date. */
function dateMatches(date: Date, filter: { gte?: Date; lte?: Date; lt?: Date } | undefined): boolean {
  if (!filter) return true;
  const t = date.getTime();
  if (filter.gte && t < filter.gte.getTime()) return false;
  if (filter.lte && t > filter.lte.getTime()) return false;
  if (filter.lt && t >= filter.lt.getTime()) return false;
  return true;
}

type LineWhere = {
  accountId?: number;
  journal?: { date?: { gte?: Date; lte?: Date; lt?: Date } };
};

export function createFakeReportClient(seed: {
  accounts: FakeAccount[];
  journals: FakeSeedJournal[];
}) {
  const accounts = seed.accounts.map((a) => ({
    normalBalance: "debit",
    currency: "IDR",
    ...a,
  }));

  const lines: ResolvedLine[] = [];
  let lineId = 0;
  seed.journals.forEach((j, idx) => {
    const journalId = j.id ?? idx + 1;
    const journal = {
      id: journalId,
      number: j.number ?? `JV.TEST.${String(journalId).padStart(5, "0")}`,
      date: j.date,
      note: j.note ?? null,
    };
    for (const l of j.lines) {
      lineId += 1;
      const debit = l.debit ?? 0;
      const credit = l.credit ?? 0;
      const rate = l.rate ?? 1;
      lines.push({
        id: lineId,
        journalId,
        accountId: l.accountId,
        debit,
        credit,
        currency: l.currency ?? "IDR",
        rate,
        baseDebit: round2(debit * rate),
        baseCredit: round2(credit * rate),
        memo: l.memo ?? null,
        journal,
      });
    }
  });

  const select = (where: LineWhere | undefined) =>
    lines.filter(
      (l) =>
        (where?.accountId === undefined || l.accountId === where.accountId) &&
        dateMatches(l.journal.date, where?.journal?.date)
    );

  const client = {
    account: {
      findMany: async () => [...accounts].sort((a, b) => a.code.localeCompare(b.code)),
      findUnique: async ({ where }: { where: { id: number } }) =>
        accounts.find((a) => a.id === where.id) ?? null,
    },
    journalLine: {
      findMany: async ({ where }: { where?: LineWhere } = {}) =>
        select(where).sort((a, b) => a.journal.date.getTime() - b.journal.date.getTime() || a.id - b.id),
      groupBy: async ({ where }: { where?: LineWhere } = {}) => {
        const sums = new Map<number, { baseDebit: number; baseCredit: number }>();
        for (const l of select(where)) {
          const s = sums.get(l.accountId) ?? { baseDebit: 0, baseCredit: 0 };
          s.baseDebit += l.baseDebit;
          s.baseCredit += l.baseCredit;
          sums.set(l.accountId, s);
        }
        return [...sums.entries()].map(([accountId, _sum]) => ({ accountId, _sum }));
      },
      aggregate: async ({ where }: { where?: LineWhere } = {}) => {
        let baseDebit = 0;
        let baseCredit = 0;
        for (const l of select(where)) {
          baseDebit += l.baseDebit;
          baseCredit += l.baseCredit;
        }
        return { _sum: { baseDebit, baseCredit } };
      },
    },
  };

  // The report modules take a `client = prisma` parameter; this fake implements
  // exactly the slice of it they touch.
  return client as unknown as typeof import("@/lib/prisma").prisma;
}
