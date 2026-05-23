import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cashTransactionSchema } from "@/lib/validations/finance";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const result = await requireAuth(["bos", "core"]);
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
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = cashTransactionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, ...transactionData } = parsed.data;
  const transaction = await prisma.cashAccount.create({
    data: {
      ...transactionData,
      date: new Date(date),
    },
  });

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
    },
    request,
  });

  return NextResponse.json(transaction, { status: 201 });
}
