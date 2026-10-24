/**
 * Ekspor data mandiri (issue #142) — satu arsip ZIP berisi CSV seluruh tabel
 * di SETIAP PT milik tenant.
 *
 * DUA pintu, dan sakelar `runner:` kind `tenant.data_export` di
 * `contract/kinds.yaml` yang memutuskan mana yang terbuka
 * (`src/lib/tenant-export-job.ts`):
 *
 *   • `GET`  (`runner: node`) — arsip di-stream SINKRON dari
 *     `lib/tenant-export.ts`, seperti sejak #142.
 *   • `POST` (`runner: go`)   — menerbitkan pekerjaan jalur `bulk`; pelari Go
 *     menulis arsipnya, layar menunggu di `/api/tenant/export/jobs` lalu
 *     mengunduh dari `/api/tenant/export/jobs/<id>/result`.
 *
 * Pintu yang tertutup dijawab 409 dengan `code` — bukan jatuh ke pintu lain:
 * jalan mundur diam-diam adalah dua implementasi yang hidup tanpa pembanding.
 *
 * Penjaganya `tenant.export` (owner) dan SENGAJA tidak memeriksa status
 * tenant: tenant `suspended` tetap wajib menyimpan pembukuannya (UU KUP) dan
 * karena itu tetap berhak mengunduhnya — menutup pintu ini karena tagihan
 * tertunggak berarti menghalangi kewajiban hukum pelanggan. Setiap permintaan
 * tercatat di jejak audit tenant (siapa, kapan) — oleh rute ini, sebab pelari
 * Go tidak menulis `tenant_audit_logs`.
 */
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { buildTenantExport } from "@/lib/tenant-export";
import { requestTenantExport, tenantExportRunner } from "@/lib/tenant-export-job";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";
import { getRequestI18n } from "@sai/platform/i18n/server";

export async function GET(request: Request) {
  const result = await requireTenantApiPermission("tenant.export");
  if (!result.authorized) return result.response;

  if (tenantExportRunner() !== "node") {
    /* Pelaksananya Go: arsip dibuat pekerjaan jalur `bulk`. Tautan lama
       (tab yang dibuka sebelum rilis) menerima jawaban yang bisa dibaca,
       bukan arsip dari mesin yang sakelarnya sudah dipindah. */
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("tenantSettings.exportAsyncOnly"), code: "export_async" },
      { status: 409 }
    );
  }

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

  /*
   * DI-STREAM, bukan disusun utuh di memori (issue #367): sejak berkas dokumen
   * ikut, arsip sebuah tenant bisa berukuran giga — dan mengumpulkannya di
   * memori akan menjadikan tombol "Unduh Data Saya" cara paling mudah
   * menjatuhkan mesinnya. Jejak audit sudah ditulis DI ATAS, sebab sesudah byte
   * pertama terkirim tidak ada lagi cara menjawab galat dengan status HTTP.
   *
   * `Readable.toWeb` memulangkan `ReadableStream` versi `node:stream/web`;
   * `Response` menuntut yang versi DOM. Keduanya sama di runtime — perbedaannya
   * hanya deklarasi tipe, jadi ini satu-satunya tempat cast itu dibenarkan.
   */
  const body = Readable.toWeb(
    Readable.from(exported.openStream())
  ) as unknown as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exported.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Minta ekspor sebagai PEKERJAAN (`runner: go`). 202 + `jobId`; ekspor yang
 * masih berjalan untuk tenant ini DIPAKAI ULANG, bukan digandakan.
 */
export async function POST(request: Request) {
  const result = await requireTenantApiPermission("tenant.export");
  if (!result.authorized) return result.response;

  if (tenantExportRunner() !== "go") {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("tenantSettings.exportSyncOnly"), code: "export_sync" },
      { status: 409 }
    );
  }

  const job = await requestTenantExport(result.tenant.tenantId);
  if (!job) {
    /* Tak terjangkau tanpa `dedupeKey` — tapi bila terjadi, 503 yang jujur. */
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("tenantSettings.exportFailed") }, { status: 503 });
  }

  /* Jejak ditulis SAAT MENERBITKAN, oleh Node: Go tidak menulis
     `tenant_audit_logs`. Permintaan yang memakai ulang pekerjaan berjalan
     tetap dicatat — "siapa menekan tombol" adalah pertanyaan jejak ini. */
  await writeTenantAuditLog({
    tenantId: result.tenant.tenantId,
    tenantSlug: result.tenant.tenantSlug,
    userId: result.session.user.id,
    username: result.session.user.name ?? result.session.user.email ?? result.session.user.id,
    tenantRole: result.tenant.role,
    action: "tenant.export",
    details: { mode: "job", jobId: job.jobId, reused: job.reused },
    request,
  });

  return NextResponse.json({ jobId: job.jobId, reused: job.reused }, { status: 202 });
}
