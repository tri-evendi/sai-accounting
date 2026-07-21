/**
 * CSV import of statement lines (issue #24).
 *
 * Accepts `{ csv: string }`. The CSV is validated all-or-nothing: if any row is
 * malformed the import is rejected with row-numbered messages and nothing is
 * written — never a silent partial import. Refused while the statement is locked.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import {
  parseStatementCsv,
  assertStatementUnlocked,
  ReconciliationLockedError,
} from "@/lib/reconciliation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const body = await request.json();
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ error: "Isi CSV kosong." }, { status: 400 });
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

  const parsed = parseStatementCsv(csv);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "CSV memuat baris yang tidak valid. Perbaiki lalu impor ulang.", rowErrors: parsed.errors },
      { status: 400 }
    );
  }

  await prisma.bankStatementLine.createMany({
    data: parsed.rows.map((r) => ({
      statementId: id,
      date: new Date(r.date),
      description: r.description,
      amount: r.amount,
    })),
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.import",
    entity: "bank_statement",
    entityId: id,
    details: { imported: parsed.rows.length },
    request,
  });

  return NextResponse.json({ imported: parsed.rows.length }, { status: 201 });
}
