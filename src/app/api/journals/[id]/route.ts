import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";

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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(journal);
}
