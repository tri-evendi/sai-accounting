/**
 * SAMBUNGAN PJAP MILIK PT — simpan (docs/EFAKTUR.md).
 *
 * Rahasia disegel `SETTINGS_ENCRYPTION_KEY` sebelum menyentuh basis data dan
 * TIDAK PERNAH dikirim balik: jawabannya hanya "tersimpan / belum". Kunci
 * enkripsi yang hilang MENOLAK penyimpanan (gagal-tertutup), bukan menyimpan
 * mentah.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import { efakturConnectionUpdate, efakturConnectionView } from "@/lib/efaktur-connection";
import { getCompanySettings } from "@/lib/opening-balance";
import { EncryptionKeyError } from "@sai/core/settings-crypto";
import { EFAKTUR_PROVIDERS } from "@sai/core/efaktur-submission";
import { getRequestI18n } from "@sai/platform/i18n/server";

const bodySchema = z.object({
  provider: z.enum(EFAKTUR_PROVIDERS).nullable(),
  clientId: z.string().trim().max(120).nullable().optional(),
  /** `undefined` = biarkan rahasia tersimpan; `""` = kosongkan. */
  secret: z.string().max(2000).optional(),
  isProduction: z.boolean().optional(),
});

export async function PUT(request: Request, ctx: TenantApiContext) {
  const authz = await requireApiPermission("tax.manage", ctx.params);
  if (!authz.authorized) return authz.response;
  const { t } = await getRequestI18n();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }
  const existing = await getCompanySettings();
  if (!existing) {
    return NextResponse.json({ error: t("errors.companyNotSetUp") }, { status: 409 });
  }

  let data;
  try {
    data = efakturConnectionUpdate(parsed.data);
  } catch (error) {
    if (error instanceof EncryptionKeyError) {
      return NextResponse.json({ error: t("tax.pjap.encryptionKeyMissing") }, { status: 503 });
    }
    throw error;
  }
  const updated = await prisma.companySetting.update({ where: { id: existing.id }, data });
  return NextResponse.json(efakturConnectionView(updated));
}
