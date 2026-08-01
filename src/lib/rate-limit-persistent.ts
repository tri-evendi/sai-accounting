/**
 * Pembatas laju PERSISTEN (issue #138) — pengganti `rate-limit.ts` untuk
 * endpoint yang TERBUKA KE INTERNET.
 *
 * ══ KENAPA TIDAK CUKUP `Map` DI MEMORI ══════════════════════════════════════
 * Penghitung memori hilang saat proses dimulai ulang dan tidak terbagi
 * antar-instance: penyerang yang bisa memancing restart (atau sekadar sabar
 * menunggu deploy) mendapat jendelanya kembali, dan dua instance berarti dua
 * kali kuota. Untuk /login internal itu diterima (dan `rate-limit.ts` tetap
 * dipakainya); untuk /register dan atur-ulang kata sandi tidak.
 *
 * ══ KENAPA BASIS DATA KENDALI, BUKAN REDIS ══════════════════════════════════
 * Pemasangan ini tidak punya Redis, dan menambah satu layanan berjaga demi
 * beberapa penghitung adalah ongkos operasional yang tidak sepadan hari ini.
 * Basis data kendali sudah ada di depan setiap alur autentikasi, penulisannya
 * satu UPSERT jendela-tetap yang atomik di sisi server, dan lalu lintas
 * endpoint publik yang DIBATASI justru kecil menurut definisinya. Kalau kelak
 * skala menuntut, antarmukanya satu fungsi — penyimpanannya tinggal ditukar.
 *
 * ══ ATOMIK LEWAT UPSERT, BUKAN BACA-LALU-TULIS ══════════════════════════════
 * `INSERT … ON DUPLICATE KEY UPDATE` dengan IF() mengevaluasi jendela DI
 * SERVER basis data: dua permintaan serentak tidak pernah saling menimpa
 * hitungan (baca-lalu-tulis di aplikasi bisa). Jendela TETAP (bukan geser) —
 * sederhana, cukup untuk gerbang anti-penyalahgunaan, dan perilakunya mudah
 * dijelaskan di pesan galat.
 *
 * Koneksi: memakai pool `controlDb` yang sudah ada (CONTROL_DB_CONNECTION_LIMIT,
 * bawaan 2) — tidak menambah satu koneksi pun; lihat catatan kapasitas di PR.
 */

import "server-only";

import { controlDb } from "@/lib/control-db";

export interface PersistentRateLimitOptions {
  windowMs: number;
  maxAttempts: number;
}

/** Konfigurasi endpoint publik (issue #138). */
export const PERSISTENT_RATE_LIMITS = {
  /** /register per alamat IP — pagar penyisiran massal. */
  registerIp: { windowMs: 60 * 60 * 1000, maxAttempts: 10 },
  /** /register per email — pagar spam ke satu kotak masuk. */
  registerEmail: { windowMs: 60 * 60 * 1000, maxAttempts: 3 },
  /** Klik verifikasi per IP — longgar: pemiliknya memegang token acak 256 bit,
   *  pagar ini hanya menahan penyisiran buta. */
  verifyEmailIp: { windowMs: 15 * 60 * 1000, maxAttempts: 20 },
  /** Atur-ulang kata sandi (#136; penghitung persistennya dijanjikan di sini). */
  passwordResetIp: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  passwordResetEmail: { windowMs: 15 * 60 * 1000, maxAttempts: 3 },
} as const satisfies Record<string, PersistentRateLimitOptions>;

export interface PersistentRateLimitResult {
  allowed: boolean;
  /** Sisa jatah pada jendela ini (0 saat ditolak). */
  remaining: number;
}

/**
 * Hitung satu percobaan pada `key` dan putuskan boleh/tidak.
 *
 * Percobaan yang DITOLAK tetap dihitung — jendela penyerang tidak bergeser
 * maju hanya karena ia terus mencoba. Gagal menyentuh basis data = MELEMPAR,
 * bukan diam-diam mengizinkan: pemanggilnya endpoint publik, dan fail-open
 * pada pagar keamanan adalah pagar yang tidak ada.
 */
export async function checkPersistentRateLimit(
  key: string,
  options: PersistentRateLimitOptions
): Promise<PersistentRateLimitResult> {
  const windowSeconds = options.windowMs / 1000;

  /*
   * Satu perjalanan atomik: reset jendela yang kedaluwarsa ATAU tambah satu,
   * diputuskan di server basis data. NOW(3) dipakai di kedua sisi supaya jam
   * aplikasi tidak ikut bermain.
   */
  await controlDb.$executeRaw`
    INSERT INTO rate_limit_counters (\`key\`, window_started_at, count, created_at, updated_at)
    VALUES (${key}, NOW(3), 1, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      count = IF(window_started_at <= NOW(3) - INTERVAL ${windowSeconds} SECOND, 1, count + 1),
      window_started_at = IF(
        window_started_at <= NOW(3) - INTERVAL ${windowSeconds} SECOND,
        NOW(3),
        window_started_at
      ),
      updated_at = NOW(3)`;

  const row = await controlDb.rateLimitCounter.findUnique({
    where: { key },
    select: { count: true },
  });
  const count = row?.count ?? 1;

  /*
   * Pembersihan oportunistik (~1% panggilan): baris yang jendelanya sudah
   * lama lewat tidak berguna lagi. Tanpa cron (belum ada penjadwal, §4.8),
   * inilah cara termurah menahan tabel tetap kecil; gagal bersih-bersih tidak
   * boleh menggagalkan keputusan yang sudah diambil.
   */
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - Math.max(options.windowMs * 2, 24 * 60 * 60 * 1000));
    void controlDb.rateLimitCounter
      .deleteMany({ where: { updatedAt: { lt: cutoff } } })
      .catch(() => {});
  }

  return {
    allowed: count <= options.maxAttempts,
    remaining: Math.max(0, options.maxAttempts - count),
  };
}
