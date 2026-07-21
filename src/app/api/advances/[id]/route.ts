/**
 * One advance: its derived balance, and cancelling it (issue #26).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { getAdvances } from "@/lib/advances";
import { writeAuditLog } from "@/lib/audit";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  // Reuse the list query so the detail page and the list agree on the balance
  // by construction, rather than through two copies of the same arithmetic.
  const [row] = await getAdvances({}).then((rows) => rows.filter((r) => r.id === id));
  if (!row) return NextResponse.json({ error: "Uang muka tidak ditemukan." }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Cancel an advance: reverse its journal and mark it `canceled`.
 *
 * Soft, not a hard delete — docs/DATABASE.md §6 forbids deleting a posted
 * transaction, and `unpostForSource` reverses rather than erases so the trail
 * survives. An advance that has already been compensated is refused outright:
 * cancelling it would strand compensations that relieve a liability no longer on
 * the books. Undo those first, which reverses their journals in the right order.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const advance = await prisma.advancePayment.findUnique({
    where: { id },
    include: { applications: true },
  });
  if (!advance) {
    return NextResponse.json({ error: "Uang muka tidak ditemukan." }, { status: 404 });
  }
  if (advance.applications.length > 0) {
    return NextResponse.json(
      {
        error:
          `Uang muka ${advance.advanceNo} sudah dikompensasi ke ` +
          `${advance.applications.length} dokumen. Batalkan kompensasinya lebih dulu.`,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await unpostForSource({ sourceType: "advance_payment", sourceId: id, tx });
      await tx.advancePayment.update({ where: { id }, data: { status: "canceled" } });
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "advance.cancel",
      entity: "advance_payment",
      entityId: id,
      details: { advanceNo: advance.advanceNo, amount: Number(advance.amount) },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePostingError(e);
  }
}
