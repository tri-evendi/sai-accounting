/**
 * `GET /api/v1/openapi.json` — spesifikasi mesin-terbaca (issue #389, F-10).
 *
 * ══ KENAPA ENDPOINT INI PUBLIK ═════════════════════════════════════════════
 * Ia tidak menuntut token, dan itu disengaja. Yang dipulangkan adalah BENTUK
 * API-nya — nama endpoint, nama medan, aturan paginasi — bukan satu byte pun
 * data perusahaan. Menuntut token untuk membacanya berarti integrator harus
 * sudah punya kredensial sebelum bisa mengetahui apa yang bisa dilakukannya,
 * dan itu urutan yang terbalik: orang membaca dokumentasi untuk memutuskan
 * apakah akan memakainya.
 *
 * Bentuk API bukan rahasia. Yang rahasia adalah datanya, dan itu dijaga
 * `requireApiToken` di setiap endpointnya.
 *
 * ══ DIBANGUN DARI SUMBER YANG SAMA DENGAN PENJAGANYA ═══════════════════════
 * `lib/api-v1-spec.ts`, dan `tests/api-v1-spec.test.ts` menuntut setiap route
 * `/api/v1/*` punya entri di sana — jadi endpoint yang lahir tanpa
 * didokumentasikan gagal di `bun run verify`, bukan ditemukan integrator enam
 * bulan kemudian.
 */
import { NextResponse } from "next/server";

import { buildOpenApiDocument } from "@/lib/api-v1-spec";
import { publicAppUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const document = buildOpenApiDocument(publicAppUrl().toString().replace(/\/$/, ""));

  return NextResponse.json(document, {
    headers: {
      /* Bentuk API berubah saat rilis, bukan tiap menit — tapi cache yang
         terlalu panjang membuat integrator membaca bentuk lama sesudah kita
         menambah endpoint. Lima menit: cukup meredam, cukup pendek untuk tidak
         menyesatkan. */
      "Cache-Control": "public, max-age=300",
    },
  });
}
