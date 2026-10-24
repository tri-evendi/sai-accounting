/**
 * Keadaan ekspor data mandiri TERBARU milik tenant pemanggil — yang dibaca
 * layar Data & Privasi untuk menampilkan "sedang disiapkan · n%" lalu tautan
 * unduhnya (`runner: go`, `src/lib/tenant-export-job.ts`).
 *
 * Tidak menerima id: yang ditanya selalu "punya saya yang terakhir", dan
 * tenant-nya datang dari penjaga — jadi tidak ada baris milik tenant lain yang
 * bisa disebut. Jawabannya bentuk LAYAR (`TenantExportJobView`): tanpa
 * `payload`, tanpa `last_error`, tanpa `result_ref`.
 */
import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { latestTenantExport, tenantExportRunner } from "@/lib/tenant-export-job";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireTenantApiPermission("tenant.export");
  if (!result.authorized) return result.response;

  const job = await latestTenantExport(result.tenant.tenantId);
  return NextResponse.json(
    { runner: tenantExportRunner(), job },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
