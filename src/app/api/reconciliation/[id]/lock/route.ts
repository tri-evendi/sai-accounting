/**
 * Lock / reopen a reconciliation (issue #24).
 *
 * POST   → lock a COMPLETED reconciliation (difference 0, nothing unmatched).
 *          Once locked, lines cannot be matched/unmatched and the reconciled
 *          book movements are guarded against casual edits (assertMovementEditable).
 * DELETE → reopen: back to `draft` so corrections can be made. Existing matches
 *          are preserved; they simply become editable again.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getReconciliation } from "@/lib/bank-statements";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const view = await getReconciliation(id);
  if (!view) return NextResponse.json({ error: "Rekonsiliasi tidak ditemukan." }, { status: 404 });
  if (view.statement.status === "locked") {
    return NextResponse.json({ error: "Rekonsiliasi sudah dikunci." }, { status: 409 });
  }
  if (!view.summary.complete) {
    return NextResponse.json(
      {
        error:
          "Rekonsiliasi belum selesai — masih ada selisih atau item yang belum dicocokkan. " +
          "Selesaikan dulu sebelum mengunci.",
      },
      { status: 409 }
    );
  }

  await prisma.bankStatement.update({
    where: { id },
    data: { status: "locked", lockedAt: new Date() },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.lock",
    entity: "bank_statement",
    entityId: id,
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

  const statement = await prisma.bankStatement.findUnique({ where: { id } });
  if (!statement) return NextResponse.json({ error: "Rekonsiliasi tidak ditemukan." }, { status: 404 });
  if (statement.status !== "locked") {
    return NextResponse.json({ error: "Rekonsiliasi belum dikunci." }, { status: 409 });
  }

  await prisma.bankStatement.update({
    where: { id },
    data: { status: "draft", lockedAt: null },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    action: "reconciliation.reopen",
    entity: "bank_statement",
    entityId: id,
    request,
  });

  return NextResponse.json({ success: true });
}
