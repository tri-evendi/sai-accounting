/**
 * Company tax identity (issue #17) — the editable seller NPWP surface.
 *
 * The setup wizard (issue #20) captures company identity ONCE and is then
 * read-only. But the seller NPWP any e-Faktur output needs may be filled in
 * later (an existing SAI setup predates it), so this small route lets a Manager
 * edit just the tax-identity fields on the singleton CompanySetting without
 * re-running the wizard. It touches NO ledger data and posts no journal.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { companyTaxIdentitySchema } from "@/lib/validations/setup";
import { getCompanySettings } from "@/lib/opening-balance";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function GET() {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;

  const settings = await getCompanySettings();
  return NextResponse.json({
    npwp: settings?.npwp ?? null,
    taxName: settings?.taxName ?? null,
    taxAddress: settings?.taxAddress ?? null,
    name: settings?.name ?? null,
    address: settings?.address ?? null,
  });
}

export async function PATCH(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = companyTaxIdentitySchema.safeParse(body);
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

  const existing = await getCompanySettings();
  if (!existing) {
    // No company row yet — the setup wizard must run first (it seeds the ledger).
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.companyNotSetUp") },
      { status: 409 }
    );
  }

  const updated = await prisma.companySetting.update({
    where: { id: existing.id },
    data: {
      npwp: parsed.data.npwp?.trim() || null,
      taxName: parsed.data.taxName?.trim() || null,
      taxAddress: parsed.data.taxAddress?.trim() || null,
    },
  });

  return NextResponse.json({
    npwp: updated.npwp,
    taxName: updated.taxName,
    taxAddress: updated.taxAddress,
  });
}
