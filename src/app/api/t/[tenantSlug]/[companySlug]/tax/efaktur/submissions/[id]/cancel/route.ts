/**
 * BATALKAN FAKTUR PAJAK di DJP lewat PJAP (docs/EFAKTUR.md).
 *
 * Hanya kiriman `approved`. Status menjadi `cancel_requested` dan
 * `integration.efaktur_cancel` terbit; keputusan PJAP kembali lewat
 * `efaktur.record` (berhasil → `canceled`, ditolak → tetap `approved` dengan
 * pesan).
 */
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { requestEfakturCancel } from "@/lib/efaktur-submissions";
import { getRequestI18n } from "@sai/platform/i18n/server";
import type { TenantScopedParams } from "@sai/core/tenant-routes";

export async function POST(
  _request: Request,
  context: { params: Promise<TenantScopedParams & { id: string }> }
) {
  const params = await context.params;
  const authz = await requireApiPermission("tax.submit", params);
  if (!authz.authorized) return authz.response;
  const { t } = await getRequestI18n();

  const id = /^\d+$/.test(params.id) ? Number(params.id) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: t("errors.notFound") }, { status: 404 });
  }
  const ok = await requestEfakturCancel(authz.companyId, id);
  if (!ok) {
    return NextResponse.json({ error: t("tax.pjap.cannotCancel") }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
