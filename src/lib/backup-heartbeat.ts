/**
 * DENYUT CADANGAN (issue #374) — apakah pembukuan pelanggan masih disalin.
 *
 * ══ KENAPA INI ADA, DAN KENAPA IA BUKAN SALINAN DENYUT PENJADWAL ═══════════
 * Layanan `backup` berjalan tiap 24 jam dan setiap putaran dibungkus
 * `|| true` (`docker-compose.yml`). Itu SENGAJA — satu cadangan yang gagal
 * tidak boleh mematikan jadwal cadangan berikutnya. Tetapi akibatnya, sebuah
 * putaran yang gagal hanya menulis satu baris ke log lalu tidur 24 jam dan
 * mengulangi kegagalan yang sama persis besok.
 *
 * Itu bukan hipotesis. Antara 28 Juli dan 23 Agustus 2026 produksi berjalan
 * dengan pelanggan sungguhan dan **nol cadangan otomatis**: layanannya hidup,
 * menolak dengan benar karena `BACKUP_ENCRYPTION_KEY` kosong, dan mengulangi
 * penolakan itu dua puluh enam kali tanpa satu pun yang berbunyi ke luar.
 *
 * ══ SATU PERBEDAAN YANG MENENTUKAN ═════════════════════════════════════════
 * Denyut penjadwal (#373) mengukur umur PUTARAN TERAKHIR. Kalau ukuran itu
 * disalin ke sini, dua puluh enam kegagalan berturut-turut akan tampil sebagai
 * `ok` — sebab ada putaran, tiap hari, tepat waktu. Yang tidak ada adalah
 * hasilnya.
 *
 * Maka umur di sini dihitung dari KEBERHASILAN TERAKHIR. Sebuah cadangan yang
 * dicoba tiap hari dan gagal tiap hari adalah persis keadaan yang harus
 * berbunyi paling keras, bukan yang paling tenang.
 *
 * ══ MURNI, DAN ITU DISENGAJA ═══════════════════════════════════════════════
 * Tanpa Prisma dan tanpa `server-only` — pola yang sama dengan
 * `scheduler-heartbeat.ts`, dan alasan yang sama: pemakainya `/api/health`
 * (Next) dan skrip di luar Next. Ambang yang disalin adalah ambang yang
 * menyimpang, lalu dua permukaan menjawab berbeda tentang mesin yang sama.
 */

/**
 * Cadangan dijadwalkan tiap 24 jam (`docker-compose.yml`, layanan `backup`).
 *
 * Ambangnya 48 jam, bukan 24: satu putaran yang terlewat karena deploy, mesin
 * sibuk, atau restart bukan insiden — dan pemantauan yang berbunyi untuk hal
 * normal adalah pemantauan yang akhirnya diabaikan. Dua hari tanpa satu pun
 * salinan sudah bukan kebetulan.
 */
export const BACKUP_STALE_AFTER_HOURS = 48;

export type BackupHealthStatus =
  /** Ada salinan yang berhasil, dan umurnya masih dalam ambang. */
  | "ok"
  /**
   * Percobaan TERAKHIR gagal. Dilaporkan terpisah dari `late` karena ia
   * menjawab pertanyaan yang berbeda: `late` berkata "tidak ada salinan baru",
   * `failing` berkata "dan inilah sebabnya, sekarang juga". Sebuah putaran yang
   * gagal hari ini sementara salinan kemarin masih segar tetap harus berbunyi —
   * ia peringatan dini, bukan keadaan sehat.
   */
  | "failing"
  /** Ada riwayat berhasil, tapi sudah terlalu lama — inilah yang paling gawat. */
  | "late"
  /**
   * Putaran terakhir BERHASIL membuat artefak terenkripsi, tetapi artefak itu
   * tidak pergi ke mana-mana: ia tersimpan di mesin yang sama dengan basis
   * datanya, sebab `BACKUP_S3_BUCKET` belum disetel.
   *
   * ══ KENAPA INI BUKAN `ok`, DAN KENAPA JUGA BUKAN `failing` ═══════════════
   * Bukan `ok`, sebab satu kehilangan mesin menghapus data DAN salinannya
   * sekaligus — dan status yang berbunyi `ok` untuk keadaan itu adalah kebohongan
   * yang paling mahal yang bisa dilaporkan berkas ini.
   *
   * Tapi juga bukan `failing`, sebab ada BEDANYA yang nyata dengan tidak punya
   * apa pun: salinan harian ini memulihkan `DROP TABLE` yang keliru, migrasi yang
   * merusak, dan kerusakan logis — yaitu mayoritas kejadian yang sungguh-sungguh
   * terjadi. Melebur keduanya menjadi `failing` membuat kemajuan dari "nol
   * salinan" ke "salinan lokal harian" tak terlihat, dan yang tak terlihat tidak
   * akan pernah diselesaikan.
   *
   * Ia tetap **berbunyi** (lihat `backup-watchdog.ts`) sampai tujuan di luar
   * mesin disetel.
   */
  | "local_only"
  /**
   * TIDAK DIKETAHUI: platform tak terjangkau, tabelnya belum dimigrasikan, atau
   * belum pernah ada putaran sama sekali (pemasangan yang baru lahir).
   *
   * Sengaja dibedakan dari `late`, alasan yang sama dengan denyut penjadwal:
   * "saya tidak tahu" dan "saya tahu, dan jawabannya buruk" menuntut tindakan
   * yang berbeda, dan menyatukan keduanya membuat pemasangan baru berbunyi
   * seperti pemasangan yang rusak.
   */
  | "unknown";

export interface BackupHealth {
  status: BackupHealthStatus;
  /** ISO cadangan BERHASIL terakhir, atau null bila belum pernah ada. */
  lastSuccessAt: string | null;
  /** Umur cadangan berhasil terakhir dalam jam, atau null. */
  ageHours: number | null;
  /** ISO percobaan terakhir, berhasil atau tidak. */
  lastAttemptAt: string | null;
  /** Sebab kegagalan percobaan terakhir, bila ia gagal. */
  lastError: string | null;
  /** Ambang yang dipakai — ikut dilaporkan supaya pembacanya tidak menebak. */
  staleAfterHours: number;
}

export interface BackupAttempt {
  at: Date | null | undefined;
  ok: boolean;
  error?: string | null;
  /**
   * Putaran ini menghasilkan artefak, tetapi HANYA di mesin ini.
   *
   * Dipisahkan dari `ok` dengan sengaja: `ok` berarti "ada salinan di luar
   * mesin". Memakai `ok: true` untuk salinan lokal akan membuat `lastSuccessAt`
   * terisi dan umurnya terhitung segar — dan permukaan kesehatan akan berkata
   * terlindungi padahal satu kehilangan mesin menghapus keduanya.
   */
  localOnly?: boolean;
}

function usia(at: Date, now: Date): number {
  /* Tanggal di MASA DEPAN diperlakukan sebagai umur 0, bukan umur negatif: jam
     container dan jam basis data bisa berselisih, dan selisih itu tidak boleh
     menjadi angka yang membingungkan pembacanya. */
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 3_600_000));
}

function sah(at: Date | null | undefined): at is Date {
  return at instanceof Date && !Number.isNaN(at.getTime());
}

/**
 * Putusan denyut cadangan.
 *
 * Urutan keputusannya adalah inti berkas ini:
 *
 *   1. Belum pernah ada percobaan sama sekali → `unknown`, tidak pernah `late`.
 *   2. Percobaan terakhir GAGAL → `failing`, apa pun umur salinan terakhir.
 *   3. Percobaan terakhir hanya LOKAL → `local_only`, apa pun umur salinan
 *      terakhir di luar mesin.
 *   4. Ada salinan berhasil (di luar mesin), umurnya lewat ambang → `late`.
 *   5. Sisanya → `ok`.
 *
 * Langkah 2 mendahului langkah 4 dengan sengaja. Kalau urutannya dibalik,
 * kegagalan hari pertama tersembunyi di balik salinan kemarin yang masih segar
 * — dan yang tersisa hanyalah `late` dua hari kemudian, yaitu peringatan yang
 * datang tepat setelah ia berhenti berguna.
 *
 * Langkah 3 mendahului langkah 4 dengan alasan yang SAMA, dan satu tambahan:
 * sebuah pemasangan yang baru turun dari S3 ke lokal-saja harus terlihat SEKARANG
 * — bukan 48 jam kemudian lewat `late`, yang akan menyembunyikan sebab
 * sesungguhnya ("tujuannya hilang") di balik gejala ("salinannya tua").
 */
export function backupHealth(
  lastSuccessAt: Date | null | undefined,
  lastAttempt: BackupAttempt | null | undefined,
  now: Date = new Date(),
  staleAfterHours: number = BACKUP_STALE_AFTER_HOURS
): BackupHealth {
  const sukses = sah(lastSuccessAt) ? lastSuccessAt : null;
  const percobaan = lastAttempt && sah(lastAttempt.at) ? lastAttempt : null;

  const dasar = {
    lastSuccessAt: sukses ? sukses.toISOString() : null,
    ageHours: sukses ? usia(sukses, now) : null,
    lastAttemptAt: percobaan ? percobaan.at!.toISOString() : null,
    lastError: percobaan && !percobaan.ok ? (percobaan.error ?? null) : null,
    staleAfterHours,
  };

  if (!percobaan && !sukses) return { status: "unknown", ...dasar };
  if (percobaan && !percobaan.ok && !percobaan.localOnly) {
    return { status: "failing", ...dasar };
  }
  if (percobaan?.localOnly) return { status: "local_only", ...dasar };
  if (!sukses) return { status: "unknown", ...dasar };

  return { status: dasar.ageHours! > staleAfterHours ? "late" : "ok", ...dasar };
}
