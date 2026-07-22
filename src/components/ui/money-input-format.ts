/**
 * Konversi format<->angka untuk `MoneyInput` (issue #53). Dipisah dari
 * komponennya agar bisa diuji sebagai fungsi murni tanpa render DOM — logika
 * inilah yang menjamin payload submit berisi angka bersih, bukan `1.234.567`.
 */

/** Angka bersih -> tampilan id-ID; string kosong bila belum ada nilai. */
export function numberToDisplay(value: number | undefined, decimals: number): string {
  if (value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Tampilan id-ID -> angka bersih. Titik = pemisah ribuan (dibuang), koma =
 * desimal (jadi titik). `undefined` untuk isian kosong, supaya "belum diisi"
 * bisa dibedakan dari "diisi nol" oleh validasi.
 */
export function displayToNumber(display: string, decimals: number): number | undefined {
  let cleaned = display.replace(/\./g, "").replace(/,/g, decimals > 0 ? "." : "");
  // Sisakan hanya digit, satu titik desimal, dan tanda minus di depan.
  cleaned = cleaned.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-") return undefined;
  const n = Number(cleaned);
  return Number.isNaN(n) ? undefined : n;
}
