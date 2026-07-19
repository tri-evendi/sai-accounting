import { NextResponse } from "next/server";
import { reverseJournal } from "@/lib/ledger";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { id } = await params;

  try {
    const reversal = await reverseJournal(parseInt(id));
    return NextResponse.json(reversal, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membalik jurnal" },
      { status: 400 }
    );
  }
}
