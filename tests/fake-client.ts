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

export interface FakeSeed {
  mappings?: FakeMapping[];
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
  if (cond && typeof cond === "object" && "lte" in (cond as Where)) {
    return new Date(value as Date).getTime() <= new Date((cond as { lte: Date }).lte).getTime();
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
