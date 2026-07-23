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
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await getCompanySettings();
  if (!existing) {
    // No company row yet — the setup wizard must run first (it seeds the ledger).
    return NextResponse.json(
      { error: "Perusahaan belum disiapkan. Jalankan Setup & Saldo Awal terlebih dahulu." },
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
