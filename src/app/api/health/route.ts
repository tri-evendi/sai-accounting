import { NextResponse } from "next/server";
import { controlDb } from "@/lib/control-db";
import { platformDb } from "@/lib/platform-db";
import { schedulerHealth, type SchedulerHealth } from "@/lib/scheduler-heartbeat";

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
 *
 * ══ DENYUT PENJADWAL IKUT DILAPORKAN — TAPI TIDAK IKUT MEMUTUSKAN (#373) ════
 * Penjadwal langganan yang berhenti berjalan adalah kegagalan yang paling
 * senyap di seluruh sistem ini: tidak ada halaman yang rusak, tidak ada log
 * yang merah, hanya uji coba yang tidak pernah berakhir dan tagihan yang tidak
 * pernah terbit. Satu-satunya cara mengetahuinya sebelum akibatnya muncul
 * adalah menanyakannya, dan di sinilah pemantauan dari luar bisa bertanya
 * tanpa perlu kredensial operator.
 *
 * ⚠ Ia TIDAK mengubah status HTTP, dan itu doktrin #137 yang berlaku di
 * seluruh repo ini: **penagihan mati ≠ aplikasi mati.** `sai_platform` yang
 * tak terjangkau tidak boleh membuat Traefik berhenti mengirim lalu lintas ke
 * container yang masih bisa melayani setiap pembukuan pelanggan dengan
 * sempurna. Kalau probe ini 503 karena penjadwal telat, satu masalah penagihan
 * berubah menjadi pemadaman total — persis kebalikan dari tujuannya.
 *
 * Yang membacanya karena itu bukan Docker/Traefik melainkan pemantauan yang
 * memeriksa ISI jawabannya: `scheduler.status` bernilai `late` adalah tanda
 * untuk manusia, bukan untuk load-balancer.
 */

/** Putaran terakhir yang SELESAI. Tak terjangkau / belum ada = `null`, bukan lemparan. */
async function lastSchedulerRun(): Promise<SchedulerHealth> {
  try {
    const run = await platformDb.schedulerRun.findFirst({
      orderBy: { id: "desc" },
      select: { finishedAt: true },
    });
    return schedulerHealth(run?.finishedAt ?? null);
  } catch {
    /*
     * Platform tak terjangkau, atau migration 0005 belum diterapkan. Keduanya
     * "belum ada yang bisa dilaporkan" — pola yang sama dengan
     * `schedulerRunsForOperator`, dan sengaja TIDAK dibedakan dari "belum
     * pernah jalan": keduanya sama-sama berarti probe ini tidak tahu, dan
     * jawaban yang jujur untuk tidak tahu adalah `unknown`.
     */
    return schedulerHealth(null);
  }
}

export async function GET() {
  try {
    // Round-trip ringan untuk memastikan basis data kendali terjangkau.
    await controlDb.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }

  return NextResponse.json({ status: "ok", scheduler: await lastSchedulerRun() });
}
