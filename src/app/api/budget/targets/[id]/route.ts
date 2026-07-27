/**
 * Delete one sales target (issue #29). A plan carries no journal — deleting it
 * drops the plan and reverses nothing. bos-only.
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

  const existing = await prisma.salesTarget.findUnique({ where: { id } });
  if (!existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.salesTargetNotFound") }, { status: 404 });
  }

  await prisma.salesTarget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
