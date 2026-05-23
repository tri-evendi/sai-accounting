import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractSchema } from "@/lib/validations/contract";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id: parseInt(id) },
    include: { items: true, payments: true, documents: true },
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

  const { items, date, ...contractData } = parsed.data;
  const contractId = parseInt(id);

  await prisma.contractItem.deleteMany({ where: { contractId } });

  const contract = await prisma.contract.update({
    where: { id: contractId },
    data: {
      ...contractData,
      date: new Date(date),
      items: { create: items },
    },
    include: { items: true },
  });

  return NextResponse.json(contract);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  await prisma.contract.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ success: true });
}
