/**
 * Supplier purchases and payments — the only source type the posting engine
 * supports that previously had no API at all (rows could only arrive via the
 * legacy ETL). Both sides auto-post:
 *   purchase → D: Persediaan (+ D: PPN Masukan) / K: Hutang Usaha
 *   payment  → D: Hutang Usaha / K: Kas & Bank
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierTransactionSchema } from "@/lib/validations/finance";
import { fxAmounts } from "@/lib/validations/fx";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const transactions = await prisma.supplierTransaction.findMany({
    where: { supplierId: parseInt(id) },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(transactions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = supplierTransactionSchema.safeParse({ ...body, supplierId });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, rate: rateInput, ...transactionData } = parsed.data;
  // base_amount covers the full obligation: net value plus input VAT.
  const { rate, baseAmount } = fxAmounts(
    transactionData.currency,
    transactionData.amount + transactionData.taxAmount,
    rateInput
  );

  let transaction;
  try {
    transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierTransaction.create({
        data: {
          ...transactionData,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      await postForSource({ sourceType: "supplier_transaction", sourceId: created.id, tx });
      return created;
    });
  } catch (e) {
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action:
      transaction.type === "purchase"
        ? "supplier_transaction.purchase"
        : "supplier_transaction.payment",
    entity: "supplier_transaction",
    entityId: transaction.id,
    details: {
      supplierId,
      supplierName: supplier.name,
      type: transaction.type,
      amount: Number(transaction.amount),
      taxAmount: Number(transaction.taxAmount),
      currency: transaction.currency,
    },
    request,
  });

  return NextResponse.json(transaction, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const { searchParams } = new URL(request.url);
  const transactionId = parseInt(searchParams.get("transactionId") ?? "");
  if (!Number.isInteger(transactionId)) {
    return NextResponse.json(
      { error: "Parameter \"transactionId\" wajib diisi." },
      { status: 400 }
    );
  }

  const existing = await prisma.supplierTransaction.findFirst({
    where: { id: transactionId, supplierId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await unpostForSource({ sourceType: "supplier_transaction", sourceId: transactionId, tx });
      await tx.supplierTransaction.delete({ where: { id: transactionId } });
    });
  } catch (e) {
    return handlePostingError(e);
  }

  return NextResponse.json({ success: true });
}
