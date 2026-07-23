/**
 * Delete one budget row (issue #29). A plan carries no journal, so deleting it
 * reverses nothing — it simply drops the plan. bos-only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("budget.manage");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Anggaran tidak ditemukan." }, { status: 404 });
  }

  await prisma.budget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
