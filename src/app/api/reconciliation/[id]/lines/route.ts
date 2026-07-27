/**
 * Add a manual statement line to a reconciliation (issue #24).
 *
 * A line is a mutasi from the bank's rekening koran. Adding one never posts a
 * journal. Refused while the reconciliation is locked.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { statementLineSchema } from "@/lib/validations/reconciliation";
import { assertStatementUnlocked, ReconciliationLockedError } from "@/lib/reconciliation";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("reconciliation.write");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const body = await request.json();
  const parsed = statementLineSchema.safeParse(body);
  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const statement = await prisma.bankStatement.findUnique({ where: { id } });
  if (!statement) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.reconciliationNotFound") }, { status: 404 });
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
