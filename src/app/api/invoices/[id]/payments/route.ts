import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicePaymentSchema } from "@/lib/validations/invoice";
import { fxAmounts } from "@/lib/validations/fx";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
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

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.invoicePayment.create({
        data: {
          ...paymentData,
          invoiceId: iId,
          date: new Date(date),
          rate,
          baseAmount,
        },
      });

      await postForSource({ sourceType: "invoice_payment", sourceId: created.id, tx });
      return created;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    return handlePostingError(e);
  }
}
