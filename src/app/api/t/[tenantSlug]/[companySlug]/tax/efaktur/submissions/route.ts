/**
 * KIRIM FAKTUR KE DJP LEWAT PJAP — antrekan (docs/EFAKTUR.md).
 *
 * Tidak mengirim apa pun sendiri: membekukan XML per faktur dan menerbitkan
 * `integration.efaktur_submit`. Jawabannya ringkasan: mana yang antre, mana
 * yang dilewati dan kenapa.
 *
 * Body: `{ invoiceIds: number[] }` (maks. 200 per permintaan).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import { getEfakturConnection, queueEfakturSubmissions } from "@/lib/efaktur-submissions";
import { getRequestI18n } from "@sai/platform/i18n/server";

const bodySchema = z.object({
  invoiceIds: z.array(z.number().int().positive()).min(1).max(200),
});

export async function POST(request: Request, ctx: TenantApiContext) {
  const authz = await requireApiPermission("tax.submit", ctx.params);
  if (!authz.authorized) return authz.response;
  const { t } = await getRequestI18n();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  const connection = await getEfakturConnection();
  if (!connection.provider) {
    return NextResponse.json({ error: t("tax.pjap.notConfigured") }, { status: 409 });
  }

  const userId = Number(authz.session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  const result = await queueEfakturSubmissions({
    companyId: authz.companyId,
    invoiceIds: parsed.data.invoiceIds,
    requestedByUserId: userId,
    provider: connection.provider,
  });
  return NextResponse.json(result);
}
