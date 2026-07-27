/**
 * Match / unmatch a book movement to a statement line (issue #24).
 *
 * POST   { lineId, cashMovementId }  → match the two (flags only, NO journal).
 * DELETE { lineId }                 → unmatch, clearing both flags.
 *
 * A match records "these two rows are the same event". It moves no money and
 * posts nothing. Both directions are refused while the statement is locked, and
 * a match requires the signed amounts to agree.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { matchSchema, unmatchSchema } from "@/lib/validations/reconciliation";
import {
  canMatch,
  movementSigned,
  assertStatementUnlocked,
  ReconciliationLockedError,
} from "@/lib/reconciliation";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Penolakan pencocokan yang membawa KUNCI kamus, bukan kalimat.
 *
 * Pesannya memang sampai ke pengguna (`catch` di bawah menjadikannya `error`
 * pada jawaban), jadi ia harus ikut berganti bahasa — dan `throw` tidak bisa
 * `await getRequestI18n()` dari dalam transaksi. Kuncinya diterjemahkan di
 * `catch`, yaitu batas tampilan yang sama seperti route lain.
 */
class MatchError extends Error {
  constructor(readonly key: DictionaryKey, readonly status = 409) {
    super(key);
  }
}

async function loadUnlockedStatement(id: number) {
  const statement = await prisma.bankStatement.findUnique({ where: { id } });
  if (!statement) throw new MatchError("errors.reconciliationNotFound", 404);
  assertStatementUnlocked(statement);
  return statement;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("reconciliation.write");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const parsed = matchSchema.safeParse(await request.json());
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
  const { lineId, cashMovementId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.findUnique({ where: { id } });
      if (!statement) throw new MatchError("errors.reconciliationNotFound", 404);
      assertStatementUnlocked(statement);

      const line = await tx.bankStatementLine.findUnique({ where: { id: lineId } });
      if (!line || line.statementId !== id) {
        throw new MatchError("errors.statementLineNotFound", 404);
      }
      if (line.matched) {
        throw new MatchError("errors.statementLineAlreadyMatched");
      }

      const movement = await tx.cashMovement.findUnique({ where: { id: cashMovementId } });
      if (!movement) throw new MatchError("errors.bookMovementNotFound", 404);
      if (movement.type !== statement.cashType || movement.currency !== statement.currency) {
        throw new MatchError("errors.bookMovementWrongAccount");
      }
      if (movement.reconciled) {
        throw new MatchError("errors.bookMovementAlreadyReconciled");
      }
      if (!canMatch({ amount: movementSigned(movement) }, { amount: Number(line.amount) })) {
        throw new MatchError("errors.matchAmountMismatch");
      }

      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: { matched: true, cashMovementId },
      });
      await tx.cashMovement.update({
        where: { id: cashMovementId },
        data: { reconciled: true, reconciledAt: new Date(), statementId: id },
      });
    });
  } catch (e) {
    if (e instanceof ReconciliationLockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof MatchError) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t(e.key) }, { status: e.status });
    }
    throw e;
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.match",
    entity: "bank_statement_line",
    entityId: lineId,
    details: { statementId: id, cashMovementId },
    request,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("reconciliation.write");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const parsed = unmatchSchema.safeParse(await request.json());
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
  const { lineId } = parsed.data;

  let cashMovementId: number | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const statement = await loadUnlockedStatement(id);
      const line = await tx.bankStatementLine.findUnique({ where: { id: lineId } });
      if (!line || line.statementId !== statement.id) {
        throw new MatchError("errors.statementLineNotFound", 404);
      }
      cashMovementId = line.cashMovementId;

      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: { matched: false, cashMovementId: null },
      });
      if (cashMovementId != null) {
        await tx.cashMovement.update({
          where: { id: cashMovementId },
          data: { reconciled: false, reconciledAt: null, statementId: null },
        });
      }
    });
  } catch (e) {
    if (e instanceof ReconciliationLockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof MatchError) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t(e.key) }, { status: e.status });
    }
    throw e;
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.unmatch",
    entity: "bank_statement_line",
    entityId: lineId,
    details: { statementId: id, cashMovementId },
    request,
  });

  return NextResponse.json({ success: true });
}
