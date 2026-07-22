/**
 * Add a manual statement line to a reconciliation (issue #24).
 *
 * A line is a mutasi from the bank's rekening koran. Adding one never posts a
 * journal. Refused while the reconciliation is locked.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { statementLineSchema } from "@/lib/validations/reconciliation";
import { assertStatementUnlocked, ReconciliationLockedError } from "@/lib/reconciliation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const body = await request.json();
  const parsed = statementLineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const statement = await prisma.bankStatement.findUnique({ where: { id } });
  if (!statement) {
    return NextResponse.json({ error: "Rekonsiliasi tidak ditemukan." }, { status: 404 });
  }
  try {
    assertStatementUnlocked(statement);
  } catch (e) {
    if (e instanceof ReconciliationLockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  const line = await prisma.bankStatementLine.create({
    data: {
      statementId: id,
      date: new Date(parsed.data.date),
      description: parsed.data.description,
      amount: parsed.data.amount,
    },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.line.add",
    entity: "bank_statement_line",
    entityId: line.id,
    details: { statementId: id, amount: Number(line.amount), description: line.description },
    request,
  });

  return NextResponse.json(line, { status: 201 });
}
