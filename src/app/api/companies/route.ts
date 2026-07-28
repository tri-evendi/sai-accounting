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
 * ══ KENAPA TANPA PEKERJA LATAR ═════════════════════════════════════════════
 * Lihat catatan panjang di `lib/company-provisioning.ts`: prosesnya server Node
 * yang hidup terus (tidak ada batas waktu yang memutus), pekerjaannya puluhan
 * detik, dan urutannya membuat kegagalan di tengah tidak meninggalkan apa pun
 * yang terlihat pengguna.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { companyCreateSchema } from "@/lib/validations/company";
import { provisionCompany } from "@/lib/company-provisioning";
import { ProvisionError, type ProvisionEvent } from "@/lib/company-provisioning-shared";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  const result = await requireApiPermission("company.create");
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
             * Pembuatnya menjadi anggota dengan perannya SENDIRI di perusahaan
             * yang sedang ia buka. Tanpa keanggotaan, perusahaan yang baru
             * dibuat tidak akan muncul di pemilih milik orang yang membuatnya —
             * ia harus mendaftarkan dirinya lewat jalur lain hanya untuk masuk
             * ke perusahaan yang baru saja ia buat sendiri.
             */
            role: session.user.role!,
          },
          send
        );

        /*
         * Dicatat di jejak audit perusahaan yang SEDANG DIBUKA pembuatnya —
         * di sanalah pertanyaan "siapa yang membuat PT ini, dan kapan" akan
         * dicari. Perusahaan yang baru lahir belum punya jejak apa pun.
         */
        await writeAuditLog({
          userId: session.user.id,
          username: session.user.email,
          role: session.user.role,
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
