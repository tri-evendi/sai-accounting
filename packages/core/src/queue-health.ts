/**
 * DENYUT ANTREAN — sinyal utama antrean pekerjaan (rancangan §11).
 *
 * ══ YANG DIUKUR UMUR, BUKAN KEDALAMAN ═══════════════════════════════════════
 * *Queue depth* tidak mengatakan berapa lama pekerjaannya menunggu maupun
 * apakah tumpukannya tumbuh. Seribu pekerjaan yang semuanya selesai dalam dua
 * detik adalah sistem yang sehat; SATU pekerjaan yang menunggu empat jam adalah
 * sistem yang rusak — dan metrik kedalaman membaca keduanya terbalik. Yang
 * memetakan langsung ke apa yang dirasakan pengguna adalah umur pekerjaan
 * tertua yang belum jalan.
 *
 * ══ AMBANG HANYA BERLAKU BILA ADA YANG MENUNGGU ═════════════════════════════
 * Tanpa syarat itu, antrean kosong dan pekerja yang menganggur karena memang
 * tak ada kerja terbaca seperti kegagalan — dan peringatan yang berbunyi untuk
 * keadaan normal adalah peringatan yang akhirnya diabaikan. Itu sebabnya
 * `idle` adalah status tersendiri dan bukan `ok`: "tidak ada yang menunggu" dan
 * "ada yang menunggu, dan masih segar" menuntut bacaan yang berbeda, dan
 * menyatukannya menyembunyikan bahwa ambangnya tidak pernah diuji.
 *
 * ⚠ SYARAT ITU SEKALIGUS MEMBUKA LUBANG TERBESAR DI SELURUH RANCANGAN INI, dan
 * modul ini TIDAK menutupnya — penutupnya ada di tempat lain, dan itu harus
 * ditulis di sini supaya tidak ada yang mengira sudah cukup. Bila penerbitnya
 * mati, tak ada baris yang pernah terbit: antrean kosong, umur tertua nol,
 * setiap ambang di bawah HIJAU — sementara pengingat, dokumen berulang, dan
 * cadangan semuanya berhenti. Kegagalan total yang terbaca sebagai kesehatan
 * sempurna. Yang menjawabnya denyut PENERBIT (`scheduler-heartbeat.ts`), yang
 * diukur dari stempel waktu putaran dan karena itu tidak bergantung pada isi
 * antrean sama sekali. Keduanya wajib dibaca berpasangan.
 *
 * MURNI: tanpa Prisma, tanpa IO, tanpa `next/*` — ambang yang sama dipakai
 * probe kesehatan, konsol operator, dan pelari pekerjaan.
 */

/**
 * Peringatan pada tujuh menit, bunyi pada sepuluh.
 *
 * Satu pasang ambang untuk SEMUA jalur, dan itu keputusan yang disengaja.
 * Ambang per-jalur memang lebih benar — `report.export` yang menunggu tujuh
 * menit buruk karena ada orang menatap layar, sementara `ledger.recurring`
 * yang menunggu tujuh menit tidak berarti apa-apa untuk batch harian — tetapi
 * tujuh angka yang dikarang tanpa pengukuran adalah tujuh ambang yang akan
 * berteriak untuk hal normal atau diam untuk hal gawat, dan dua-duanya lebih
 * buruk daripada satu angka yang jujur. Pemecahannya menunggu histogram durasi
 * pekerjaan di §11, bukan menunggu rapat.
 */
export const QUEUE_AGE_WARN_SECONDS = 7 * 60;
export const QUEUE_AGE_LATE_SECONDS = 10 * 60;

export type QueueHealthStatus =
  /** Tidak ada pekerjaan menunggu. Ambang TIDAK berlaku — lihat catatan di atas. */
  | "idle"
  /** Ada yang menunggu, dan yang tertua masih di bawah ambang peringatan. */
  | "ok"
  /** Melewati ambang peringatan: antrean tertahan, belum tentu rusak. */
  | "warn"
  /** Melewati ambang bunyi. Ini yang membangunkan orang. */
  | "late";

export interface LaneQueueHealth {
  lane: string;
  /** Pekerjaan `queued` yang `run_after`-nya sudah lewat. Penundaan bukan tunggakan. */
  waiting: number;
  /** Umur pekerjaan tertua yang menunggu, dalam detik. `null` bila tak ada. */
  ageSeconds: number | null;
  status: QueueHealthStatus;
}

export interface QueueHealth {
  status: QueueHealthStatus;
  lanes: LaneQueueHealth[];
  /** Ambang ikut dilaporkan supaya pembacanya tidak menebak. */
  warnAfterSeconds: number;
  lateAfterSeconds: number;
}

/**
 * Putusan untuk satu jalur.
 *
 * `oldestQueuedAt` adalah `run_after` pekerjaan tertua yang SUDAH jatuh tempo —
 * bukan `created_at`. Bedanya menentukan: pekerjaan yang sengaja dijadwalkan
 * untuk besok bukan tunggakan, dan menghitungnya sebagai tunggakan membuat
 * setiap *backoff* terbaca sebagai antrean yang macet.
 */
export function laneQueueHealth(
  lane: string,
  waiting: number,
  oldestQueuedAt: Date | null,
  now: Date = new Date()
): LaneQueueHealth {
  if (waiting <= 0 || oldestQueuedAt === null) {
    return { lane, waiting: Math.max(0, waiting), ageSeconds: null, status: "idle" };
  }
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - oldestQueuedAt.getTime()) / 1000));
  const status: QueueHealthStatus =
    ageSeconds >= QUEUE_AGE_LATE_SECONDS
      ? "late"
      : ageSeconds >= QUEUE_AGE_WARN_SECONDS
        ? "warn"
        : "ok";
  return { lane, waiting, ageSeconds, status };
}

/** Urutan keparahan — dipakai untuk meringkas banyak jalur menjadi satu kata. */
const KEPARAHAN: Record<QueueHealthStatus, number> = { idle: 0, ok: 1, warn: 2, late: 3 };

/**
 * Ringkasan lintas jalur: status TERBURUK, bukan rata-rata.
 *
 * Rata-rata lintas jalur menyembunyikan justru hal yang paling ingin diketahui —
 * *starvation*, yaitu satu kelas pekerjaan tertahan di belakang kelas lain. Enam
 * jalur sehat dan satu yang macet adalah insiden, bukan "86% sehat".
 *
 * Ringkasan ini untuk permukaan yang hanya boleh memuat satu kata (probe publik,
 * #317). Pemantauan membaca `lanes`.
 */
export function queueHealth(lanes: LaneQueueHealth[]): QueueHealth {
  let status: QueueHealthStatus = "idle";
  for (const l of lanes) if (KEPARAHAN[l.status] > KEPARAHAN[status]) status = l.status;
  return {
    status,
    lanes,
    warnAfterSeconds: QUEUE_AGE_WARN_SECONDS,
    lateAfterSeconds: QUEUE_AGE_LATE_SECONDS,
  };
}
