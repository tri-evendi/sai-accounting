/**
 * Match / unmatch a book movement to a statement line (issue #24).
 *
 * POST   { lineId, cashAccountId }  → match the two (flags only, NO journal).
 * DELETE { lineId }                 → unmatch, clearing both flags.
 *
 * A match records "these two rows are the same event". It moves no money and
 * posts nothing. Both directions are refused while the statement is locked, and
 * a match requires the signed amounts to agree.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { matchSchema, unmatchSchema } from "@/lib/validations/reconciliation";
import {
  canMatch,
  movementSigned,
  assertStatementUnlocked,
  ReconciliationLockedError,
} from "@/lib/reconciliation";

class MatchError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

async function loadUnlockedStatement(id: number) {
  const statement = await prisma.bankStatement.findUnique({ where: { id } });
  if (!statement) throw new MatchError("Rekonsiliasi tidak ditemukan.", 404);
  assertStatementUnlocked(statement);
  return statement;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const parsed = matchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { lineId, cashAccountId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.findUnique({ where: { id } });
      if (!statement) throw new MatchError("Rekonsiliasi tidak ditemukan.", 404);
      assertStatementUnlocked(statement);

      const line = await tx.bankStatementLine.findUnique({ where: { id: lineId } });
      if (!line || line.statementId !== id) {
        throw new MatchError("Baris koran tidak ditemukan pada rekonsiliasi ini.", 404);
      }
      if (line.matched) {
        throw new MatchError("Baris koran ini sudah dicocokkan. Lepas dulu sebelum mencocokkan ulang.");
      }

      const movement = await tx.cashAccount.findUnique({ where: { id: cashAccountId } });
      if (!movement) throw new MatchError("Transaksi buku tidak ditemukan.", 404);
      if (movement.type !== statement.cashType || movement.currency !== statement.currency) {
        throw new MatchError(
          "Transaksi buku bukan milik rekening/mata uang rekonsiliasi ini."
        );
      }
      if (movement.reconciled) {
        throw new MatchError("Transaksi buku ini sudah direkonsiliasi.");
      }
      if (!canMatch({ amount: movementSigned(movement) }, { amount: Number(line.amount) })) {
        throw new MatchError(
          "Nominal transaksi buku dan baris koran tidak sama, tidak bisa dicocokkan."
        );
      }

      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: { matched: true, cashAccountId },
      });
      await tx.cashAccount.update({
        where: { id: cashAccountId },
        data: { reconciled: true, reconciledAt: new Date(), statementId: id },
      });
    });
  } catch (e) {
    if (e instanceof ReconciliationLockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof MatchError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.match",
    entity: "bank_statement_line",
    entityId: lineId,
    details: { statementId: id, cashAccountId },
    request,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const parsed = unmatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { lineId } = parsed.data;

  let cashAccountId: number | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const statement = await loadUnlockedStatement(id);
      const line = await tx.bankStatementLine.findUnique({ where: { id: lineId } });
      if (!line || line.statementId !== statement.id) {
        throw new MatchError("Baris koran tidak ditemukan pada rekonsiliasi ini.", 404);
      }
      cashAccountId = line.cashAccountId;

      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: { matched: false, cashAccountId: null },
      });
      if (cashAccountId != null) {
        await tx.cashAccount.update({
          where: { id: cashAccountId },
          data: { reconciled: false, reconciledAt: null, statementId: null },
        });
      }
    });
  } catch (e) {
    if (e instanceof ReconciliationLockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof MatchError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.unmatch",
    entity: "bank_statement_line",
    entityId: lineId,
    details: { statementId: id, cashAccountId },
    request,
  });

  return NextResponse.json({ success: true });
}
