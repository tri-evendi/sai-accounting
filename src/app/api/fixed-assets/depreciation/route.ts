/**
 * Penyusutan periodik — run depreciation for one month (issue #28).
 *
 * Posts D: Beban Penyusutan / K: Akumulasi Penyusutan for every active asset that
 * has not yet been depreciated that period. Idempotent: re-running a period that
 * is already posted adds nothing (the (asset, year, month) unique row + the
 * live-journal guard both prevent it). A CLOSED period is refused via the period
 * lock, surfaced here as a 422 with the not-saved notice.
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { depreciationRunSchema } from "@/lib/validations/fixed-asset";
import { runDepreciation } from "@/lib/fixed-assets";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(request: Request) {
  const result = await requireApiPermission("fixed_asset.write");
  if (!result.authorized) return result.response;

  const parsed = depreciationRunSchema.safeParse(await request.json());
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
    const summary = await runDepreciation(parsed.data.year, parsed.data.month);

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "fixed_asset.depreciate",
      entity: "fixed_asset",
      details: {
        year: summary.year,
        month: summary.month,
        postedCount: summary.postedCount,
        totalAmount: summary.totalAmount,
      },
      request,
    });

    return NextResponse.json(summary);
  } catch (e) {
    return handlePostingError(e);
  }
}
