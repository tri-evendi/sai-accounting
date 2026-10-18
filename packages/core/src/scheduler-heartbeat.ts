/**
 * DENYUT PENJADWAL (issue #373) — apakah siklus hidup langganan masih berdetak.
 *
 * ══ KENAPA INI PERLU DIPERIKSA SAMA SEKALI ══════════════════════════════════
 * `scripts/subscription-scheduler.ts` menjalankan trial berakhir, penerbitan
 * tagihan, dunning, suspensi, dan pengingat. Kalau ia berhenti berjalan, tidak
 * ada satu pun halaman yang rusak dan tidak ada satu pun log yang merah:
 * uji coba tidak pernah berakhir, tagihan tidak pernah terbit, penunggak tidak
 * pernah ditangguhkan — dan semuanya terlihat persis seperti sistem yang sehat.
 * Kegagalan seperti itu baru ditemukan lewat akibatnya, berbulan-bulan
 * kemudian, saat seseorang bertanya kenapa pendapatannya nol.
 *
 * Datanya SUDAH ada sejak #154: setiap putaran menulis ringkasan ke tabel
 * `scheduler_runs`, dan konsol operator sudah menampilkan sepuluh terakhir.
 * Yang belum ada adalah PUTUSAN — satu fungsi yang menjawab "masih berdetak
 * atau tidak" dengan ambang yang sama di mana pun pertanyaannya diajukan.
 *
 * ══ MURNI, DAN ITU DISENGAJA ════════════════════════════════════════════════
 * Tanpa Prisma dan tanpa `server-only`: pemakainya `/api/health` (Next),
 * `prove-scheduler-alive.ts` (tsx di luar Next), dan kelak konsol operator.
 * Tiga dunia, satu ambang. Ambang yang disalin adalah ambang yang menyimpang,
 * lalu dua permukaan menjawab berbeda tentang mesin yang sama.
 */

/**
 * Putaran dijadwalkan tiap jam (`docker-compose.yml`, layanan `scheduler`).
 * Ambangnya DUA jam, bukan satu: satu putaran yang terlewat karena deploy atau
 * mesin sibuk bukan insiden, dan pemantauan yang berbunyi untuk hal normal
 * adalah pemantauan yang akhirnya diabaikan. Dua putaran berturut-turut yang
 * hilang sudah bukan kebetulan.
 */
export const SCHEDULER_STALE_AFTER_MINUTES = 120;

export type SchedulerHealthStatus =
  /** Berdetak: putaran terakhir masih dalam ambang. */
  | "ok"
  /** Ada riwayatnya, tapi sudah terlalu lama — inilah yang harus berbunyi. */
  | "late"
  /**
   * TIDAK DIKETAHUI: platform tak terjangkau, tabelnya belum dimigrasikan, atau
   * belum pernah ada putaran sama sekali (pemasangan yang baru lahir).
   *
   * Sengaja dibedakan dari `late`. "Saya tidak tahu" dan "saya tahu, dan
   * jawabannya buruk" menuntut tindakan yang berbeda, dan menyatukan keduanya
   * membuat pemasangan baru berbunyi seperti pemasangan yang rusak — persis
   * cara sebuah peringatan kehilangan kepercayaan pembacanya.
   */
  | "unknown";

export interface SchedulerHealth {
  status: SchedulerHealthStatus;
  /** ISO putaran terakhir yang SELESAI, atau null bila tidak diketahui. */
  lastRunAt: string | null;
  /** Umur putaran terakhir dalam menit (dibulatkan ke bawah), atau null. */
  ageMinutes: number | null;
  /** Ambang yang dipakai — ikut dilaporkan supaya pembacanya tidak menebak. */
  staleAfterMinutes: number;
}

/**
 * Putusan denyut. `lastRunAt` null (tak terjangkau / belum pernah jalan) →
 * `unknown`, TIDAK PERNAH `late`.
 *
 * Tanggal di MASA DEPAN diperlakukan sebagai umur 0, bukan umur negatif: jam
 * container dan jam basis data bisa berselisih beberapa detik, dan selisih itu
 * tidak boleh menjadi angka yang membingungkan pembacanya.
 */
export function schedulerHealth(
  lastRunAt: Date | null | undefined,
  now: Date = new Date(),
  staleAfterMinutes: number = SCHEDULER_STALE_AFTER_MINUTES
): SchedulerHealth {
  if (!lastRunAt || Number.isNaN(lastRunAt.getTime())) {
    return {
      status: "unknown",
      lastRunAt: null,
      ageMinutes: null,
      staleAfterMinutes,
    };
  }

  const ageMinutes = Math.max(0, Math.floor((now.getTime() - lastRunAt.getTime()) / 60_000));

  return {
    status: ageMinutes > staleAfterMinutes ? "late" : "ok",
    lastRunAt: lastRunAt.toISOString(),
    ageMinutes,
    staleAfterMinutes,
  };
}
