import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consigneeSchema } from "@/lib/validations/finance";
import { requireAuth } from "@/lib/auth-guard";

/**
 * List consignees. `?active=1` returns only active rows — used by the Contract
 * form's searchable select so deactivated masters never appear as choices. The
 * master list page queries Prisma directly and shows inactive rows too.
 */
export async function GET(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";

  const consignees = await prisma.consignee.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(consignees);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = consigneeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const consignee = await prisma.consignee.create({ data: parsed.data });
  return NextResponse.json(consignee, { status: 201 });
}
