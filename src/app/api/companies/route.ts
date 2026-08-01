/**
 * Membuat perusahaan baru — dengan KEMAJUAN yang dialirkan (issue #104).
 *
 * ══ KENAPA RESPONS STREAMING, BUKAN "POST LALU TUNGGU" ═════════════════════
 * Pekerjaannya puluhan detik: membuat basis data, menerapkan 40-an migration,
 * lalu mendaftarkannya. Satu POST yang menggantung selama itu memberi pengguna
 * layar diam yang tidak bisa dibedakan dari aplikasi yang macet — dan yang
 * paling mungkin ia lakukan berikutnya adalah menekan tombolnya lagi.
 *
 * Karena itu setiap langkah dikirim begitu ia terjadi, sebagai baris JSON
 * (NDJSON). Bukan SSE: yang dibutuhkan hanya satu arah tanpa penyambungan
 * ulang otomatis, dan `fetch` + `ReadableStream` membacanya tanpa pustaka apa
 * pun. Galat pun dikirim sebagai baris, bukan sebagai status HTTP — pada saat
 * kegagalan terjadi, status 200 sudah terlanjur terkirim bersama byte pertama.
 *
 * ══ PENJAGANYA TINGKAT TENANT (issue #135) ═════════════════════════════════
 * `company.create` pindah ke matriks tenant: membuat PT adalah kewenangan
 * pelanggan (owner/admin tenant), bukan peran di salah satu PT — dan pemilik
 * tenant TANPA satu pun perusahaan justru pemakai terpenting route ini.
 * `requireTenantApiPermission` karena itu TIDAK menuntut konteks perusahaan,
 * dan tenant pemilik perusahaan baru diambil dari keanggotaan PEMBUATNYA.
 *
 * ══ KENAPA TANPA PEKERJA LATAR ═════════════════════════════════════════════
 * Lihat catatan panjang di `lib/company-provisioning.ts`: prosesnya server Node
 * yang hidup terus (tidak ada batas waktu yang memutus), pekerjaannya puluhan
 * detik, dan urutannya membuat kegagalan di tengah tidak meninggalkan apa pun
 * yang terlihat pengguna.
 */
import { NextResponse } from "next/server";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { companyCreateSchema } from "@/lib/validations/company";
import { provisionCompany } from "@/lib/company-provisioning";
import { ProvisionError, type ProvisionEvent } from "@/lib/company-provisioning-shared";
import { writeAuditLog } from "@/lib/audit";
import { runWithCompany } from "@/lib/company-context";
import { ROLES } from "@/lib/constants";

export async function POST(request: Request) {
  const result = await requireTenantApiPermission("company.create");
  if (!result.authorized) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = companyCreateSchema.safeParse(body);
  if (!parsed.success) {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const session = result.session;
  const userId = Number.parseInt(session.user.id, 10);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ProvisionEvent | { phase: "error"; message: string }) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const { companyId, databaseName } = await provisionCompany(
          {
            slug: parsed.data.slug,
            name: parsed.data.name,
            databaseName: parsed.data.databaseName,
            createdByUserId: userId,
            /*
             * Pembuatnya menjadi Direktur Utama di perusahaan yang BARU LAHIR —
             * bukan lagi "perannya di perusahaan yang sedang dibuka"
             * (`session.user.role!` yang lama): pelanggan yang membuat PT
             * pertamanya tidak punya peran per-PT sama sekali, dan tanda seru
             * itu bohong untuknya (issue #135). Nilainya dari konstanta
             * `ROLES`, bukan perbandingan string peran.
             */
            role: ROLES.MANAGING_DIRECTOR,
            /* Tenant pemilik = tenant PEMBUATNYA, dari penjaga — bukan input. */
            tenantId: result.tenant.tenantId,
          },
          send
        );

        /*
         * Dicatat di jejak audit perusahaan yang BARU DIBUAT — satu-satunya
         * tempat yang PASTI ada: pembuatnya boleh jadi tidak sedang membuka
         * perusahaan mana pun (pelanggan baru), jadi "jejak perusahaan yang
         * sedang dibuka" tidak lagi selalu bermakna. Pertanyaan "siapa yang
         * membuat PT ini" pun memang paling wajar dicari di PT itu sendiri.
         * (Jejak TINGKAT TENANT belum punya rumah — pekerjaan tahap #138,
         * docs/MULTI-TENANT.md §4.7.)
         */
        await runWithCompany(
          { companyId, slug: parsed.data.slug, databaseName },
          async () => {
            await writeAuditLog({
              userId: session.user.id,
              username: session.user.name ?? session.user.email ?? session.user.id,
              role: result.tenant.role,
              action: "company.create",
              entity: "company",
              entityId: companyId,
              details: {
                slug: parsed.data.slug,
                name: parsed.data.name,
                databaseName,
              },
              request,
            });
          }
        );
      } catch (error) {
        const message =
          error instanceof ProvisionError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Penyediaan gagal.";
        send({ phase: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Proksi yang menyangga respons akan menahan seluruh aliran sampai
      // selesai — persis meniadakan gunanya. Traefik menghormati ini.
      "X-Accel-Buffering": "no",
    },
  });
}
