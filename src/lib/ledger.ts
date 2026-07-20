/**
 * Double-entry ledger engine.
 * Invariant: every journal must balance on IDR base amounts (Σ base_debit = Σ base_credit).
 * Journals are immutable — correct mistakes with reverseJournal(), never edit/delete.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export interface JournalLineInput {
  accountId: number;
  debit?: number; // amount in the line currency
  credit?: number;
  currency?: string;
  rate?: number; // conversion to IDR base (1 for IDR)
  memo?: string | null;
}

export interface JournalEntryInput {
  date: Date;
  type?: string;
  note?: string | null;
  sourceType?: string | null;
  sourceId?: number | null;
  lines: JournalLineInput[];
}

export class UnbalancedJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnbalancedJournalError";
  }
}

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compute IDR base amounts for each line. */
export function prepareLines(lines: JournalLineInput[]) {
  return lines.map((l) => {
    const debit = l.debit ?? 0;
    const credit = l.credit ?? 0;
    const rate = l.rate ?? 1;
    return {
      accountId: l.accountId,
      debit,
      credit,
      currency: l.currency ?? "IDR",
      rate,
      baseDebit: round2(debit * rate),
      baseCredit: round2(credit * rate),
      memo: l.memo ?? null,
    };
  });
}

/** Throw unless the prepared lines balance on IDR base (and are non-empty / well-formed). */
export function assertBalanced(prepared: ReturnType<typeof prepareLines>) {
  for (const l of prepared) {
    if (l.debit > 0 && l.credit > 0) {
      throw new UnbalancedJournalError("Satu baris tidak boleh berisi debit dan kredit sekaligus.");
    }
  }
  const totalDebit = prepared.reduce((s, l) => s + toCents(l.baseDebit), 0);
  const totalCredit = prepared.reduce((s, l) => s + toCents(l.baseCredit), 0);
  if (totalDebit === 0 && totalCredit === 0) {
    throw new UnbalancedJournalError("Jurnal kosong: total nol.");
  }
  if (totalDebit !== totalCredit) {
    throw new UnbalancedJournalError(
      `Jurnal tidak seimbang (IDR): debit ${totalDebit / 100} vs kredit ${totalCredit / 100}.`
    );
  }
}

/** Sequential journal number per year-month: JV.YYYY.MM.NNNNN */
async function nextNumber(tx: Prisma.TransactionClient, date: Date): Promise<string> {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `JV.${y}.${m}.`;
  const count = await tx.journal.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

/** Create a balanced journal (header + lines) atomically. */
export async function postJournal(entry: JournalEntryInput, client = prisma) {
  const prepared = prepareLines(entry.lines);
  assertBalanced(prepared);

  return client.$transaction(async (tx) => {
    const number = await nextNumber(tx, entry.date);
    return tx.journal.create({
      data: {
        number,
        date: entry.date,
        type: entry.type ?? "general",
        note: entry.note ?? null,
        sourceType: entry.sourceType ?? null,
        sourceId: entry.sourceId ?? null,
        lines: { create: prepared },
      },
      include: { lines: { include: { account: true } } },
    });
  });
}

/** Reverse a journal by creating an opposite entry; the original is marked reversed (never deleted). */
export async function reverseJournal(journalId: number, client = prisma) {
  return client.$transaction(async (tx) => {
    const original = await tx.journal.findUnique({
      where: { id: journalId },
      include: { lines: true },
    });
    if (!original) throw new Error("Jurnal tidak ditemukan.");
    if (original.isReversed) throw new Error("Jurnal sudah pernah dibalik.");
    if (original.type === "reversal") throw new Error("Jurnal pembalikan tidak dapat dibalik lagi.");

    const now = new Date();
    const number = await nextNumber(tx, now);
    const reversal = await tx.journal.create({
      data: {
        number,
        date: now,
        type: "reversal",
        note: `Pembalikan ${original.number}`,
        reversalOfId: original.id,
        lines: {
          create: original.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            currency: l.currency,
            rate: l.rate,
            baseDebit: l.baseCredit,
            baseCredit: l.baseDebit,
            memo: l.memo,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
    await tx.journal.update({ where: { id: original.id }, data: { isReversed: true } });
    return reversal;
  });
}

// ─── Buku Besar / General Ledger ─────────────────────────

export interface LedgerRow {
  lineId: number;
  journalId: number;
  number: string;
  date: Date;
  note: string | null;
  memo: string | null;
  debit: number; // IDR base
  credit: number; // IDR base
  balance: number; // running balance (signed per normal balance)
}

export interface AccountLedger {
  account: { id: number; code: string; name: string; type: string; normalBalance: string; currency: string };
  opening: number;
  rows: LedgerRow[];
  closing: number;
  totalDebit: number;
  totalCredit: number;
}

/**
 * Mutations + running balance for one account over an optional date range.
 * Running balance follows the account's normal balance:
 *   debit-normal  → balance += (debit - credit)
 *   credit-normal → balance += (credit - debit)
 * Efficient: 1 aggregate (opening) + 1 findMany (range).
 */
export async function getAccountLedger(
  accountId: number,
  from?: Date,
  to?: Date,
  client = prisma
): Promise<AccountLedger | null> {
  const account = await client.account.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const sign = account.normalBalance === "credit" ? -1 : 1;

  const opening = from
    ? await client.journalLine.aggregate({
        _sum: { baseDebit: true, baseCredit: true },
        where: { accountId, journal: { date: { lt: from } } },
      })
    : null;
  let balance =
    sign * (Number(opening?._sum.baseDebit ?? 0) - Number(opening?._sum.baseCredit ?? 0));
  const openingBalance = balance;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;

  const lines = await client.journalLine.findMany({
    where: {
      accountId,
      ...(from || to ? { journal: { date: dateFilter } } : {}),
    },
    include: { journal: true },
    orderBy: [{ journal: { date: "asc" } }, { id: "asc" }],
  });

  let totalDebit = 0;
  let totalCredit = 0;
  const rows: LedgerRow[] = lines.map((l) => {
    const debit = Number(l.baseDebit);
    const credit = Number(l.baseCredit);
    totalDebit += debit;
    totalCredit += credit;
    balance += sign * (debit - credit);
    return {
      lineId: l.id,
      journalId: l.journalId,
      number: l.journal.number,
      date: l.journal.date,
      note: l.journal.note,
      memo: l.memo,
      debit,
      credit,
      balance,
    };
  });

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
      currency: account.currency,
    },
    opening: openingBalance,
    rows,
    closing: balance,
    totalDebit,
    totalCredit,
  };
}
