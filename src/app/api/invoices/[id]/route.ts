import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema, invoiceSubtotal } from "@/lib/validations/invoice";
import { resolveInvoiceTax } from "@/lib/tax";
import { fxAmounts } from "@/lib/validations/fx";
import { toDateOrNull } from "@/lib/validations/common";
import { requireApiPermission } from "@/lib/auth-guard";
import { repostForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  approvalNotice,
  reevaluateApprovalRequest,
  revocationNotice,
  type ReevaluateResult,
} from "@/lib/approval-requests";
import {
  assertWithinContract,
  contractOutstandingForInvoice,
  OverInvoiceError,
} from "@/lib/document-chain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: parseInt(id) },
    include: { items: true, payments: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(invoice);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    items,
    date,
    dueDate,
    pebDate,
    rate,
    currency,
    taxable,
    taxRate,
    taxAmount,
    contractId,
    ...invoiceData
  } = parsed.data;
  const invoiceId = parseInt(id);
  // Recomputed on every edit: changing an item, the taxable flag, the rate or the
  // PPN rate has to move DPP/PPN/base_amount with it, or the stored values drift
  // from the reposted journal.
  const tax = resolveInvoiceTax(invoiceSubtotal(items), { taxable, taxRate, taxAmount });
  const { rate: fxRate, baseAmount } = fxAmounts(currency, tax.total, rate);

  // Friendly check for the source document (an FK violation would otherwise be an
  // opaque 500). Nullable — an edit may also detach the faktur from its contract.
  if (contractId != null && !(await prisma.contract.findUnique({ where: { id: contractId } }))) {
    return NextResponse.json({ error: "Kontrak sumber tidak ditemukan." }, { status: 400 });
  }

  try {
    const { invoice, reapproval } = await prisma.$transaction(async (tx) => {
      // Outstanding guard (issue #15), inside the transaction — an edit can
      // overdraw a contract just as a new faktur can. THIS invoice's own lines are
      // excluded from "already invoiced", or every save would collide with itself.
      if (contractId != null) {
        const { lines } = await contractOutstandingForInvoice(tx, contractId, invoiceId);
        assertWithinContract(lines, items);
      }

      await tx.invoiceItem.deleteMany({ where: { invoiceId } });

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...invoiceData,
          contractId: contractId ?? null,
          currency,
          taxable: tax.taxable,
          taxRate: tax.taxRate,
          dpp: tax.dpp,
          taxAmount: tax.taxAmount,
          rate: fxRate,
          baseAmount,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          // pebNumber / exportNote flow through invoiceData; pebDate needs coercion.
          pebDate: toDateOrNull(pebDate),
          items: { create: items },
        },
        include: { items: true },
      });

      // Penilaian ulang persetujuan (issue #45) — SEBELUM repost, karena gerbang
      // jurnal membaca status pengajuan lewat transaksi yang sama. Faktur kecil
      // yang diedit menjadi besar kini masuk antrean, dan faktur yang sudah
      // disetujui lalu dinaikkan melampaui restunya kehilangan persetujuan itu.
      const reapproval: ReevaluateResult = await reevaluateApprovalRequest({
        client: tx,
        sourceType: "invoice",
        documentId: invoiceId,
        documentNo: updated.invoiceNo,
        amount: tax.total,
        currency,
        rate: fxRate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      // Reverse the old journal and post a fresh one, so the ledger matches the
      // edited document without ever mutating a posted line.
      await repostForSource({ sourceType: "invoice", sourceId: invoiceId, tx });
      return { invoice: updated, reapproval };
    });

    if (reapproval.action === "revoke" || reapproval.action === "create") {
      await writeAuditLog({
        userId: result.session.user.id,
        username: result.session.user.email,
        action: reapproval.action === "revoke" ? "approval.revoke" : "approval.request",
        entity: "approval_request",
        entityId: reapproval.request?.id ?? invoiceId,
        details: {
          sourceType: "invoice",
          documentId: invoiceId,
          documentNo: invoice.invoiceNo,
          baseAmount: Number(baseAmount ?? 0),
          previouslyApprovedBase: reapproval.previouslyApprovedBase,
          reason: "dokumen diedit",
        },
        request,
      });
    }

    return NextResponse.json({
      ...invoice,
      approval:
        reapproval.action === "revoke"
          ? { revoked: true, message: revocationNotice("Faktur") }
          : reapproval.action === "create"
            ? approvalNotice(reapproval.request, "Faktur")
            : null,
    });
  } catch (e) {
    if (e instanceof OverInvoiceError) {
      return NextResponse.json({ error: e.message, saved: false }, { status: 400 });
    }
    return handlePostingError(e);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const invoiceId = parseInt(id);

  try {
    await prisma.$transaction(async (tx) => {
      // Payments cascade-delete with the invoice, so their journals have to be
      // reversed here too — otherwise the ledger keeps entries whose source row
      // no longer exists.
      const payments = await tx.invoicePayment.findMany({
        where: { invoiceId },
        select: { id: true },
      });
      for (const payment of payments) {
        await unpostForSource({ sourceType: "invoice_payment", sourceId: payment.id, tx });
      }
      await unpostForSource({ sourceType: "invoice", sourceId: invoiceId, tx });

      await tx.invoice.delete({ where: { id: invoiceId } });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePostingError(e);
  }
}
