import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cashTransactionSchema } from "@/lib/validations/finance";
import { fxAmounts } from "@/lib/validations/fx";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";

/** Signals an invalid counter account from inside the transaction callback. */
class CounterAccountError extends Error {}

export async function GET(request: Request) {
  const result = await requireApiPermission("cash.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const currency = searchParams.get("currency");

  const where: Record<string, string> = {};
  if (type) where.type = type;
  if (currency) where.currency = currency;

  const transactions = await prisma.cashAccount.findMany({
    where,
    orderBy: { date: "desc" },
  });

  const balances = transactions.reduce(
    (acc, t) => {
      const key = `${t.type}_${t.currency}`;
      if (!acc[key]) acc[key] = { type: t.type, currency: t.currency, debit: 0, credit: 0, balance: 0 };
      acc[key].debit += Number(t.debit);
      acc[key].credit += Number(t.credit);
      acc[key].balance = acc[key].debit - acc[key].credit;
      return acc;
    },
    {} as Record<string, { type: string; currency: string; debit: number; credit: number; balance: number }>
  );

  return NextResponse.json({ transactions, balances: Object.values(balances) });
}

export async function POST(request: Request) {
  const result = await requireApiPermission("cash.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = cashTransactionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, rate: rateInput, counterAccountId, ...transactionData } = parsed.data;
  // A cash row is either money in (debit) or money out (credit); the non-zero
  // side is the transaction value we convert to IDR base.
  const value = transactionData.debit > 0 ? transactionData.debit : transactionData.credit;
  const { rate, baseAmount } = fxAmounts(transactionData.currency, value, rateInput);

  let transaction;
  try {
    transaction = await prisma.$transaction(async (tx) => {
      const counterAccount = await tx.account.findUnique({
        where: { id: counterAccountId },
        select: { id: true, isActive: true },
      });
      if (!counterAccount || !counterAccount.isActive) {
        // Thrown, not returned: we're inside the transaction and must roll back.
        throw new CounterAccountError();
      }

      const created = await tx.cashAccount.create({
        data: {
          ...transactionData,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      await postForSource({
        sourceType: "cash_account",
        sourceId: created.id,
        tx,
        counterAccountId,
      });
      return created;
    });
  } catch (e) {
    if (e instanceof CounterAccountError) {
      return NextResponse.json(
        {
          error:
            "Akun lawan tidak ditemukan atau sudah nonaktif. " +
            "Pilih akun lawan yang aktif. Data tidak tersimpan.",
        },
        { status: 400 }
      );
    }
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: "finance.create",
    entity: "cash_account",
    entityId: transaction.id,
    details: {
      type: transaction.type,
      currency: transaction.currency,
      debit: Number(transaction.debit),
      credit: Number(transaction.credit),
      description: transaction.description,
      counterAccountId,
    },
    request,
  });

  return NextResponse.json(transaction, { status: 201 });
}
