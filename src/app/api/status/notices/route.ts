/**
 * `GET /api/status/notices` — pengumuman status untuk BANNER di aplikasi.
 *
 * PUBLIK, tanpa sesi: banner juga tampil di halaman masuk (pengguna yang tidak
 * bisa masuk karena pemeliharaan adalah pembaca utamanya), dan isinya memang
 * publik — persis yang dipajang `/status`. Tanpa teks bebas, tanpa `createdBy`:
 * yang menyeberang hanya jenis, komponen, fase, dan waktu.
 *
 * Kenapa route + fetch di peramban, bukan dibaca root layout: root layout
 * sengaja tidak menyentuh basis data (ia ikut berjalan saat `next build`
 * menghasilkan halaman statis dengan URL placeholder) — lihat komentarnya.
 *
 * Gagal-lunak: platform mati → `[]`, bukan 500. Banner yang hilang lebih baik
 * daripada konsol peramban yang merah di setiap halaman.
 */
import { NextResponse } from "next/server";

import { platformDb } from "@/lib/platform-db";
import { cachedStatusNoticeRecords } from "@/lib/status-notices-store";
import { visibleAsBanner } from "@/lib/status-notices";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const rows = await cachedStatusNoticeRecords({ platform: platformDb }, now);
  return NextResponse.json(
    { notices: visibleAsBanner(rows, now) },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
