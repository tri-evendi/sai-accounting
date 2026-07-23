import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validations/finance";
import { requireApiPermission } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("customer.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id: parseInt(id) },
  });

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(customer);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("customer.write");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = customerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.update({
    where: { id: parseInt(id) },
    data: parsed.data,
  });

  return NextResponse.json(customer);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("customer.delete");
  if (!result.authorized) return result.response;

  const { id } = await params;
  await prisma.customer.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ success: true });
}
