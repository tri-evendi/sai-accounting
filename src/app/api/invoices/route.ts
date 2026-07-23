/**
 * Faktur — list & create.
 *
 * Dokumen berantai (issue #15): a faktur may name the `contractId` it was drawn
 * from with the "Ambil" pull. That link is what the OUTSTANDING GUARD measures
 * against — `assertWithinContract` runs INSIDE the `$transaction`, so a faktur
 * that would invoice more of a contract line than was contracted never leaves a
 * posted document (or a revenue journal) behind. The check is server-side on
 * purpose: the form's remainder hints are a convenience, not the rule.
 *
 * NO NEW ACCOUNTING: a pulled faktur posts through the existing invoice rule,
 * unchanged (D: Piutang Usaha, K: Pendapatan + PPN Keluaran).
 *
 * Since issue #5 the body of the transaction lives in `@/lib/document-writes`
 * (`createInvoiceInTx`) because the "Penjualan Baru" wizard creates a faktur too,
 * in the same transaction as its surat jalan. Shared verbatim rather than copied,
 * so the tax recompute, the outstanding guard and the approval gate cannot drift.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validations/invoice";
import { requireApiPermission } from "@/lib/auth-guard";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { createInvoiceInTx } from "@/lib/document-writes";
import { OverInvoiceError } from "@/lib/document-chain";
import { approvalNotice } from "@/lib/approval-requests";

export async function GET() {
  const result = await requireApiPermission("invoice.read");
  if (!result.authorized) return result.response;

  const invoices = await prisma.invoice.findMany({
    orderBy: { date: "desc" },
    include: { items: true, payments: true },
  });

  return NextResponse.json(invoices);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { contractId } = parsed.data;

  // Friendly check for the source document (an FK violation would otherwise be an
  // opaque 500). Nullable — a faktur need not come from a contract.
  if (contractId != null && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
    return NextResponse.json({ error: "Kontrak sumber tidak ditemukan." }, { status: 400 });
  }

  let invoice;
  let approval;
  try {
    // Invoice and journal commit together: if posting can't produce a correct
    // journal, the invoice is rolled back rather than left unaccounted for.
    // The body of the transaction is `createInvoiceInTx` — the SAME function the
    // wizard endpoint calls (issue #5), so the tax recompute, the outstanding
    // guard (#15), the approval gate (#25) and the posting engine can never drift
    // into two versions.
    ({ invoice, approval } = await prisma.$transaction((tx) =>
      createInvoiceInTx(tx, parsed.data, {
        requestedById: parseInt(result.session.user.id, 10),
      })
    ));
  } catch (e) {
    if (e instanceof OverInvoiceError) {
      return NextResponse.json({ error: e.message, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }

  // Only a chained faktur is audited here: drawing on a contract consumes part of
  // an outstanding promise, which is exactly the kind of act the log exists for.
  if (contractId != null) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "invoice.pull_from_contract",
      entity: "invoice",
      entityId: invoice.id,
      details: {
        invoiceNo: invoice.invoiceNo,
        contractId,
        itemCount: invoice.items.length,
        totalQuantity: invoice.items.reduce((s, i) => s + Number(i.quantity), 0),
      },
      request,
    });
  }

  if (approval) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "approval.request",
      entity: "approval_request",
      entityId: approval.id,
      details: {
        sourceType: "invoice",
        documentId: invoice.id,
        documentNo: invoice.invoiceNo,
        baseAmount: Number(approval.baseAmount),
        thresholdAmount: Number(approval.thresholdAmount),
        approverRole: approval.approverRole,
      },
      request,
    });
  }

  return NextResponse.json(
    { ...invoice, approval: approvalNotice(approval, "Faktur") },
    { status: 201 }
  );
}
