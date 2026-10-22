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
 * Yang wajib lewat modul ini: setiap konversi yang bergantung zona — teks
 * tanggal → batas kueri, "sekarang" → tanggal hari ini, DAN batas periode yang
 * dihitung dari angka kalender (awal/akhir bulan, tahun buku, hari yang sama
 * tahun lalu). `new Date(y, m, d)` dan `getMonth()`/`getDate()` membaca zona
 * PROSES; di server ber-TZ UTC batas bulan bergeser tujuh jam, dan tanggal yang
 * ditulis sistem pada 00:00 WIB (17:00Z hari sebelumnya) terbaca sebagai hari
 * sebelumnya. Pakai `businessDate` dan `businessParts` — padanan persis
 * keduanya di bawah TZ=Asia/Jakarta, jadi produksi tidak berubah perilaku.
 * Dijaga `tests/period-bounds-timezone-guard.test.ts`.
 *
 * Bentuk simpan (kolom `TIMESTAMP(3)` tanpa zona, Prisma menulis UTC): tanggal
 * dari formulir (`"YYYY-MM-DD"` → `new Date(iso)`) mendarat di 00:00Z = 07:00
 * WIB; tanggal yang dibangkitkan sistem lewat pembuat lokal di produksi
 * mendarat di 00:00 WIB = 17:00Z hari sebelumnya. Keduanya jatuh di hari
 * kalender Jakarta yang SAMA — tafsiran Jakarta adalah satu-satunya yang
 * konsisten untuk kedua bentuk, dan batas `[businessDayStart, businessDayEnd]`
 * memuat keduanya.
 *
 * Pemformatan tampilan di browser tidak termasuk: itu zona pembacanya.
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

/**
 * Instan untuk jam dinding Jakarta `(year, monthIndex, day, …)` — padanan
 * zona-bebas `new Date(year, monthIndex, day, h, mi, s, ms)` di
 * TZ=Asia/Jakarta, termasuk penggulungannya (`day = 0` = hari terakhir bulan
 * sebelumnya, `monthIndex = 12` = Januari tahun berikutnya). `monthIndex`
 * berbasis 0, sama seperti `Date`.
 */
export function businessDate(
  year: number,
  monthIndex: number,
  day = 1,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hours, minutes, seconds, ms) - OFFSET_MS);
}

/** Komponen kalender Jakarta pada instan `d`. */
export interface BusinessDateParts {
  year: number;
  /** 0–11, sama seperti `Date#getMonth`. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0 = Minggu … 6 = Sabtu, sama seperti `Date#getDay`. */
  weekday: number;
}

/**
 * Padanan zona-bebas `getFullYear()`/`getMonth()`/`getDate()`/`getDay()` di
 * TZ=Asia/Jakarta.
 */
export function businessParts(d: Date): BusinessDateParts {
  const s = new Date(d.getTime() + OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth(),
    day: s.getUTCDate(),
    weekday: s.getUTCDay(),
  };
}
