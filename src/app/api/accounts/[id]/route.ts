import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations/account";
import { normalBalanceFor } from "@/lib/accounting";
import { requireApiPermission } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id: parseInt(id) },
    include: { parent: true, children: { orderBy: { code: "asc" } } },
  });

  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(account);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const accountId = parseInt(id);
  const body = await request.json();
  const parsed = accountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { code, name, type, currency, parentId, isActive } = parsed.data;

  // An account cannot be its own parent.
  if (parentId === accountId) {
    return NextResponse.json({ error: "Akun tidak boleh menjadi induk dirinya sendiri" }, { status: 400 });
  }

  try {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        code,
        name,
        type,
        currency,
        parentId: parentId ?? null,
        normalBalance: normalBalanceFor(type),
        ...(isActive === undefined ? {} : { isActive }),
      },
    });
    return NextResponse.json(account);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode perkiraan sudah dipakai" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("account.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const accountId = parseInt(id);

  // Never orphan children or break references: deactivate instead of hard-deleting when in use.
  const childCount = await prisma.account.count({ where: { parentId: accountId } });
  if (childCount > 0) {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: { isActive: false },
    });
    return NextResponse.json({ deactivated: true, reason: "has_children", account });
  }

  try {
    await prisma.account.delete({ where: { id: accountId } });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    // FK constraint (referenced by future journal lines, etc.) -> deactivate instead.
    if ((e as { code?: string }).code === "P2003") {
      const account = await prisma.account.update({
        where: { id: accountId },
        data: { isActive: false },
      });
      return NextResponse.json({ deactivated: true, reason: "referenced", account });
    }
    throw e;
  }
}
