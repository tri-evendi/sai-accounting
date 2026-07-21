/**
 * Pelepasan/penjualan aset (issue #28).
 *
 * Flips the asset to `disposed` and posts the removal + laba/rugi pelepasan
 * journal through the one posting path, so the period lock and IDR balance
 * invariant both apply. Rolls back atomically if the journal cannot be built.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { assetDisposalSchema } from "@/lib/validations/fixed-asset";
import { disposeAsset } from "@/lib/fixed-assets";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id tidak valid." }, { status: 400 });
  }

  const parsed = assetDisposalSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const asset = await disposeAsset({
      assetId: id,
      date: new Date(parsed.data.date),
      proceeds: parsed.data.proceeds,
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "fixed_asset.dispose",
      entity: "fixed_asset",
      entityId: id,
      details: {
        assetNo: asset.assetNo,
        proceeds: asset.disposalProceeds,
        gainLoss: asset.disposalGainLoss,
      },
      request,
    });

    return NextResponse.json(asset);
  } catch (e) {
    // Domain errors (already disposed / not found) surface as a 400; posting
    // errors (closed period, missing mapping) as a 422 via handlePostingError.
    if (e instanceof Error && /sudah dilepas|tidak ditemukan/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handlePostingError(e);
  }
}
