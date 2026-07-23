import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractFx, contractSchema, contractSubtotal } from "@/lib/validations/contract";
import { toDateOrNull } from "@/lib/validations/common";
import { requireApiPermission } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { approvalNotice, ensureApprovalRequest } from "@/lib/approval-requests";

export async function GET() {
  const result = await requireApiPermission("contract.read");
  if (!result.authorized) return result.response;

  const contracts = await prisma.contract.findMany({
    orderBy: { date: "desc" },
    include: { items: true, payments: true },
  });

  return NextResponse.json(contracts);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("contract.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = contractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { items, date, dueDate, rate, ...contractData } = parsed.data;
  const fx = contractFx(contractData.currency, items, rate);

  let contract;
  let approval;
  try {
    ({ contract, approval } = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          ...contractData,
          ...fx,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          items: { create: items },
        },
        include: { items: true },
      });

      // Approval (issue #25) — raised inside the SAME transaction as the write,
      // before posting, so the gate in `postForSource` sees it and withholds the
      // journal. Returns null when no ambang applies, which is the ordinary case.
      const request = await ensureApprovalRequest({
        client: tx,
        sourceType: "contract",
        documentId: created.id,
        documentNo: created.contractNo,
        amount: contractSubtotal(items),
        currency: created.currency,
        rate: fx.rate,
        baseAmount: fx.baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      // No `rate` in the context: the contract carries its own now (issue #36).
      await postForSource({ sourceType: "contract", sourceId: created.id, tx });
      return { contract: created, approval: request };
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
        sourceType: "contract",
        documentId: contract.id,
        documentNo: contract.contractNo,
        baseAmount: Number(approval.baseAmount),
        thresholdAmount: Number(approval.thresholdAmount),
        approverRole: approval.approverRole,
      },
      request,
    });
  }

  return NextResponse.json(
    { ...contract, approval: approvalNotice(approval, "Kontrak") },
    { status: 201 }
  );
}
