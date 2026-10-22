/**
 * Status satu penyediaan PT — yang DITANYAKAN layar `/companies/new` tiap
 * beberapa detik sesudah `POST /api/companies` menjawab `202 { jobId }`.
 *
 * Penjaganya sama dengan penerbitnya (`company.create`, matriks TENANT), dan
 * pekerjaan milik tenant lain dijawab 404 — sama persis dengan pekerjaan yang
 * tidak ada, supaya id pekerjaan tidak bisa dipakai menyisir tenant lain.
 *
 * Jawabannya TIDAK PERNAH memuat `payload` maupun `last_error`. Kegagalan
 * sampai sebagai kalimat kamus berbahasa pengguna (`provisionErrorMessage`,
 * dirakit di `readProvisionStatus`); teks driver — SQLSTATE, nama peran
 * basis data, pernyataan SQL — tetap di log `svc-worker` dan konsol operator.
 */
import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { readProvisionStatus } from "@/lib/company-provisioning-queue";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireTenantApiPermission("company.create");
  if (!result.authorized) return result.response;

  const { t } = await getRequestI18n();
  const id = Number.parseInt((await params).id, 10);
  const status =
    Number.isInteger(id) && id > 0 ? await readProvisionStatus(id, result.tenant.tenantId) : null;
  if (!status) {
    return NextResponse.json({ error: t("errors.notFound") }, { status: 404 });
  }

  const headers = { "Cache-Control": "no-store" };
  if (status.state === "failed") {
    return NextResponse.json(
      { state: "failed", phase: status.phase, message: t(status.error.key, status.error.values) },
      { headers }
    );
  }
  return NextResponse.json(status, { headers });
}
