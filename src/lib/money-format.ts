/**
 * Aturan tampilan uang (issue #52) — satu tempat, bukan 50.
 *
 * MASTER.md menuntut: format `id-ID`, mata uang eksplisit, `tabular-nums`,
 * rata kanan di tabel, dan nilai negatif yang jelas. Selama ini tiap halaman
 * mengetik ulang aturan itu sendiri; inkonsistensi sekecil pemisah ribuan
 * yang berbeda antar-halaman langsung menggerus kepercayaan pengguna pada
 * angkanya.
 *
 * **Selalu locale `id-ID`, termasuk untuk valas.** `formatCurrency` di
 * `lib/utils.ts` memakai locale per-mata-uang (USD -> en-US), sehingga dalam
 * satu tabel yang memuat IDR dan USD pemisah ribuannya bisa berbeda
 * (`1.234.567` vs `1,234.56`) — persis hal yang membuat angka sulit
 * dibandingkan sekilas. Di sini locale-nya dikunci ke id-ID:
 *
 *   IDR  1.234.567  -> "Rp 1.234.567"   (identik dengan tampilan lama)
 *   USD  1.234,56   -> "US$1.234,56"    (dulu "$1,234.56")
 *   CNY  1.234,50   -> "CN¥1.234,50"
 *
 * Simbolnya pun jadi tak ambigu: "US$" bukan "$" — penting untuk konteks
 * ekspor yang memakai USD dan CNY berdampingan.
 *
 * **Negatif memakai tanda minus, bukan kurung.** MASTER.md membolehkan
 * keduanya. Kurung `(1.234)` adalah konvensi akuntansi Inggris; `id-ID`
 * secara native memakai `-Rp 1.234.567`, dan itu yang dihasilkan `Intl`
 * (opsi `currencySign: "accounting"` TIDAK menghasilkan kurung pada locale
 * ini — sudah diperiksa). Tanda minus inilah penanda non-warna yang membuat
 * nilai negatif tetap terbaca tanpa bergantung pada merah saja.
 */

/** Mata uang yang dipakai app ini; string lain tetap diterima apa adanya. */
export type CurrencyCode = "IDR" | "USD" | "CNY" | (string & {});

/**
 * Rupiah tidak lazim ditulis berdesimal; valas selalu 2 desimal.
 * Dipisahkan agar `Rp 1.234.567` tidak berubah jadi `Rp 1.234.567,00`.
 */
function fractionDigits(currency: CurrencyCode) {
  return currency === "IDR" ? 0 : 2;
}

/** "Rp 1.234.567" / "US$1.234,56" — mata uang eksplisit, separator id-ID. */
export function formatMoney(value: number, currency: CurrencyCode = "IDR") {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Angka saja tanpa simbol — untuk kolom yang mata uangnya sudah di judul. */
export function formatAmount(value: number, currency: CurrencyCode = "IDR") {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Nol dianggap netral: `-0` yang muncul dari pembulatan tidak boleh tampil
 * merah seolah-olah uang keluar.
 */
export function isNegative(value: number) {
  return value < 0;
}
