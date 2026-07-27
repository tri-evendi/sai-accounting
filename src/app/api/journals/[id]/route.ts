import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("journal.read");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const journal = await prisma.journal.findUnique({
    where: { id: parseInt(id) },
    include: {
      lines: { include: { account: true }, orderBy: { id: "asc" } },
      reversalOf: true,
      reversals: true,
    },
  });

  if (!journal) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.journalNotFound") }, { status: 404 });
  }

  return NextResponse.json(journal);
}
