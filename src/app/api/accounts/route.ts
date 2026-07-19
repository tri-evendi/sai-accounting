import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations/account";
import { normalBalanceFor } from "@/lib/accounting";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = accountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { code, name, type, currency, parentId, isActive } = parsed.data;

  try {
    const account = await prisma.account.create({
      data: {
        code,
        name,
        type,
        currency,
        parentId: parentId ?? null,
        normalBalance: normalBalanceFor(type),
        isActive: isActive ?? true,
      },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode perkiraan sudah dipakai" }, { status: 409 });
    }
    throw e;
  }
}
