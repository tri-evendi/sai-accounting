/**
 * Delete one sales target (issue #29). A plan carries no journal — deleting it
 * drops the plan and reverses nothing. bos-only.
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

  const existing = await prisma.salesTarget.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Target tidak ditemukan." }, { status: 404 });
  }

  await prisma.salesTarget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
