/**
 * One fixed asset — its derived book value, schedule state, and history (issue #28).
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { getFixedAsset } from "@/lib/fixed-assets";
import { getRequestI18n } from "@/lib/i18n/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("fixed_asset.read");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const row = await getFixedAsset(id);
  if (!row) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.assetNotFound") }, { status: 404 });
  }
  return NextResponse.json(row);
}
