/**
 * Tanggal bisnis: hari kalender menurut jam Jakarta (WIB, UTC+7), apa pun
 * zona waktu proses yang menjalankannya.
 *
 * `new Date("2026-06-30T23:59:59.999")` tanpa zona dibaca menurut zona proses.
 * Produksi memasang `TZ=Asia/Jakarta`, tetapi CI, skrip yang dijalankan dari
 * host, perkakas Go, dan pemasangan on-premise tidak menjamin itu — dan buku
 * yang sama per 30 Juni pernah memberi 14 baris di jam Jakarta dan 15 di UTC.
 * Batas hari laporan karena itu ditulis dengan offset eksplisit.
 *
 * WIB tidak mengenal musim panas, jadi offset tetap cukup dan tidak butuh
 * basis data zona waktu.
 *
 * Hitungan kalender murni (hari terakhir bulan, tanggal +1) dan pemformatan
 * tampilan tetap memakai pembuat `Date` lokal: keduanya konsisten di zona mana
 * pun. Yang wajib lewat modul ini hanya dua konversi yang bergantung zona:
 * teks tanggal → batas kueri, dan "sekarang" → tanggal hari ini.
 */

export const BUSINESS_TIME_ZONE = "Asia/Jakarta";
export const BUSINESS_UTC_OFFSET = "+07:00";
const OFFSET_MS = 7 * 60 * 60 * 1000;

/** Awal hari `YYYY-MM-DD` di Jakarta (00:00:00.000 WIB). */
export function businessDayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000${BUSINESS_UTC_OFFSET}`);
}

/** Akhir hari `YYYY-MM-DD` di Jakarta (23:59:59.999 WIB), batas inklusif. */
export function businessDayEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999${BUSINESS_UTC_OFFSET}`);
}

/** Tanggal kalender Jakarta (`YYYY-MM-DD`) pada instan `d`. */
export function businessISODate(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}
