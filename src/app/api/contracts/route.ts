import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractSchema } from "@/lib/validations/contract";
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

  // `rate` has no column on contracts — it is passed to the posting engine so a
  // foreign-currency contract books a correct IDR value (see contract schema).
  const { items, date, dueDate, rate, ...contractData } = parsed.data;

  try {
    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          ...contractData,
          date: new Date(date),
          dueDate: toDateOrNull(dueDate),
          items: { create: items },
        },
        include: { items: true },
      });

      await postForSource({ sourceType: "contract", sourceId: created.id, tx, rate });
      return created;
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (e) {
    return handlePostingError(e);
  }
}
