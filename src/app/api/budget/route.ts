/**
 * Anggaran akun — upsert one budget (issue #29).
 *
 * A budget is a PLAN, not a ledger entry: this writes a row in `budgets` and
 * posts NO journal. One plan per (account, year, month) — re-submitting the same
 * period is an edit, so this upserts on the natural key rather than piling up
 * duplicate rows. bos-only, matching the reports/setup surfaces.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { budgetSchema } from "@/lib/validations/budget";
import { accountCategoryFor } from "@/lib/accounting";

export async function POST(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const parsed = budgetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { accountId, year, month, amount, note } = parsed.data;

  // The account must exist and must be a P&L account — a budget is only
  // comparable against the Laba/Rugi, so budgeting a balance-sheet account would
  // produce a row that can never show a realisation. A clear 400 beats that.
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { type: true },
  });
  if (!account) {
    return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 400 });
  }
  const category = accountCategoryFor(account.type);
  if (category !== "revenue" && category !== "expense") {
    return NextResponse.json(
      { error: "Anggaran hanya untuk akun pendapatan atau beban (Laba/Rugi)." },
      { status: 400 }
    );
  }

  const budget = await prisma.budget.upsert({
    where: { accountId_year_month: { accountId, year, month } },
    create: { accountId, year, month, amount, note: note ?? null },
    update: { amount, note: note ?? null },
  });

  return NextResponse.json(budget, { status: 201 });
}
