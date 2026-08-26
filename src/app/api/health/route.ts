import { NextResponse } from "next/server";
import { controlDb } from "@/lib/control-db";
import { platformDb } from "@/lib/platform-db";
import { getCompanyClient } from "@/lib/company-clients";
import { schedulerHealth, type SchedulerHealth } from "@/lib/scheduler-heartbeat";
import { mailHealth } from "@/lib/mail-health";
import { outboxCount, resolveMailConfig } from "@/lib/mailer-core";

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
 *
 * ══ KESIAPAN SUREL IKUT DILAPORKAN — SATU KATA SAJA (#317) ═════════════════
 * Alasannya sekeluarga dengan denyut penjadwal: produksi yang menulis setiap
 * surel ke cakram adalah kegagalan yang tidak merusak satu halaman pun, dan
 * satu-satunya cara mengetahuinya sebelum ada pendaftar yang menunggu selamanya
 * adalah menanyakannya dari luar.
 *
 * Yang keluar HANYA `mail.status`. Probe ini publik — tanpa kredensial — dan
 * rambu #317 melarang membocorkan keadaan konfigurasi surel ke permukaan
 * publik. Host, alamat pengirim, sumber konfigurasi, dan jumlah antrean
 * (yang menyiratkan volume pemakaian) tinggal di konsol operator.
 *
 * Ia juga TIDAK mengubah status HTTP, alasan yang sama dengan penjadwal:
 * surel yang belum disetel bukan alasan menghentikan lalu lintas ke aplikasi
 * yang setiap pembukuannya masih bekerja sempurna.
 */

/** Kesiapan surel. Kegagalan membacanya tidak boleh menjatuhkan probe. */
async function mail() {
  try {
    const [config, count] = await Promise.all([resolveMailConfig(), outboxCount()]);
    return mailHealth({
      transport: config.transport,
      source: config.source,
      nodeEnv: process.env.NODE_ENV,
      outboxCount: count,
    }).public;
  } catch {
    return { status: "unknown" as const };
  }
}

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

/**
 * Basis data PLATFORM terjangkau? (issue #374 · F-5)
 *
 * DILAPORKAN, TIDAK IKUT MEMUTUSKAN — doktrin #137. Platform memikul penagihan
 * dan penjadwal langganan; ia BUKAN prasyarat aplikasi pelanggan bekerja.
 * Membuat probe menjawab 503 karena platform mati berarti Traefik berhenti
 * mengirim lalu lintas ke container yang sebenarnya melayani seluruh
 * pembukuan pelanggan dengan baik — kegagalan penagihan diubah menjadi
 * pemadaman layanan.
 *
 * Jadi jawabannya `"unknown"`, bukan lemparan: sama seperti denyut penjadwal.
 */
async function platform(): Promise<{ status: "ok" | "unknown" }> {
  try {
    await platformDb.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Satu basis data PT contoh terjangkau? (issue #374 · F-5)
 *
 * Kendali yang terjangkau membuktikan orang bisa masuk dan perusahaannya bisa
 * DITEMUKAN — ia tidak membuktikan bukunya bisa DIBUKA. Kredensial yang salah,
 * migrasi yang belum jalan, atau basis data PT yang tidak dibuat akan lolos
 * probe lama sepenuhnya: `sai_control` sehat, dan setiap halaman pembukuan
 * gagal.
 *
 * ══ SATU, DAN CUKUP SATU ═══════════════════════════════════════════════════
 * Bukan semua PT. Jumlahnya tumbuh seiring pelanggan, dan sebuah probe yang
 * biayanya tumbuh adalah probe yang suatu hari menjadi beban yang ia ukur.
 * Satu PT membuktikan yang ingin dibuktikan: kredensial, jaringan, dan bentuk
 * skemanya benar.
 *
 * ══ DILAPORKAN, TIDAK IKUT MEMUTUSKAN ══════════════════════════════════════
 * Alasan yang sama dengan platform, tetapi lebih tajam: satu PT yang bukunya
 * bermasalah TIDAK boleh menarik seluruh container keluar dari rotasi dan
 * mematikan layanan bagi seluruh pelanggan lain. Yang menjatuhkan probe hanya
 * kendali — sebab tanpa kendali tidak ada satu pun halaman yang berguna.
 */
async function sampleCompany(): Promise<{ status: "ok" | "unknown" | "error" }> {
  let databaseName: string | null = null;
  try {
    /* PT mana pun, asal deterministik — `id` menaik supaya jawabannya tidak
       berpindah-pindah antar-panggilan dan sebuah kegagalan bisa ditelusuri. */
    const company = await controlDb.company.findFirst({
      orderBy: { id: "asc" },
      select: { databaseName: true },
    });
    databaseName = company?.databaseName ?? null;
  } catch {
    return { status: "unknown" };
  }

  /* Belum ada satu PT pun — pemasangan baru. Itu bukan kegagalan, dan
     menyebutnya `error` akan membuat setiap pemasangan segar terlihat sakit. */
  if (!databaseName) return { status: "unknown" };

  try {
    await getCompanyClient(databaseName).$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch {
    /*
     * DI SINI `error`, bukan `unknown`: kendali menyebut basis data ini ADA,
     * jadi tak terjangkaunya adalah kabar yang pasti — bukan ketidaktahuan.
     * Statusnya tetap `ok` di tingkat atas; yang ini untuk mata manusia dan
     * pemantauan, bukan untuk Traefik.
     */
    return { status: "error" };
  }
}

export async function GET() {
  try {
    // Round-trip ringan untuk memastikan basis data kendali terjangkau.
    await controlDb.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }

  /* Kunci ditulis EKSPLISIT (bukan singkatan properti): `tests/scheduler-
     heartbeat` menjaga bahwa route ini memang menyebut `scheduler:`, dan
     penjaga itu membaca SUMBERNYA. Singkatan membuatnya merah tanpa satu pun
     perilaku berubah — dan pelajarannya bukan "longgarkan penjaganya". */
  const [schedulerStatus, mailStatus, platformStatus, companyStatus] = await Promise.all([
    lastSchedulerRun(),
    mail(),
    platform(),
    sampleCompany(),
  ]);
  /*
   * `status: "ok"` walau `platform` atau `company` bermasalah — lihat catatan
   * pada masing-masing fungsi. Yang menjatuhkan probe hanya basis data kendali,
   * dan itu diputuskan di atas sebelum sampai ke sini.
   */
  return NextResponse.json({
    status: "ok",
    control: { status: "ok" },
    platform: platformStatus,
    company: companyStatus,
    scheduler: schedulerStatus,
    mail: mailStatus,
  });
}
