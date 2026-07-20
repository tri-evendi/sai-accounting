import { NextResponse } from "next/server";
import { getAccountLedger } from "@/lib/ledger";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const accountId = parseInt(searchParams.get("accountId") || "");
  if (!accountId) {
    return NextResponse.json({ error: "Parameter accountId wajib" }, { status: 400 });
  }

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : undefined;

  const ledger = await getAccountLedger(accountId, from, to);
  if (!ledger) {
    return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(ledger);
}
