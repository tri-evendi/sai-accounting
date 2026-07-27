/**
 * Delete one budget row (issue #29). A plan carries no journal, so deleting it
 * reverses nothing — it simply drops the plan. bos-only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("budget.manage");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.budgetNotFound") }, { status: 404 });
  }

  await prisma.budget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
