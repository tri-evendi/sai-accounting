import { NextResponse } from "next/server";
import { controlDb } from "@/lib/control-db";

// Never cache or prerender — this must reflect live readiness.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Kesiapan container, untuk healthcheck Docker & Traefik.
 *
 * ══ MEMERIKSA BASIS DATA KENDALI, BUKAN BASIS DATA PERUSAHAAN (issue #104) ══
 * Probe ini dipanggil TANPA sesi — Docker dan Traefik tidak punya kredensial,
 * dan memang tidak boleh punya. Sejak buku besar menjadi satu basis data per
 * PT, "basis data aplikasi" bukan lagi satu benda yang bisa ditunjuk tanpa
 * mengetahui perusahaan mana yang dimaksud; `prisma` dengan benar menolak
 * menebaknya.
 *
 * Versi sebelumnya menjalankan `prisma.$queryRaw` di sini. Setelah #104, itu
 * SELALU melempar (tidak ada konteks perusahaan), tertangkap `catch`, dan
 * dilaporkan sebagai "database unreachable" 503 — container yang sehat akan
 * dinyatakan sakit, lalu Traefik berhenti mengirim lalu lintas ke sana. Deploy
 * akan terlihat gagal total padahal aplikasinya baik-baik saja.
 *
 * Basis data KENDALI adalah pilihan yang tepat justru karena ia satu-satunya
 * yang selalu ada dan tidak bergantung pada siapa yang sedang masuk. Kalau ia
 * terjangkau, proses ini bisa mengautentikasi orang dan menemukan basis data
 * perusahaan mana pun. Kalau tidak, tidak ada satu pun halaman yang berguna —
 * dan itulah definisi "belum siap" yang benar untuk sebuah probe.
 */
export async function GET() {
  try {
    // Round-trip ringan untuk memastikan basis data kendali terjangkau.
    await controlDb.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
