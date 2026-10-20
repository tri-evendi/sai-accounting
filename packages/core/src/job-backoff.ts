/**
 * ANGKA MURNI ANTREAN PEKERJAAN — backoff, lease, retensi.
 *
 * Sifat yang dijaganya ada di docs/arsitektur/04-ALIRAN-DATA.md §8.9.
 *
 * Dipisahkan dari SQL-nya karena inilah bagian yang salahnya paling halus dan
 * paling mahal: angka yang keliru di sini tidak membuat apa pun gagal, ia
 * hanya membuat pekerjaan diulang terlalu cepat (membanjiri layanan luar yang
 * sedang pulih) atau terlalu lambat (pengguna menunggu tanpa sebab). Keduanya
 * mustahil dilihat dari log. Karena murni, ia bisa diuji langsung.
 *
 * MURNI: tanpa Prisma, tanpa IO, tanpa `next/*`.
 */

/** Penundaan dasar sebelum percobaan kedua. */
export const BACKOFF_BASE_MS = 30_000;

/** Plafon penundaan — satu jam. Lebih dari ini praktis "besok", dan pekerjaan
 *  yang perlu besok lebih baik diterbitkan ulang oleh produser berjadwal. */
export const BACKOFF_MAX_MS = 3_600_000;

/**
 * Interval pembaruan *lease* oleh pekerja selama bekerja.
 *
 * 30 detik: cukup sering sehingga pekerja yang mati terdeteksi dalam waktu yang
 * masih berguna, cukup jarang sehingga satu `UPDATE` tiap 30 detik per pekerja
 * tidak menjadi beban tulis sendiri di tabel yang sudah panas.
 */
export const LEASE_RENEW_MS = 30_000;

/**
 * Ambang reclaim = KELIPATAN interval pembaruan, bukan perkiraan durasi.
 *
 * Inilah keputusan yang mencegah bug yang hanya muncul di produksi: ambang yang
 * diturunkan dari "berapa lama pekerjaan ini biasanya" akan selalu salah untuk
 * ekspor 30 menit — ia melewati ambang mana pun yang masuk akal untuk mendeteksi
 * pekerja mati, lalu diklaim pekerja kedua SEMENTARA yang pertama masih
 * berjalan. Untuk `tenant.backup` itu berarti dua dump menulis ke satu kunci
 * objek, dan yang terakhir menang.
 *
 * Dengan lease yang diperpanjang, pertanyaannya berubah dari "apakah pekerjaan
 * ini lama?" menjadi "apakah pekerjanya masih hidup?" — dan yang kedua punya
 * jawaban yang tidak bergantung pada jenis pekerjaan. Faktor 4 memberi ruang
 * untuk tiga pembaruan yang terlewat sebelum pekerjaan dipulangkan.
 */
export const LEASE_STALE_FACTOR = 4;
export const LEASE_STALE_MS = LEASE_RENEW_MS * LEASE_STALE_FACTOR;

/**
 * Penundaan sebelum percobaan ke-`attempt`-plus-satu.
 *
 * @param attempt jumlah percobaan yang SUDAH gagal (≥ 1).
 * @param acak sumber jitter 0..1; disuntik di tes.
 */
export function backoffMs(attempt: number, acak: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt));
  /* `2 ** (n - 1)` dibatasi SEBELUM dikali supaya percobaan ke-40 tidak
     menghasilkan Infinity — kelihatan mustahil, tapi `max_attempts` adalah
     angka di kontrak yang bisa dinaikkan orang tanpa memikirkan ini. */
  const faktor = Math.min(2 ** (n - 1), BACKOFF_MAX_MS / BACKOFF_BASE_MS);
  const dasar = Math.min(BACKOFF_BASE_MS * faktor, BACKOFF_MAX_MS);

  /*
   * Jitter ±25%, dan ia bukan hiasan: tanpanya sepuluh pekerjaan yang gagal
   * bersama (satu layanan luar mati) akan mencoba lagi pada MILIDETIK yang
   * sama, berulang-ulang — memukul layanan yang sedang pulih dengan gelombang
   * yang persis seirama. Itu *thundering herd*, dan ia memperpanjang pemadaman
   * yang seharusnya sudah lewat.
   */
  const jitter = dasar * 0.25 * (acak() * 2 - 1);
  return Math.max(1_000, Math.round(dasar + jitter));
}

/** Apakah percobaan berikutnya masih ada, atau pekerjaan ini sudah mati? */
export function isDead(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

/**
 * Umur antrean yang dilaporkan sebagai sinyal utama (§11).
 *
 * Yang diukur UMUR pekerjaan tertua yang menunggu, bukan JUMLAH yang menunggu.
 * Bedanya menentukan: seribu pekerjaan yang semuanya selesai dalam dua detik
 * adalah sistem yang sehat, sementara SATU pekerjaan yang menunggu empat jam
 * adalah sistem yang rusak — dan metrik jumlah membaca keduanya terbalik.
 */
export function queueAgeMs(tertuaDiterbitkan: Date | null, sekarang: Date = new Date()): number {
  if (tertuaDiterbitkan === null) return 0;
  return Math.max(0, sekarang.getTime() - tertuaDiterbitkan.getTime());
}

/**
 * Umur baris `done` sebelum dibuang dari tabel panas (*bloat*; 04 §8.9).
 *
 * Dua minggu: cukup untuk "itu jalan minggu lalu, tunjukkan", dan sesudahnya
 * jawabannya ada di domain yang ditulis pekerjaan itu, bukan di baris
 * antreannya.
 *
 * ⚠ BARIS GAGAL TIDAK IKUT. `dead` dan `failed` tidak pernah dipangkas —
 * kegagalan adalah isi paling berharga di tabel ini, dan ia justru yang dicari
 * orang berbulan-bulan kemudian. Tabel yang membuang kegagalannya demi
 * kerapian membuang satu-satunya catatan tentang apa yang pernah salah.
 *
 * ⚠ DAN SATU KAITAN YANG MUDAH TERLEWAT, untuk tahap 1c: `result_ref` adalah
 * KUNCI objek, jadi barisnya satu-satunya yang tahu di mana hasil sebuah
 * pekerjaan berada. Begitu ada jalur yang menulis `result_ref`, daur hidup
 * objeknya wajib TIDAK lebih panjang daripada jendela ini — objek yang hidup
 * lebih lama daripada barisnya adalah berkas yang tak bisa dijangkau siapa pun
 * lagi sementara sewanya tetap dibayar.
 */
export const DONE_RETENTION_DAYS = 14;
