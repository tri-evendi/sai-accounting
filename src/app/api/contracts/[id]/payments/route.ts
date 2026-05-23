import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractPaymentSchema } from "@/lib/validations/contract";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const payments = await prisma.contractPayment.findMany({
    where: { contractId: parseInt(id) },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(payments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contractId = parseInt(id);

  // Verify contract exists
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = contractPaymentSchema.safeParse({ ...body, contractId });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, contractId: cId, ...paymentData } = parsed.data;
  const payment = await prisma.contractPayment.create({
    data: {
      ...paymentData,
      contractId: cId,
      date: new Date(date),
    },
  });

  return NextResponse.json(payment, { status: 201 });
}
