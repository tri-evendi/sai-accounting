import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractFx, contractSchema } from "@/lib/validations/contract";
import { toDateOrNull } from "@/lib/validations/common";
import { requireAuth } from "@/lib/auth-guard";
import { postForSource } from "@/lib/posting";
import { handlePostingError } from "@/lib/api-errors";

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

  const { items, date, dueDate, rate, ...contractData } = parsed.data;
  const fx = contractFx(contractData.currency, items, rate);

  try {
    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          ...contractData,
          ...fx,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          items: { create: items },
        },
        include: { items: true },
      });

      // No `rate` in the context: the contract carries its own now (issue #36).
      await postForSource({ sourceType: "contract", sourceId: created.id, tx });
      return created;
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (e) {
    return handlePostingError(e);
  }
}
