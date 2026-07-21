import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractFx, contractSchema } from "@/lib/validations/contract";
import { toDateOrNull } from "@/lib/validations/common";
import { requireAuth } from "@/lib/auth-guard";
import { repostForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
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
  const result = await requireAuth(["bos", "core"]);
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
    const contract = await prisma.$transaction(async (tx) => {
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

      // The rate is written above, so the repost reads it off the contract itself
      // instead of being handed one (issue #36).
      await repostForSource({ sourceType: "contract", sourceId: contractId, tx });
      return updated;
    });

    return NextResponse.json(contract);
  } catch (e) {
    return handlePostingError(e);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contractId = parseInt(id);

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
