import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractPaymentSchema } from "@/lib/validations/contract";
import { fxAmounts } from "@/lib/validations/fx";
import { requireApiPermission } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const payments = await prisma.contractPayment.findMany({
    where: { contractId: parseInt(id) },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(payments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contractId = parseInt(id);

  // Verify contract exists
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = contractPaymentSchema.safeParse({ ...body, contractId });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, contractId: cId, rate: rateInput, ...paymentData } = parsed.data;
  const { rate, baseAmount } = fxAmounts(paymentData.currency, paymentData.amount, rateInput);

  let payment;
  let approval;
  try {
    ({ payment, approval } = await prisma.$transaction(async (tx) => {
      const created = await tx.contractPayment.create({
        data: {
          ...paymentData,
          contractId: cId,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      // Approval (issue #25) — see the invoice-payment route for why the parent
      // document's number identifies a payment in the queue.
      const request = await ensureApprovalRequest({
        client: tx,
        sourceType: "contract_payment",
        documentId: created.id,
        documentNo: contract.contractNo,
        amount: paymentData.amount,
        currency: paymentData.currency,
        rate,
        baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      await postForSource({ sourceType: "contract_payment", sourceId: created.id, tx });
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
        sourceType: "contract_payment",
        documentId: payment.id,
        documentNo: contract.contractNo,
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
