import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicePaymentSchema } from "@/lib/validations/invoice";
import { fxAmounts } from "@/lib/validations/fx";
import { requireApiPermission } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const invoiceId = parseInt(id);

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = invoicePaymentSchema.safeParse({ ...body, invoiceId });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, invoiceId: iId, rate: rateInput, ...paymentData } = parsed.data;
  // Store the FX triple the ledger needs: amount + currency + rate + IDR base.
  const { rate, baseAmount } = fxAmounts(paymentData.currency, paymentData.amount, rateInput);

  let payment;
  let approval;
  try {
    ({ payment, approval } = await prisma.$transaction(async (tx) => {
      const created = await tx.invoicePayment.create({
        data: {
          ...paymentData,
          invoiceId: iId,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      // Approval (issue #25). A payment has no number of its own, so the parent
      // invoice's number is what identifies it in the queue.
      const request = await ensureApprovalRequest({
        client: tx,
        sourceType: "invoice_payment",
        documentId: created.id,
        documentNo: invoice.invoiceNo,
        amount: paymentData.amount,
        currency: paymentData.currency,
        rate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      await postForSource({ sourceType: "invoice_payment", sourceId: created.id, tx });
      return { payment: created, approval: request };
    }));
  } catch (e) {
    return handlePostingError(e);
  }

  if (approval) {
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "approval.request",
      entity: "approval_request",
      entityId: approval.id,
      details: {
        sourceType: "invoice_payment",
        documentId: payment.id,
        documentNo: invoice.invoiceNo,
        baseAmount: Number(approval.baseAmount),
        thresholdAmount: Number(approval.thresholdAmount),
        approverRole: approval.approverRole,
      },
      request,
    });
  }

  return NextResponse.json(
    { ...payment, approval: approvalNotice(approval, "Pembayaran") },
    { status: 201 }
  );
}
