/**
 * DENYUT ANTREAN — sinyal utama antrean pekerjaan (02 §14).
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

import * as kontrak from "./generated/job-numbers";
import { JOB_LANES, type JobLane, type JobLaneAlarm, type JobLaneSlo } from "./generated/job-kinds";

/**
 * Ambang BAWAAN: peringatan pada tujuh menit, bunyi pada sepuluh.
 *
 * Sejak 23 Okt 2026 ambangnya PER JALUR (09 §11) — tetapi hanya jalur yang
 * sampelnya cukup (≥ `ALARM_MIN_SAMPLES`, ditegakkan generator) yang punya
 * angka sendiri. Sisanya memakai pasangan ini, dan itu disengaja: ambang yang
 * dikarang atas tiga pekerjaan akan berteriak untuk hal normal atau diam untuk
 * hal gawat, dan dua-duanya lebih buruk daripada satu angka bawaan yang jujur.
 * Ambang efektif setiap jalur: `laneAlarm()`.
 *
 * Angkanya di `contract/kinds.yaml` dan dibangkitkan ke kedua bahasa: probe
 * kesehatan dan pelari yang tidak sepakat tentang kapan antrean disebut
 * terlambat adalah dua permukaan yang satu hijau sementara yang lain
 * membangunkan orang.
 */
export const QUEUE_AGE_WARN_SECONDS = kontrak.QUEUE_AGE_WARN_SECONDS;
export const QUEUE_AGE_LATE_SECONDS = kontrak.QUEUE_AGE_LATE_SECONDS;
export const ALARM_MIN_SAMPLES = kontrak.ALARM_MIN_SAMPLES;

/** Ambang untuk jalur yang tidak dikenal kontrak (`(tak dikenal)`): bawaan. */
const BAWAAN: JobLaneAlarm = {
  queueAgeWarnSeconds: QUEUE_AGE_WARN_SECONDS,
  queueAgeLateSeconds: QUEUE_AGE_LATE_SECONDS,
  durationP95WarnMs: null,
  measured: false,
  samples: 0,
};

/**
 * Ambang efektif satu jalur — terukur bila kontrak punya `alarm:` untuknya,
 * bawaan bila tidak. Satu-satunya pembaca `JOB_LANES[*].alarm` di TypeScript:
 * probe kesehatan, `watch:health` (lewat probe), dan konsol membaca dari sini.
 */
export function laneAlarm(lane: string): JobLaneAlarm {
  return (JOB_LANES as Record<string, { alarm: JobLaneAlarm } | undefined>)[lane]?.alarm ?? BAWAAN;
}

export type { JobLane, JobLaneAlarm, JobLaneSlo };

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
  /** Ambang yang DIPAKAI untuk vonis di atas — per jalur, jadi ikut dilaporkan. */
  warnAfterSeconds: number;
  lateAfterSeconds: number;
  /** `false` = ambang bawaan, sebab sampel jalur ini belum cukup. */
  measured: boolean;
}

export interface QueueHealth {
  status: QueueHealthStatus;
  /** Setiap jalur membawa ambangnya sendiri (`warnAfterSeconds`/`lateAfterSeconds`). */
  lanes: LaneQueueHealth[];
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
  const a = laneAlarm(lane);
  const ambang = {
    warnAfterSeconds: a.queueAgeWarnSeconds,
    lateAfterSeconds: a.queueAgeLateSeconds,
    measured: a.measured,
  };
  if (waiting <= 0 || oldestQueuedAt === null) {
    return { lane, waiting: Math.max(0, waiting), ageSeconds: null, status: "idle", ...ambang };
  }
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - oldestQueuedAt.getTime()) / 1000));
  const status: QueueHealthStatus =
    ageSeconds >= ambang.lateAfterSeconds
      ? "late"
      : ageSeconds >= ambang.warnAfterSeconds
        ? "warn"
        : "ok";
  return { lane, waiting, ageSeconds, status, ...ambang };
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
  return { status, lanes };
}

/**
 * Sampel minimum DI JENDELA metrik agar p95 satu jalur dinilai terhadap
 * ambangnya. Lebih longgar daripada `ALARM_MIN_SAMPLES` (yang menyetel
 * ambangnya), sebab yang dinilai di sini satu jendela 15 menit, bukan sebaran
 * berhari-hari — tetapi p95 atas tiga pekerjaan tetap bukan fakta.
 */
export const DURATION_MIN_WINDOW_SAMPLES = 10;

/**
 * Vonis durasi satu jalur atas p95 jendela metriknya.
 *
 *  - `unset`        — jalur ini belum punya ambang durasi (sampel kontrak belum cukup);
 *  - `insufficient` — ambang ada, tetapi jendela ini kurang sampel;
 *  - `slow`         — p95 jendela MELEWATI ambang;
 *  - `ok`           — di bawahnya.
 */
export type DurationVerdict = "unset" | "insufficient" | "slow" | "ok";

export function laneDurationVerdict(lane: string, p95Ms: number | null, samples: number): DurationVerdict {
  const batas = laneAlarm(lane).durationP95WarnMs;
  if (batas === null) return "unset";
  if (p95Ms === null || samples < DURATION_MIN_WINDOW_SAMPLES) return "insufficient";
  return p95Ms > batas ? "slow" : "ok";
}

/* ═══ SLO DURASI (TATA-KELOLA §2, 09 §11) ═══════════════════════════════════
 *
 * BEDANYA DENGAN `laneDurationVerdict` DI ATAS, dan kenapa dua-duanya ada:
 *
 *  - `alarm.duration_p95_warn_ms` adalah ambang TURUNAN DATA (10 × p95 teramati,
 *    ≥ 200 sampel) yang dinilai atas jendela 15 menit — detektor "jalur ini
 *    sedang melambat SEKARANG". Jalur bervolume kecil (semua jalur Go: belasan
 *    pekerjaan sehari) tidak pernah punya 10 sampel dalam 15 menit, jadi
 *    vonisnya selamanya `insufficient`/`unset`.
 *  - `slo` adalah JANJI yang disahkan pemilik, dinilai atas jendela PANJANG
 *    (`sloWindowDays`) — pertanyaan "apakah kita menepati janji", yang memang
 *    harus dijawab dari minggu-minggu terakhir, bukan dari 15 menit.
 *
 * Menyatukannya berarti salah satunya dinilai di jendela yang salah.
 */

/**
 * Sampel minimum di jendela SLO sebelum vonis "dalam/melampaui" boleh
 * dijatuhkan. Dua puluh, karena *error budget* SLO-nya 5% pekerjaan: di bawah
 * 20 sampel, SATU ekspor lambat sudah lebih dari 5% — p95 kemudian adalah
 * pekerjaan terlambat itu sendiri, bukan sebaran, dan vonisnya berkedip antara
 * hijau dan merah oleh satu baris. Di bawahnya vonisnya `insufficient`, BUKAN
 * hijau.
 */
export const SLO_MIN_SAMPLES = 20;

/** SLO durasi satu jalur dari kontrak, `null` bila jalur itu tidak punya janji. */
export function laneSlo(lane: string): JobLaneSlo | null {
  return (JOB_LANES as Record<string, { slo: JobLaneSlo | null } | undefined>)[lane]?.slo ?? null;
}

/**
 * Jendela (hari) yang SUNGGUH bisa dinilai: sasaran yang disahkan, dipotong
 * retensi baris `done` (`numbers.done_retention_days`). Baris yang sudah
 * diarsipkan membawa durasinya ikut pergi — melaporkan "30 hari" atas tabel
 * yang hanya menyimpan 14 adalah klaim yang tidak didukung datanya.
 */
export function sloWindowDays(slo: JobLaneSlo): number {
  return Math.min(slo.windowDays, kontrak.DONE_RETENTION_DAYS);
}

/**
 * Vonis SLO satu jalur (atau satu `kind` yang dinilai terhadap SLO jalurnya):
 *
 *  - `unset`        — jalur ini tidak punya SLO;
 *  - `insufficient` — SLO ada, sampel jendela < `SLO_MIN_SAMPLES` ("data belum cukup");
 *  - `exceeding`    — p95 MELAMPAUI sasaran;
 *  - `within`       — p95 di bawah atau sama dengan sasaran.
 *
 * `p95Ms` WAJIB p95 GABUNGAN atas semua pekerjaan yang dinilai — bukan nilai
 * tertinggi antar `kind`: SLO-nya "5% pekerjaan boleh melampaui", dan itu
 * pernyataan tentang himpunan pekerjaannya.
 */
export type SloVerdict = "unset" | "insufficient" | "within" | "exceeding";

export function sloVerdict(lane: string, p95Ms: number | null, samples: number): SloVerdict {
  const slo = laneSlo(lane);
  if (slo === null) return "unset";
  if (p95Ms === null || samples < SLO_MIN_SAMPLES) return "insufficient";
  return p95Ms > slo.durationP95Ms ? "exceeding" : "within";
}
