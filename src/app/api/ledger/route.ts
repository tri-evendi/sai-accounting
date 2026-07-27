import { NextResponse } from "next/server";
import { getAccountLedger } from "@/lib/ledger";
import { requireApiPermission } from "@/lib/auth-guard";
import { parseCostCenterFilter } from "@/lib/cost-centers";
import { getRequestI18n } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const result = await requireApiPermission("ledger.read");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const accountId = parseInt(searchParams.get("accountId") || "");
  if (!accountId) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.paramRequired", { name: "accountId" }) }, { status: 400 });
  }

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : undefined;

  // issue #91 — pilahan per pusat biaya, sama seperti halaman /ledger.
  // "" / tak dikirim = semua; "unassigned" = yang belum ditetapkan.
  const costCenter = parseCostCenterFilter(searchParams.get("costCenter"));

  const ledger = await getAccountLedger(accountId, from, to, undefined, costCenter);
  if (!ledger) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.accountNotFound") }, { status: 404 });
  }

  return NextResponse.json(ledger);
}
