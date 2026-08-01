/**
 * Profil PENAGIHAN tenant (issue #141) — NPWP, nama & alamat sesuai NPWP:
 * identitas lawan transaksi untuk Faktur Pajak KAMI atas tagihan langganan.
 * Disimpan di `sai_platform` (`tenant_billing_profiles`) — data penagihan,
 * bukan jalur panas. Penjaga tenant `tenant.billing` (owner).
 *
 * ⚠ Kewajiban PPN/e-Faktur atas langganan harus dikonfirmasi penasihat pajak
 * (docs/MULTI-TENANT.md §10) — form ini MEKANISME pengumpulan datanya.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { platformDb } from "@/lib/platform-db";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

const profileSchema = z.object({
  /** NPWP 15/16 digit — dibiarkan longgar (format berubah di era Coretax);
   *  yang menegakkan kelengkapannya mesin e-Faktur, bukan regex di sini. */
  npwp: z.string().trim().max(25).optional(),
  name: z.string().trim().max(150).optional(),
  address: z.string().trim().max(255).optional(),
});

export async function PUT(request: Request) {
  const result = await requireTenantApiPermission("tenant.billing");
  if (!result.authorized) return result.response;
  const { t, dictionary } = await getRequestI18n();

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const tenantId = result.tenant.tenantId;
  const data = {
    npwp: parsed.data.npwp || null,
    name: parsed.data.name || null,
    address: parsed.data.address || null,
  };
  const profile = await platformDb.tenantBillingProfile.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });

  return NextResponse.json({
    ok: true,
    profile: { npwp: profile.npwp, name: profile.name, address: profile.address },
  });
}
