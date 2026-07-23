/**
 * Bank reconciliations: list and create (issue #24).
 *
 * A reconciliation is a `BankStatement` — one bank account (cashType + currency)
 * over one period. Creating one records the bank's opening/closing balance; lines
 * are added afterwards (manual or CSV). No journal is posted anywhere here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { bankStatementSchema } from "@/lib/validations/reconciliation";

export async function GET() {
  const result = await requireApiPermission("reconciliation.read");
  if (!result.authorized) return result.response;

  const statements = await prisma.bankStatement.findMany({
    orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
    include: { _count: { select: { lines: true } } },
  });
  return NextResponse.json(statements);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("reconciliation.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = bankStatementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { periodStart, periodEnd, ...rest } = parsed.data;

  let statement;
  try {
    statement = await prisma.bankStatement.create({
      data: {
        ...rest,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      },
    });
  } catch (e) {
    // Unique (cashType, currency, periodStart, periodEnd).
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Rekonsiliasi untuk rekening dan periode ini sudah ada. Buka yang sudah ada, jangan buat baru.",
        },
        { status: 409 }
      );
    }
    throw e;
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.create",
    entity: "bank_statement",
    entityId: statement.id,
    details: {
      currency: statement.currency,
      periodStart,
      periodEnd,
      openingBalance: Number(statement.openingBalance),
      closingBalance: Number(statement.closingBalance),
    },
    request,
  });

  return NextResponse.json(statement, { status: 201 });
}
