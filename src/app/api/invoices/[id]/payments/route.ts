import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicePaymentSchema } from "@/lib/validations/invoice";
import { requireAuth } from "@/lib/auth-guard";

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

  const { date, invoiceId: iId, ...paymentData } = parsed.data;
  const payment = await prisma.invoicePayment.create({
    data: {
      ...paymentData,
      invoiceId: iId,
      date: new Date(date),
    },
  });

  return NextResponse.json(payment, { status: 201 });
}
