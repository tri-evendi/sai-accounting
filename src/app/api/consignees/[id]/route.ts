import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consigneeSchema } from "@/lib/validations/finance";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const consignee = await prisma.consignee.findUnique({
    where: { id: parseInt(id) },
  });

  if (!consignee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(consignee);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = consigneeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const consignee = await prisma.consignee.update({
    where: { id: parseInt(id) },
    data: parsed.data,
  });

  return NextResponse.json(consignee);
}

/**
 * Master data is never hard-deleted once referenced (docs/DATABASE.md §1). A
 * consignee still linked to any contract is DEACTIVATED (`is_active = false`) so
 * it drops out of the pickers but every contract keeps its link and history.
 * Only an unused consignee is truly removed.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;
  const consigneeId = parseInt(id);

  const references = await prisma.contract.count({ where: { consigneeId } });

  if (references > 0) {
    const consignee = await prisma.consignee.update({
      where: { id: consigneeId },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, deactivated: true, consignee });
  }

  await prisma.consignee.delete({ where: { id: consigneeId } });
  return NextResponse.json({ success: true, deactivated: false });
}
