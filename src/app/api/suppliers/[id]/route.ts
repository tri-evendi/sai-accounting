import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";
import { unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("supplier.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id: parseInt(id) },
    include: { transactions: { orderBy: { date: "desc" } } },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(supplier);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("supplier.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supplier = await prisma.supplier.update({
    where: { id: parseInt(id) },
    data: parsed.data,
  });

  return NextResponse.json(supplier);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("supplier.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  try {
    await prisma.$transaction(async (tx) => {
      // Transactions cascade-delete with the supplier — reverse their journals
      // first so the ledger has no entries pointing at deleted rows.
      const transactions = await tx.supplierTransaction.findMany({
        where: { supplierId },
        select: { id: true },
      });
      for (const trx of transactions) {
        await unpostForSource({ sourceType: "supplier_transaction", sourceId: trx.id, tx });
      }

      await tx.supplier.delete({ where: { id: supplierId } });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePostingError(e);
  }
}
