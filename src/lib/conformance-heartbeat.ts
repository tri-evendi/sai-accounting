/**
 * DENYUT PEMERIKSA KESESUAIAN DATA — apakah sapuan mingguan masih berjalan,
 * dan apa temuan terakhirnya.
 *
 * ══ KENAPA INI PERLU DIPERIKSA SAMA SEKALI ══════════════════════════════════
 * Penjaga zod hanya berlaku di jalur TULIS. Impor sekali-jalan, perbaikan SQL
 * manual, dan penyemai tidak melewati satu penjaga pun — dan audit 20-21
 * Agustus 2026 menemukan ENAM kelas cacat yang masuk lewat pintu itu di buku
 * produksi, termasuk kuantitas faktur termigrasi salah senilai Rp 774 juta.
 * Semuanya ditemukan dengan menggali manual selama dua hari.
 *
 * `scripts/check-data-conformance.ts` ada supaya penggalian itu tidak perlu
 * terulang. Tetapi sampai modul ini lahir, keluarannya hanya `stdout`: dua
 * layanan latar lain punya jejak yang bisa DITANYAI (`scheduler_runs`,
 * `backup_runs`, keduanya terbaca di `/api/health`), yang ini tidak. Jadi
 * satu-satunya cara mengetahui temuan adalah MENGINGAT untuk membuka log
 * container — pada cadensi MINGGUAN.
 *
 * ══ MURNI, DAN ITU DISENGAJA ════════════════════════════════════════════════
 * Tanpa Prisma dan tanpa `server-only`, alasan yang sama dengan
 * `scheduler-heartbeat.ts`: pemakainya `/api/health` (Next) dan skrip `tsx` di
 * luar Next. Ambang yang disalin adalah ambang yang menyimpang, lalu dua
 * permukaan menjawab berbeda tentang mesin yang sama.
 */

/**
 * Sapuan berjalan MINGGUAN (`docker-compose.yml`, peran `conformance` di `svc-worker`:
 * `sleep 604800`).
 *
 * Ambangnya SEMBILAN HARI, bukan tujuh: satu putaran yang bergeser karena
 * deploy, mesin sibuk, atau `timeout` 1800 detik yang membunuhnya bukan
 * insiden — dan pemantauan yang berbunyi untuk hal normal adalah pemantauan
 * yang akhirnya diabaikan. Dua minggu berturut-turut yang hilang sudah bukan
 * kebetulan.
 *
 * Dinyatakan dalam JAM, bukan hari, supaya satu satuan dipakai bersama
 * `backup-heartbeat.ts` dan pembacanya tidak perlu mengonversi.
 */
export const CONFORMANCE_STALE_AFTER_HOURS = 24 * 9;

export type ConformanceHealthStatus =
  /** Berjalan dalam ambang, dan NOL temuan. Satu-satunya yang berarti tenang. */
  | "ok"
  /**
   * Berjalan dalam ambang, tetapi MENEMUKAN sesuatu.
   *
   * Ini BUKAN kegagalan layanan — pemeriksanya bekerja persis sebagaimana
   * mestinya. Ia dibedakan dari `ok` justru karena inilah keadaan yang harus
   * dibaca orang; menyatukan keduanya mengubah alat yang berguna menjadi alat
   * yang selalu hijau.
   */
  | "findings"
  /**
   * Ada buku yang GAGAL diperiksa, atau putaran terakhir sudah lewat ambang.
   *
   * Keduanya disatukan dengan sengaja: buku yang tidak terperiksa dan sapuan
   * yang berhenti berjalan menuntut tindakan yang sama — seseorang harus
   * melihat kenapa.
   */
  | "late"
  /**
   * TIDAK DIKETAHUI: platform tak terjangkau, tabelnya belum dimigrasikan, atau
   * belum pernah ada putaran sama sekali.
   *
   * Dibedakan dari `late` dengan alasan yang sama seperti di
   * `scheduler-heartbeat.ts`: "saya tidak tahu" dan "saya tahu, dan jawabannya
   * buruk" menuntut tindakan berbeda, dan menyatukannya membuat pemasangan baru
   * berbunyi seperti pemasangan yang rusak.
   */
  | "unknown";

export interface ConformanceHealth {
  status: ConformanceHealthStatus;
  /** ISO putaran terakhir yang SELESAI, atau null bila tidak diketahui. */
  lastRunAt: string | null;
  /** Umur putaran terakhir dalam jam (dibulatkan ke bawah), atau null. */
  ageHours: number | null;
  /** Jumlah baris temuan pada putaran terakhir, atau null bila tak diketahui. */
  findingCount: number | null;
  /** Berapa buku GAGAL diperiksa pada putaran terakhir, atau null. */
  companiesFailed: number | null;
  /** Ambang yang dipakai — ikut dilaporkan supaya pembacanya tidak menebak. */
  staleAfterHours: number;
}

/** Putaran terakhir, sebagaimana dibaca dari `conformance_runs`. */
export interface LastConformanceRun {
  finishedAt: Date | null | undefined;
  findingCount?: number | null;
  companiesFailed?: number | null;
}

/**
 * Putusan denyut. Tanpa putaran (tak terjangkau / belum pernah jalan) →
 * `unknown`, TIDAK PERNAH `late`.
 *
 * Urutan putusannya menentukan, dan sengaja begini:
 *   1. tidak ada putaran            → `unknown`
 *   2. lewat ambang                 → `late`   (basi mengalahkan isinya: temuan
 *                                               dari dua minggu lalu bukan
 *                                               kabar tentang hari ini)
 *   3. ada buku yang gagal diperiksa → `late`  (buku tak terperiksa ≠ bersih)
 *   4. ada temuan                   → `findings`
 *   5. selain itu                   → `ok`
 *
 * Tanggal di MASA DEPAN diperlakukan sebagai umur 0, bukan negatif: jam
 * container dan jam basis data bisa berselisih beberapa detik, dan selisih itu
 * tidak boleh menjadi angka yang membingungkan pembacanya.
 */
export function conformanceHealth(
  run: LastConformanceRun | null | undefined,
  now: Date = new Date(),
  staleAfterHours: number = CONFORMANCE_STALE_AFTER_HOURS
): ConformanceHealth {
  const finishedAt = run?.finishedAt;

  if (!finishedAt || Number.isNaN(finishedAt.getTime())) {
    return {
      status: "unknown",
      lastRunAt: null,
      ageHours: null,
      findingCount: null,
      companiesFailed: null,
      staleAfterHours,
    };
  }

  const ageHours = Math.max(0, Math.floor((now.getTime() - finishedAt.getTime()) / 3_600_000));
  const findingCount = run?.findingCount ?? 0;
  const companiesFailed = run?.companiesFailed ?? 0;

  const status: ConformanceHealthStatus =
    ageHours > staleAfterHours
      ? "late"
      : companiesFailed > 0
        ? "late"
        : findingCount > 0
          ? "findings"
          : "ok";

  return {
    status,
    lastRunAt: finishedAt.toISOString(),
    ageHours,
    findingCount,
    companiesFailed,
    staleAfterHours,
  };
}
