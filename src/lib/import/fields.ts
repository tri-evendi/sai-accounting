/**
 * INTI IMPOR BERSAMA — pembaca nilai per kolom (issue #381).
 *
 * Setiap jenis berkas memvalidasi kolomnya sendiri, tetapi CARA membaca sebuah
 * teks menjadi angka, tanggal, atau pilihan adalah hal yang sama untuk
 * semuanya — dan justru di situ kesalahan diam-diam lahir. Contohnya sudah ada
 * di aplikasi ini sejak lama: `Number("1.234,50")` adalah `NaN`, dan sebuah
 * `NaN` yang lolos ke jurnal adalah baris yang tidak bisa dijelaskan siapa pun.
 *
 * MURNI: tanpa Prisma, tanpa I/O, tanpa `server-only`.
 */

import type { RowIssues } from "@/lib/import/rows";

/** Teks wajib, dipotong pada batas kolomnya. */
export function requiredText(
  raw: string,
  label: string,
  max: number,
  issues: RowIssues
): string {
  if (!raw) {
    issues.add(`${label} kosong`);
    return "";
  }
  if (raw.length > max) {
    issues.add(`${label} lebih dari ${max} karakter`);
    return "";
  }
  return raw;
}

/** Teks opsional; kosong sah, terlalu panjang tidak. */
export function optionalText(
  raw: string,
  label: string,
  max: number,
  issues: RowIssues
): string | null {
  if (!raw) return null;
  if (raw.length > max) {
    issues.add(`${label} lebih dari ${max} karakter`);
    return null;
  }
  return raw;
}

/**
 * Angka dari teks spreadsheet — dan di sinilah letak sebagian besar bahayanya.
 *
 * Orang Indonesia mengetik `1.234.567,89`; Excel yang di-set English
 * menuliskannya `1,234,567.89`; sel bertipe angka datang sebagai `1234567.89`.
 * Ketiganya berarti nilai yang SAMA, dan `Number()` telanjang hanya memahami
 * yang terakhir — dua lainnya menjadi `NaN`.
 *
 * Aturan pemisahnya diputuskan dari POSISI, bukan dari daftar locale: pemisah
 * yang muncul TERAKHIR dan menyisakan 1–2 angka di belakangnya adalah pemisah
 * DESIMAL; sisanya pemisah ribuan yang dibuang. `1.234` karena itu terbaca
 * seribu dua ratus tiga puluh empat, bukan 1,234 — pilihan yang benar untuk
 * uang rupiah, dan yang harus disebut di templat agar tidak menebak-nebak.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;

  const cleaned = raw.replace(/\s/g, "").replace(/^Rp\.?/i, "");
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  let integerPart: string;
  let decimalPart = "";
  if (lastSep === -1) {
    integerPart = cleaned;
  } else {
    const decimals = cleaned.length - lastSep - 1;
    if (decimals >= 1 && decimals <= 2) {
      integerPart = cleaned.slice(0, lastSep);
      decimalPart = cleaned.slice(lastSep + 1);
    } else {
      // Tidak ada yang berperilaku seperti desimal → semuanya ribuan.
      integerPart = cleaned;
    }
  }

  if (!isValidIntegerPart(integerPart)) return null;

  const normalized = integerPart.replace(/[.,]/g, "") + (decimalPart ? `.${decimalPart}` : "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Bagian bulat harus berbentuk angka yang WAJAR: tanpa pemisah sama sekali,
 * atau berkelompok tiga dengan SATU jenis pemisah.
 *
 * Tanpa pemeriksaan ini `1.2.3.4,5` terbaca 12345,5 — sebuah teks yang bukan
 * angka di locale mana pun, diterima diam-diam sebagai nilai yang tidak pernah
 * dimaksudkan siapa pun. Untuk berkas berisi saldo pelanggan, "diterima
 * diam-diam" adalah bentuk kegagalan yang paling mahal.
 */
function isValidIntegerPart(part: string): boolean {
  const digitsOnly = part.replace(/^-/, "");
  if (digitsOnly === "") return false;
  if (!/[.,]/.test(digitsOnly)) return /^\d+$/.test(digitsOnly);

  // Satu jenis pemisah saja — "1.234,567" di bagian bulat tidak berarti apa pun.
  if (digitsOnly.includes(".") && digitsOnly.includes(",")) return false;

  const groups = digitsOnly.split(/[.,]/);
  if (groups.length < 2) return false;
  if (!/^\d{1,3}$/.test(groups[0])) return false;
  return groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

export interface AmountOptions {
  /** Wajib ada isinya. */
  required?: boolean;
  /** Harus lebih besar dari nol. */
  positive?: boolean;
}

export function readAmount(
  raw: string,
  label: string,
  issues: RowIssues,
  options: AmountOptions = {}
): number | null {
  if (!raw) {
    if (options.required) issues.add(`${label} kosong`);
    return null;
  }
  const value = parseAmount(raw);
  if (value === null) {
    issues.add(`${label} "${raw}" bukan angka yang bisa dibaca`);
    return null;
  }
  if (options.positive && value <= 0) {
    issues.add(`${label} harus lebih besar dari nol`);
    return null;
  }
  return value;
}

/**
 * Tanggal dari teks. Menerima ISO (`2026-01-31`) dan bentuk Indonesia
 * (`31/01/2026`, `31-01-2026`).
 *
 * `new Date(teks)` telanjang SENGAJA tidak dipakai: ia membaca `01/02/2026`
 * sebagai 2 Januari (gaya Amerika), dan sebuah faktur yang bergeser sebulan
 * tanpa galat adalah kesalahan yang tidak akan ditemukan siapa pun sampai umur
 * piutangnya salah.
 */
export function parseImportDate(raw: string): Date | null {
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const idn = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);

  let year: number, month: number, day: number;
  if (iso) {
    [, year, month, day] = iso.map(Number) as [number, number, number, number];
  } else if (idn) {
    [, day, month, year] = idn.map(Number) as [number, number, number, number];
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // UTC: tanggal dokumen adalah tanggal kalender, bukan momen — dan zona waktu
  // server tidak boleh menggesernya satu hari.
  const date = new Date(Date.UTC(year, month - 1, day));
  // Menangkap 31 Februari: JS menggulungnya ke Maret alih-alih menolak.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function readDate(
  raw: string,
  label: string,
  issues: RowIssues,
  options: { required?: boolean } = {}
): Date | null {
  if (!raw) {
    if (options.required) issues.add(`${label} kosong`);
    return null;
  }
  const date = parseImportDate(raw);
  if (!date) {
    issues.add(`${label} "${raw}" bukan tanggal yang dikenali (pakai 2026-01-31 atau 31/01/2026)`);
    return null;
  }
  return date;
}

/**
 * Pilihan dari peta kode → nilai internal (mis. kode tipe akun Accurate).
 * Kode yang tidak dikenal DISEBUT namanya di galatnya: "tidak valid" tanpa
 * menyebut apa yang dibaca memaksa orang menebak sel mana yang dimaksud.
 */
export function readMapped<T>(
  raw: string,
  label: string,
  map: Record<string, T>,
  issues: RowIssues,
  options: { required?: boolean; fallback?: T } = {}
): T | null {
  if (!raw) {
    if (options.required) issues.add(`${label} kosong`);
    return options.fallback ?? null;
  }
  const value = map[raw.toUpperCase()];
  if (value === undefined) {
    issues.add(`${label} "${raw}" tidak dikenal`);
    return null;
  }
  return value;
}
