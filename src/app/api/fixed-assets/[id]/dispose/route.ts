/**
 * Pelepasan/penjualan aset (issue #28).
 *
 * Flips the asset to `disposed` and posts the removal + laba/rugi pelepasan
 * journal through the one posting path, so the period lock and IDR balance
 * invariant both apply. Rolls back atomically if the journal cannot be built.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { assetDisposalSchema } from "@/lib/validations/fixed-asset";
import { disposeAsset } from "@/lib/fixed-assets";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireApiPermission("fixed_asset.write");
  if (!result.authorized) return result.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidId") }, { status: 400 });
  }

  const parsed = assetDisposalSchema.safeParse(await request.json());
  if (!parsed.success) {
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
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
