import { NextResponse } from "next/server";

import { healthReport } from "@/lib/health-report";

// Never cache or prerender — this must reflect live readiness.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Kesiapan container, untuk healthcheck Docker & Traefik.
 *
 * ══ ISINYA PINDAH, PUTUSANNYA TIDAK (issue #374) ═══════════════════════════
 * Pengumpulan bidangnya kini di `lib/health-report.ts`, sebab pembacanya dua:
 * route ini (untuk mesin) dan `/status` (untuk orang). Yang TETAP di sini
 * adalah satu-satunya hal yang memang milik lapisan HTTP — penerjemahan
 * "kendali tak terjangkau" menjadi 503.
 *
 * ══ MEMERIKSA BASIS DATA KENDALI, BUKAN BASIS DATA PERUSAHAAN (issue #104) ══
 * Probe ini dipanggil TANPA sesi — Docker dan Traefik tidak punya kredensial,
 * dan memang tidak boleh punya. Sejak buku besar menjadi satu basis data per
 * PT, "basis data aplikasi" bukan lagi satu benda yang bisa ditunjuk tanpa
 * mengetahui perusahaan mana yang dimaksud; `prisma` dengan benar menolak
 * menebaknya.
 *
 * Versi jauh sebelumnya menjalankan `prisma.$queryRaw` di sini. Setelah #104,
 * itu SELALU melempar (tidak ada konteks perusahaan), tertangkap `catch`, dan
 * dilaporkan sebagai "database unreachable" 503 — container yang sehat akan
 * dinyatakan sakit, lalu Traefik berhenti mengirim lalu lintas ke sana. Deploy
 * akan terlihat gagal total padahal aplikasinya baik-baik saja.
 *
 * Basis data KENDALI adalah pilihan yang tepat justru karena ia satu-satunya
 * yang selalu ada dan tidak bergantung pada siapa yang sedang masuk. Kalau ia
 * terjangkau, proses ini bisa mengautentikasi orang dan menemukan basis data
 * perusahaan mana pun. Kalau tidak, tidak ada satu pun halaman yang berguna —
 * dan itulah definisi "belum siap" yang benar untuk sebuah probe.
 *
 * ══ SATU 503, DAN HANYA SATU ═══════════════════════════════════════════════
 * Doktrin #137 berlaku di seluruh repo ini: **penagihan mati ≠ aplikasi mati.**
 * Platform, PT contoh, penjadwal, cadangan, dan surel semuanya DILAPORKAN dan
 * tidak satu pun IKUT MEMUTUSKAN. `sai_platform` yang tak terjangkau tidak
 * boleh membuat Traefik berhenti mengirim lalu lintas ke container yang masih
 * bisa melayani setiap pembukuan pelanggan dengan sempurna; kalau probe ini
 * 503 karena penjadwal telat, satu masalah penagihan berubah menjadi pemadaman
 * total — persis kebalikan dari tujuannya.
 *
 * Yang membaca bidang-bidang itu karena itu bukan Docker/Traefik melainkan
 * pemantauan yang memeriksa ISI jawabannya, dan sejak #374 juga halaman
 * `/status` yang membacanya untuk manusia.
 */
export async function GET() {
  const report = await healthReport();

  if (report.status === "error") {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }

  return NextResponse.json(report);
}
