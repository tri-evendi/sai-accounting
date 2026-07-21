/**
 * Uang Muka (advance payments) — list and record (issue #26).
 *
 * Recording an advance is a real cash event, so unlike the supplier allocation
 * endpoints (#37/#38, which write no journal) everything here posts, inside the
 * same `$transaction` as the row: if the journal cannot be built correctly the
 * advance is rolled back rather than left unaccounted for. The period lock (#13)
 * is consulted by `postJournal` on the way through and is never bypassed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { advancePaymentSchema } from "@/lib/validations/advance";
import { fxAmounts } from "@/lib/validations/fx";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { getAdvances, summarizeAdvances, type AdvanceType } from "@/lib/advances";
import { writeAuditLog } from "@/lib/audit";

/**
 * Document number: `UMP.YYYY.MM.NNNNN` for sales, `UMB.…` for purchases.
 * Same shape and same count-based derivation as journal numbers in ledger.ts —
 * `advance_no` is UNIQUE, so a racing duplicate fails the transaction and is
 * retried by the caller rather than silently reusing a number.
 */
async function nextAdvanceNo(
  tx: Prisma.TransactionClient,
  type: AdvanceType,
  date: Date
): Promise<string> {
  const prefix = `${type === "sales" ? "UMP" : "UMB"}.${date.getFullYear()}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}.`;
  const count = await tx.advancePayment.count({ where: { advanceNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

export async function GET(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const customerId = url.searchParams.get("customerId");
  const supplierId = url.searchParams.get("supplierId");

  const rows = await getAdvances({
    type: type === "sales" || type === "purchase" ? type : undefined,
    customerId: customerId ? Number(customerId) : undefined,
    supplierId: supplierId ? Number(supplierId) : undefined,
    // The picker only ever wants advances that still have balance to give.
    openOnly: url.searchParams.get("openOnly") === "1",
  });

  return NextResponse.json({ rows, summary: summarizeAdvances(rows) });
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = advancePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, rate, currency, amount, ...advanceData } = parsed.data;
  // Zod has already rejected a foreign advance with no rate, so this cannot
  // fall back to 1:1 — the bug #35/#36 fixed.
  const { rate: fxRate, baseAmount } = fxAmounts(currency, amount, rate);
  const advanceDate = new Date(date);

  try {
    const advance = await prisma.$transaction(async (tx) => {
      const created = await tx.advancePayment.create({
        data: {
          ...advanceData,
          advanceNo: await nextAdvanceNo(tx, parsed.data.type, advanceDate),
          currency,
          amount,
          rate: fxRate,
          baseAmount,
          date: advanceDate,
        },
      });

      // D: Kas/Bank, K: Uang Muka Penjualan (or the mirror for a purchase).
      // Emphatically no revenue/expense line — see buildAdvanceLines.
      await postForSource({ sourceType: "advance_payment", sourceId: created.id, tx });
      return created;
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "advance.create",
      entity: "advance_payment",
      entityId: advance.id,
      details: {
        advanceNo: advance.advanceNo,
        type: advance.type,
        amount: Number(advance.amount),
        currency: advance.currency,
        baseAmount: advance.baseAmount == null ? null : Number(advance.baseAmount),
      },
      request,
    });

    return NextResponse.json(advance, { status: 201 });
  } catch (e) {
    return handlePostingError(e);
  }
}
