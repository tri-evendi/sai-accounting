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
import { Readable } from "node:stream";

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
