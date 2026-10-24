/**
 * BERKAS hasil ekspor data mandiri (`tenant.data_export`, jalur `bulk`) —
 * pintu hasil TINGKAT TENANT.
 *
 * Kenapa bukan rute hasil per-PT (`/api/t/<tenant>/<pt>/jobs/…/result`):
 * barisnya tidak punya PT (`company_id` NULL) — arsipnya memuat SEMUA PT
 * tenant — jadi pintu itu menolaknya pada perbandingan perusahaan, dan
 * `JOB_RESULT_PERMISSION` menyatakannya `null` di sana. Tiga aturan rancangan
 * §4 tetap berlaku di sini, satu per satu:
 *
 *   1. penyimpanan PRIVAT — `data/hasil/` di luar `public/`;
 *   2. unduhan lewat RUTE INI, di-stream; tidak pernah 302 ke penyimpanan;
 *   3. izin diperiksa SAAT MENGUNDUH — `tenant.export` (owner) terhadap
 *      keanggotaan HARI INI, bukan saat pekerjaan lahir.
 *
 * Urutan pemeriksaan sama dengan rute per-PT: gerbang izin LEBIH DULU (penanya
 * anonim selalu 401, apa pun id-nya), lalu jenis, lalu TENANT dibandingkan
 * EKSPLISIT terhadap penjaga — `jobs` hidup di basis data kendali, jadi tidak
 * ada isolasi #104 yang menolong. Milik tenant lain → 404, bukan 403.
 */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { TENANT_EXPORT_KIND } from "@/lib/tenant-export-job";
import { resultFilename } from "@sai/core/job-result";
import { jobForDownload } from "@sai/platform/job-queue";
import { resolveResultPath, resultSize } from "@sai/platform/job-result-store";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import { getRequestI18n } from "@sai/platform/i18n/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tidakAda = () => new Response(null, { status: 404 });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: raw } = await context.params;
  if (!/^\d+$/.test(raw)) return tidakAda();
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) return tidakAda();

  /* ── Gerbang — SEBELUM barisnya dibaca ─────────────────────────────── */
  const authz = await requireTenantApiPermission("tenant.export");
  if (!authz.authorized) return authz.response;

  const job = await jobForDownload(id);
  if (!job) return tidakAda();
  if (job.kind !== TENANT_EXPORT_KIND) return tidakAda();
  /* Tenant dibandingkan di SINI; `jobForDownload` sengaja tidak menyaring. */
  if (job.tenantId === null || job.tenantId !== authz.tenant.tenantId) return tidakAda();

  if (job.status !== "done" || job.resultRef === null) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("tenantSettings.exportNotReady"),
        code: "job_not_done",
        status: job.status,
      },
      { status: 409 }
    );
  }

  const absolute = resolveResultPath(job.resultRef);
  if (absolute === null) return tidakAda();
  const size = await resultSize(job.resultRef);
  /* Baris ada, berkasnya tidak (retensi, pemulihan tanpa volume) — 404 jujur. */
  if (size === null) return tidakAda();

  const filename = resultFilename(job.resultRef);

  await writeTenantAuditLog({
    tenantId: authz.tenant.tenantId,
    tenantSlug: authz.tenant.tenantSlug,
    userId: authz.session.user.id,
    username: authz.session.user.name ?? authz.session.user.email ?? authz.session.user.id,
    tenantRole: authz.tenant.role,
    action: "tenant.export.download",
    details: { jobId: job.id, filename, bytes: size },
    request,
  });

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>;
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      /* Isinya seluruh buku tenant: jangan pernah disimpan proxy bersama. */
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
