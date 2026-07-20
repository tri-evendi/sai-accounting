/**
 * Kompensasi uang muka — applying advances to an invoice / supplier purchase.
 *
 * Issue #26. This is the endpoint that closes the loop: money received before
 * the invoice existed is moved out of Uang Muka and against Piutang/Hutang,
 * reducing what is still owed.
 *
 * ── THIS IS NOT `supplier_payment_allocations` ──────────────────────────────
 * That endpoint (#37/#38) deliberately writes no journal, because the payment
 * and the purchase are each already posted and the link between them moves no
 * money. Here the opposite holds: the movement out of Uang Muka appears in
 * neither the advance's journal nor the invoice's, so every compensation posts
 * its own entry. Which also means the period lock (#13) DOES apply and is
 * reached through `postJournal` in the normal way — deleting a compensation
 * reverses its journal rather than quietly dropping the row.
 *
 * The over-compensation guard is layered exactly as #37/#38 layered theirs:
 * `checkApplicationSet` catches what the payload alone can prove (a duplicate
 * advance), and `resolveApplicationLines` re-checks every line against real rows
 * in IDR base, decrementing both the advance's and the target's room as it goes.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceApplicationsSchema } from "@/lib/validations/advance";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { resolveApplicationLines, getAdvanceTargetState } from "@/lib/advances";
import { writeAuditLog } from "@/lib/audit";

/** Remaining balance of a compensation target, for the form that fills it in. */
export async function GET(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const url = new URL(request.url);
  const kind = url.searchParams.get("targetKind");
  const id = Number(url.searchParams.get("targetId"));
  if ((kind !== "invoice" && kind !== "purchase") || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "targetKind/targetId tidak valid." }, { status: 400 });
  }

  const target = await getAdvanceTargetState(kind, id);
  if (!target) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  return NextResponse.json(target);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = advanceApplicationsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { targetKind, targetId, date, lines, note } = parsed.data;
  if (lines.length === 0) {
    return NextResponse.json({ error: "Tidak ada uang muka yang dipilih." }, { status: 400 });
  }

  // Everything the payload cannot prove: the advances exist, point the right
  // way, have a usable IDR value, and neither they nor the target are
  // over-committed. Checked before anything is written, so a rejected request
  // never leaves a half-applied state behind.
  const resolved = await resolveApplicationLines({ targetKind, targetId, lines });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

  const appliedDate = new Date(date);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const line of resolved.lines) {
        const row = await tx.advanceApplication.create({
          data: {
            advanceId: line.advanceId,
            invoiceId: targetKind === "invoice" ? targetId : null,
            purchaseId: targetKind === "purchase" ? targetId : null,
            date: appliedDate,
            amount: line.amount,
            currency: line.currency,
            rate: line.rate,
            baseAmount: line.base,
            note: note ?? null,
          },
        });
        // One journal per compensation, not one for the batch: each line
        // relieves a different advance at a different rate, so each carries its
        // own realized FX difference and must stand or fall on its own.
        await postForSource({ sourceType: "advance_application", sourceId: row.id, tx });
        rows.push(row);
      }
      return rows;
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "advance.apply",
      entity: "advance_application",
      entityId: created[0]?.id,
      details: {
        targetKind,
        targetId,
        lines: resolved.lines.map((l) => ({
          advanceId: l.advanceId,
          amount: l.amount,
          currency: l.currency,
          baseAmount: l.base,
        })),
      },
      request,
    });

    return NextResponse.json({ success: true, applications: created }, { status: 201 });
  } catch (e) {
    return handlePostingError(e);
  }
}

/**
 * Undo one compensation.
 *
 * The journal is REVERSED, never deleted — `unpostForSource` adds an opposite
 * entry and leaves the original standing, so the audit trail survives and the
 * period lock still guards both ends (ledger.ts checks the original's date as
 * well as today's). Only then is the row removed; the FK is RESTRICT precisely
 * so that this order cannot be skipped by a cascade.
 */
export async function DELETE(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const existing = await prisma.advanceApplication.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Kompensasi tidak ditemukan." }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await unpostForSource({ sourceType: "advance_application", sourceId: id, tx });
      await tx.advanceApplication.delete({ where: { id } });
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "advance.unapply",
      entity: "advance_application",
      entityId: id,
      details: {
        advanceId: existing.advanceId,
        amount: Number(existing.amount),
        currency: existing.currency,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePostingError(e);
  }
}
