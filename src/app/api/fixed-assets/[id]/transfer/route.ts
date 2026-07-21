/**
 * Pindah lokasi aset (issue #28). Records a move + updates the asset's location.
 * No journal — a move changes where an asset sits, not its value.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { assetTransferSchema } from "@/lib/validations/fixed-asset";
import { transferAsset } from "@/lib/fixed-assets";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const parsed = assetTransferSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const asset = await transferAsset({
      assetId: id,
      date: new Date(parsed.data.date),
      toLocation: parsed.data.toLocation,
      note: parsed.data.note,
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "fixed_asset.transfer",
      entity: "fixed_asset",
      entityId: id,
      details: { assetNo: asset.assetNo, toLocation: parsed.data.toLocation },
      request,
    });

    return NextResponse.json(asset);
  } catch (e) {
    if (e instanceof Error && /sudah dilepas|tidak ditemukan/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
