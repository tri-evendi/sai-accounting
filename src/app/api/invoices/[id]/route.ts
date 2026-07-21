import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema, invoiceSubtotal } from "@/lib/validations/invoice";
import { resolveInvoiceTax } from "@/lib/tax";
import { fxAmounts } from "@/lib/validations/fx";
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
  const result = await requireAuth(["bos", "core"]);
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

  const { items, date, dueDate, rate, currency, taxable, taxRate, taxAmount, ...invoiceData } =
    parsed.data;
  const invoiceId = parseInt(id);
  // Recomputed on every edit: changing an item, the taxable flag, the rate or the
  // PPN rate has to move DPP/PPN/base_amount with it, or the stored values drift
  // from the reposted journal.
  const tax = resolveInvoiceTax(invoiceSubtotal(items), { taxable, taxRate, taxAmount });
  const { rate: fxRate, baseAmount } = fxAmounts(currency, tax.total, rate);

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...invoiceData,
          currency,
          taxable: tax.taxable,
          taxRate: tax.taxRate,
          dpp: tax.dpp,
          taxAmount: tax.taxAmount,
          rate: fxRate,
          baseAmount,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          items: { create: items },
        },
        include: { items: true },
      });

      // Reverse the old journal and post a fresh one, so the ledger matches the
      // edited document without ever mutating a posted line.
      await repostForSource({ sourceType: "invoice", sourceId: invoiceId, tx });
      return updated;
    });

    return NextResponse.json(invoice);
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
