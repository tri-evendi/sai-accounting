/**
 * One fixed asset — its derived book value, schedule state, and history (issue #28).
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { getFixedAsset } from "@/lib/fixed-assets";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("fixed_asset.read");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const row = await getFixedAsset(id);
  if (!row) return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });
  return NextResponse.json(row);
}
