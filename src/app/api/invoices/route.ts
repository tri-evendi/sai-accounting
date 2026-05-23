import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validations/invoice";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const invoices = await prisma.invoice.findMany({
    orderBy: { date: "desc" },
    include: { items: true, payments: true },
  });

  return NextResponse.json(invoices);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { items, date, ...invoiceData } = parsed.data;

  const invoice = await prisma.invoice.create({
    data: {
      ...invoiceData,
      date: new Date(date),
      items: { create: items },
    },
    include: { items: true },
  });

  return NextResponse.json(invoice, { status: 201 });
}
