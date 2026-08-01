/**
 * Ekspor data mandiri (issue #142) — GET satu arsip ZIP berisi CSV seluruh
 * tabel di SETIAP PT milik tenant (mesinnya `lib/tenant-export.ts`).
 *
 * Penjaganya `tenant.export` (owner) dan SENGAJA tidak memeriksa status
 * tenant: tenant `suspended` tetap wajib menyimpan pembukuannya (UU KUP) dan
 * karena itu tetap berhak mengunduhnya — menutup pintu ini karena tagihan
 * tertunggak berarti menghalangi kewajiban hukum pelanggan. Setiap unduhan
 * tercatat di jejak audit tenant (siapa, kapan, berapa baris).
 */
import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { buildTenantExport } from "@/lib/tenant-export";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { getRequestI18n } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const result = await requireTenantApiPermission("tenant.export");
  if (!result.authorized) return result.response;

  let exported;
  try {
    exported = await buildTenantExport(result.tenant.tenantId);
  } catch (error) {
    console.error("[tenant-export] gagal membangun arsip:", error);
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("tenantSettings.exportFailed") }, { status: 500 });
  }

  await writeTenantAuditLog({
    tenantId: result.tenant.tenantId,
    tenantSlug: result.tenant.tenantSlug,
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    tenantRole: result.tenant.role,
    action: "tenant.export",
    details: {
      companies: exported.companies,
      tables: exported.tables,
      rows: exported.rows,
      filename: exported.filename,
    },
    request,
  });

  return new Response(new Uint8Array(exported.buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exported.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
