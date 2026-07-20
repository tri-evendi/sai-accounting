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
import { toDateOrNull } from "@/lib/validations/common";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource, unpostForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getSupplierPurchaseAllocations } from "@/lib/receivables";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  // `?outstanding=1` feeds the payment form's allocation picker (issue #37):
  // which purchases still have room, and how much. A separate shape from the
  // plain transaction list because it carries derived, not stored, numbers.
  const { searchParams } = new URL(request.url);
  if (searchParams.get("outstanding") === "1") {
    const purchases = await getSupplierPurchaseAllocations(supplierId);
    return NextResponse.json(
      purchases
        // Nothing left to settle, or no IDR value to settle it against.
        .filter((p) => p.remainingBase == null || p.remainingBase > 0.005)
        .map((p) => ({
          id: p.id,
          date: p.date,
          dueDate: p.dueDate,
          amount: p.amount,
          currency: p.currency,
          totalBase: p.totalBase,
          allocatedBase: p.allocatedBase,
          remainingBase: p.remainingBase,
          note: p.note,
        }))
    );
  }

  const transactions = await prisma.supplierTransaction.findMany({
    where: { supplierId },
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

  const { date, dueDate, rate: rateInput, allocations, ...transactionData } = parsed.data;
  // base_amount covers the full obligation: net value plus input VAT.
  const { rate, baseAmount } = fxAmounts(
    transactionData.currency,
    transactionData.amount + transactionData.taxAmount,
    rateInput
  );

  // ── Over-allocation guard (issue #37) ──────────────────────────────────────
  // The Zod schema already capped the allocations at the payment's own amount.
  // What it cannot see is the other side: whether each target purchase belongs
  // to this supplier and still has room. Checked here, before anything is
  // written, so a rejected allocation never leaves a posted payment behind.
  const allocationLines: { purchaseId: number; amount: number; base: number }[] = [];
  if (allocations && allocations.length > 0) {
    const state = await getSupplierPurchaseAllocations(supplierId);
    const byId = new Map(state.map((p) => [p.id, p]));

    for (const line of allocations) {
      const purchase = byId.get(line.purchaseId);
      if (!purchase) {
        return NextResponse.json(
          {
            error: `Pembelian #${line.purchaseId} tidak ditemukan pada supplier ini.`,
          },
          { status: 400 }
        );
      }
      if (purchase.remainingBase == null) {
        // Foreign purchase with no rate: it has no IDR value, so "how much is
        // left" has no answer and no allocation against it can be checked.
        return NextResponse.json(
          {
            error: `Pembelian #${line.purchaseId} belum punya kurs, sehingga sisa utangnya dalam IDR tidak diketahui. Isi kurs pembelian tersebut lebih dulu.`,
          },
          { status: 400 }
        );
      }

      // Convert the allocation to IDR at the PAYMENT's rate — the same rate the
      // ledger posted this payment at — then compare like with like. Currencies
      // are never added: both sides of this comparison are IDR base.
      const { baseAmount: lineBase } = fxAmounts(
        transactionData.currency,
        line.amount,
        rateInput
      );

      if (lineBase > purchase.remainingBase + 0.005) {
        return NextResponse.json(
          {
            error: `Alokasi ke pembelian #${line.purchaseId} (Rp ${lineBase.toLocaleString("id-ID")}) melebihi sisa utangnya (Rp ${purchase.remainingBase.toLocaleString("id-ID")}).`,
          },
          { status: 400 }
        );
      }

      allocationLines.push({
        purchaseId: line.purchaseId,
        amount: line.amount,
        base: lineBase,
      });
      // Two lines in one payload could each fit alone but not together.
      byId.set(line.purchaseId, {
        ...purchase,
        remainingBase: purchase.remainingBase - lineBase,
      });
    }
  }

  let transaction;
  try {
    transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierTransaction.create({
        data: {
          ...transactionData,
          date: new Date(date),
          // A payment has nothing to fall due; only a purchase carries a due date.
          dueDate: transactionData.type === "purchase" ? toDateOrNull(dueDate) : null,
          rate,
          baseAmount,
        },
      });

      // Allocation is reporting data, not accounting: it records which purchase
      // this payment settles. It deliberately posts nothing — the ledger already
      // has the purchase and the payment, and re-posting would double the money.
      if (allocationLines.length > 0) {
        await tx.supplierPaymentAllocation.createMany({
          data: allocationLines.map((line) => ({
            paymentId: created.id,
            purchaseId: line.purchaseId,
            amount: line.amount,
            currency: transactionData.currency,
            rate,
            baseAmount: line.base,
          })),
        });
      }

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
      // Which purchases this payment was said to settle — the allocation is a
      // user assertion, so it belongs in the audit trail alongside the amount.
      allocations: allocationLines.map((l) => ({
        purchaseId: l.purchaseId,
        amount: l.amount,
        baseAmount: l.base,
      })),
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
