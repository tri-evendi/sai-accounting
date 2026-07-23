import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";

export async function GET() {
  const result = await requireApiPermission("supplier.read");
  if (!result.authorized) return result.response;

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { transactions: { orderBy: { date: "desc" }, take: 5 } },
  });

  return NextResponse.json(suppliers);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("supplier.write");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supplier = await prisma.supplier.create({ data: parsed.data });
  return NextResponse.json(supplier, { status: 201 });
}
