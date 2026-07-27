/**
 * Pindah lokasi aset (issue #28). Records a move + updates the asset's location.
 * No journal — a move changes where an asset sits, not its value.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { assetTransferSchema } from "@/lib/validations/fixed-asset";
import { transferAsset } from "@/lib/fixed-assets";
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

  const parsed = assetTransferSchema.safeParse(await request.json());
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
