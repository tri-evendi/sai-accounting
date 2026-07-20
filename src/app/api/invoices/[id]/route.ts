import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema, invoiceTotal } from "@/lib/validations/invoice";
import { fxAmounts } from "@/lib/validations/fx";
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

  const { items, date, rate, currency, taxAmount, ...invoiceData } = parsed.data;
  const invoiceId = parseInt(id);
  // Recomputed on every edit: changing an item, the tax or the rate has to move
  // base_amount with it, or the stored IDR value drifts from the reposted journal.
  const { rate: fxRate, baseAmount } = fxAmounts(
    currency,
    invoiceTotal(items, taxAmount),
    rate
  );

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...invoiceData,
          currency,
          taxAmount,
          rate: fxRate,
          baseAmount,
          date: new Date(date),
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
