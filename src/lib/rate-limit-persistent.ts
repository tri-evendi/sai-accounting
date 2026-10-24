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

import { controlDb } from "@sai/core/control-db";

export interface PersistentRateLimitOptions {
  windowMs: number;
  maxAttempts: number;
}

/** Konfigurasi endpoint publik (issue #138). */
export const PERSISTENT_RATE_LIMITS = {
  /**
   * MASUK, per alamat IP (issue #372) — pagar terhadap isian-kredensial yang
   * MENYEBAR ke banyak akun.
   *
   * Inilah bentuk serangan yang batas per-pengenal tidak pernah lihat: seribu
   * akun dicoba masing-masing satu kali dari satu alamat, dan tidak satu pun
   * penghitung per-akun mendekati batasnya.
   *
   * 50 per 15 menit, sengaja jauh lebih longgar daripada batas per-akun: satu
   * kantor di balik NAT adalah SATU alamat, dan batas per-IP yang seketat
   * per-akun akan mengunci seluruh kantor karena satu orang salah ketik. 50
   * masih jauh di atas pemakaian wajar dan jauh di bawah ambang berguna bagi
   * penyisir daftar kredensial.
   */
  loginIp: { windowMs: 15 * 60 * 1000, maxAttempts: 50 },
  /**
   * MASUK, per pengenal — pagar terhadap SATU akun yang digempur. Angkanya
   * sama persis dengan `RATE_LIMITS.login` di memori yang digantikannya, jadi
   * yang berubah hanya ketahanannya (selamat dari restart, terbagi
   * antar-instance), bukan seberapa ketat.
   */
  loginIdentifier: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  /**
   * Permintaan `/api/v1/…` per TOKEN (issue #389).
   *
   * Kuncinya token, bukan IP: sebuah integrasi hidup di satu alamat dan
   * menariknya ribuan kali sehari — membatasi per-IP akan menghukum pemakaian
   * yang benar, sementara token yang bocor tetap leluasa selama penyerangnya
   * berpindah alamat.
   *
   * 600 per menit ≈ 10 per detik: jauh di atas laju penarikan yang wajar
   * (integrasi menarik per menit atau per jam, bukan per milidetik), dan jauh
   * di bawah laju yang bisa menguras basis data kendali.
   */
  apiToken: { windowMs: 60 * 1000, maxAttempts: 600 },
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
  /** Penerimaan undangan staf (#139) per IP — publik bertoken 256 bit; pagar
   *  ini menahan penebakan buta, bukan pemakaian wajar. */
  invitationAcceptIp: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  /**
   * Formulir penawaran/demo publik (`/api/leads`, migration platform 0016)
   * per SIDIK alamat IP (kuncinya HMAC, bukan alamatnya). Lima per jam cukup
   * untuk satu kantor di balik NAT yang mengirim ulang karena salah ketik,
   * dan terlalu sedikit untuk membanjiri daftar kerja tim penjualan.
   */
  leadIp: { windowMs: 60 * 60 * 1000, maxAttempts: 5 },
  /** Per nomor WhatsApp — tiga per hari: satu nomor tidak butuh lebih. */
  leadPhone: { windowMs: 24 * 60 * 60 * 1000, maxAttempts: 3 },
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
   * diputuskan di server basis data. Jamnya jam SERVER basis data supaya jam
   * aplikasi tidak ikut bermain.
   *
   * ══ JAMNYA UTC, BUKAN `NOW()` POLOS ═════════════════════════════════════
   * Kolom-kolom ini TIMESTAMP tanpa zona, dan selain pernyataan ini ada dua
   * penulis/pembaca Prisma di tabel yang sama — pembersihan di bawah
   * (`updatedAt < cutoff`) dan peredam alarm `watch:health`
   * (`windowStartedAt`). Prisma menulis & membaca jam dinding UTC, sedangkan
   * `NOW()` polos menyimpan jam dinding zona SESI (`Asia/Jakarta` di
   * produksi). Sampai 23 Okt 2026 pernyataan ini memakai `NOW()` polos, jadi
   * barisnya tujuh jam "lebih muda" dari tetangganya dan pembersihannya
   * terlambat tujuh jam. Konvensinya: docs/DATABASE.md §4 "Kolom waktu".
   *
   * Baris lama (jam WIB) terbaca BERADA DI MASA DEPAN terhadap jam UTC. Cabang
   * `> jam + 1 menit` memperlakukannya sebagai jendela kedaluwarsa, jadi
   * peralihan ini paling banter membuka SATU jendela baru lebih awal — bukan
   * mengunci pengguna tujuh jam lebih lama. Tanpa migrasi data.
   *
   * Ditulis sebagai SQL, bukan disembunyikan di balik ORM: pembatas laju adalah
   * pagar keamanan, dan pernyataan yang bisa dibaca mata bisa diperiksa. Cabang
   * `ON DUPLICATE KEY UPDATE` milik MariaDB dicabut di Fase E (#636).
   */
  await controlDb.$executeRaw`
    INSERT INTO rate_limit_counters ("key", window_started_at, count, created_at, updated_at)
    VALUES (${key}, now() AT TIME ZONE 'UTC', 1, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      count = CASE
        WHEN rate_limit_counters.window_started_at <= (now() AT TIME ZONE 'UTC') - MAKE_INTERVAL(secs => ${windowSeconds})
          OR rate_limit_counters.window_started_at > (now() AT TIME ZONE 'UTC') + interval '1 minute'
        THEN 1 ELSE rate_limit_counters.count + 1 END,
      window_started_at = CASE
        WHEN rate_limit_counters.window_started_at <= (now() AT TIME ZONE 'UTC') - MAKE_INTERVAL(secs => ${windowSeconds})
          OR rate_limit_counters.window_started_at > (now() AT TIME ZONE 'UTC') + interval '1 minute'
        THEN now() AT TIME ZONE 'UTC' ELSE rate_limit_counters.window_started_at END,
      updated_at = now() AT TIME ZONE 'UTC'`;

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
