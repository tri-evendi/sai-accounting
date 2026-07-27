import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { getPeriodSummary } from "@/lib/period-close";
import { periodQuerySchema } from "@/lib/validations/period";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/** Pre-close inspection for one month: GET /api/periods/summary?year=2026&month=3 */
export async function GET(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const parsed = periodQuerySchema.safeParse({
    year: searchParams.get("year"),
    month: searchParams.get("month"),
  });

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

  return NextResponse.json(await getPeriodSummary(parsed.data.year, parsed.data.month));
}
