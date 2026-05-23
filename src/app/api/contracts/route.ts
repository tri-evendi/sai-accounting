import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractSchema } from "@/lib/validations/contract";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const contracts = await prisma.contract.findMany({
    orderBy: { date: "desc" },
    include: { items: true, payments: true },
  });

  return NextResponse.json(contracts);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = contractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { items, date, ...contractData } = parsed.data;

  const contract = await prisma.contract.create({
    data: {
      ...contractData,
      date: new Date(date),
      items: { create: items },
    },
    include: { items: true },
  });

  return NextResponse.json(contract, { status: 201 });
}
