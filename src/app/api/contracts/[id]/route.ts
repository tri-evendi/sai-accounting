import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractFx, contractSchema, contractSubtotal } from "@/lib/validations/contract";
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id: parseInt(id) },
    include: { items: true, payments: true, documents: true, consigneeRef: true },
  });

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(contract);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = contractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { items, date, dueDate, rate, ...contractData } = parsed.data;
  const contractId = parseInt(id);
  const fx = contractFx(contractData.currency, items, rate);

  try {
    // Transaksinya mengembalikan hasil penilaian ulang bersama kontraknya, bukan
    // menitipkannya ke variabel luar: penugasan dari dalam closure tidak terbaca
    // oleh penyempitan tipe TypeScript.
    const { contract, reapproval } = await prisma.$transaction(async (tx) => {
      await tx.contractItem.deleteMany({ where: { contractId } });

      const updated = await tx.contract.update({
        where: { id: contractId },
        data: {
          ...contractData,
          ...fx,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          items: { create: items },
        },
        include: { items: true },
      });

      // Penilaian ulang persetujuan (issue #45) — SEBELUM repost, karena gerbang
      // jurnal membaca status pengajuan lewat transaksi yang sama. Kontrak kecil
      // yang diedit menjadi besar kini masuk antrean, dan kontrak yang sudah
      // disetujui lalu dinaikkan melampaui restunya kehilangan persetujuan itu —
      // repost di bawah membalik jurnal lamanya dan menolak memposting yang baru.
      const reapproval: ReevaluateResult = await reevaluateApprovalRequest({
        client: tx,
        sourceType: "contract",
        documentId: contractId,
        documentNo: updated.contractNo,
        amount: contractSubtotal(items),
        currency: updated.currency,
        rate: fx.rate,
        baseAmount: fx.baseAmount,
        requestedById: parseInt(result.session.user.id, 10),
      });

      // The rate is written above, so the repost reads it off the contract itself
      // instead of being handed one (issue #36).
      await repostForSource({ sourceType: "contract", sourceId: contractId, tx });
      return { contract: updated, reapproval };
    });

    if (reapproval && (reapproval.action === "revoke" || reapproval.action === "create")) {
      await writeAuditLog({
        userId: result.session.user.id,
        username: result.session.user.email,
        action: reapproval.action === "revoke" ? "approval.revoke" : "approval.request",
        entity: "approval_request",
        entityId: reapproval.request?.id ?? contractId,
        details: {
          sourceType: "contract",
          documentId: contractId,
          documentNo: contract.contractNo,
          baseAmount: Number(fx.baseAmount ?? 0),
          previouslyApprovedBase: reapproval.previouslyApprovedBase,
          reason: "dokumen diedit",
        },
        request,
      });
    }

    return NextResponse.json({
      ...contract,
      approval:
        reapproval?.action === "revoke"
          ? { revoked: true, message: revocationNotice("Kontrak") }
          : reapproval?.action === "create"
            ? approvalNotice(reapproval.request, "Kontrak")
            : null,
    });
  } catch (e) {
    return handlePostingError(e);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("contract.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contractId = parseInt(id);

  // Dokumen berantai (issue #15): a contract that has already been drawn on is
  // RESTRICTed by the FKs on `invoices.contract_id` / `delivery_orders.contract_id`.
  // Say so in Indonesian instead of letting the driver raise an opaque 500.
  const [invoiceCount, deliveryOrderCount] = await Promise.all([
    prisma.invoice.count({ where: { contractId } }),
    prisma.deliveryOrder.count({ where: { contractId } }),
  ]);
  if (invoiceCount > 0 || deliveryOrderCount > 0) {
    const parts = [
      invoiceCount > 0 ? `${invoiceCount} faktur` : null,
      deliveryOrderCount > 0 ? `${deliveryOrderCount} surat jalan` : null,
    ].filter(Boolean);
    return NextResponse.json(
      {
        error:
          `Kontrak ini sudah dipakai oleh ${parts.join(" dan ")}, jadi tidak bisa dihapus. ` +
          `Hapus atau lepaskan dokumen tersebut lebih dulu, atau batalkan kontrak ` +
          `(status "canceled") agar rantai dokumennya tetap utuh.`,
      },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Payments cascade-delete with the contract — reverse their journals too.
      const payments = await tx.contractPayment.findMany({
        where: { contractId },
        select: { id: true },
      });
      for (const payment of payments) {
        await unpostForSource({ sourceType: "contract_payment", sourceId: payment.id, tx });
      }
      await unpostForSource({ sourceType: "contract", sourceId: contractId, tx });

      await tx.contract.delete({ where: { id: contractId } });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePostingError(e);
  }
}
