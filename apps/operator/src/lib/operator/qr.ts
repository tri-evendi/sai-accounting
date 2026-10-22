/**
 * KODE QR untuk URI `otpauth://` — dikodekan DI SERVER, digambar sebagai SVG
 * sebaris.
 *
 * ══ KENAPA TIDAK PERNAH LEWAT LAYANAN QR LUAR ═════════════════════════════
 * URI `otpauth://` MEMUAT rahasia TOTP. Gambar QR dari layanan luar
 * (`<img src="https://…/qr?data=otpauth://…">`) berarti rahasianya terkirim ke
 * pihak ketiga, tercatat di log akses mereka, dan ikut tersimpan di riwayat
 * peramban — faktor kedua yang bocor sebelum sempat dipakai. Di sini yang
 * keluar dari modul ini hanya GEOMETRI: ukuran matriks dan satu string `d`
 * jalur SVG. Tidak ada URL, tidak ada `<image>`, tidak ada teks rahasia.
 *
 * Pengodenya `uqr` (unjs, nol dependensi, tanpa skrip pemasangan; port dari
 * pengode referensi Nayuki), dipatok versi persis di `apps/operator/package.json`.
 * Pustaka, bukan pengode tulis tangan: Reed-Solomon, pemilihan versi, dan
 * delapan pola mask adalah ratusan baris yang kesalahannya tidak terlihat
 * sampai satu kamera menolak memindai.
 *
 * MURNI — diuji di `tests/operator-authenticator.test.ts`.
 */
import { encode } from "uqr";

/** Data gambar QR yang menyeberang ke layar — tanpa teks sumbernya. */
export interface QrSvgData {
  /** Sisi matriks DALAM MODUL, termasuk zona tenang. */
  size: number;
  /** Jalur SVG: satu persegi panjang per deretan modul gelap. */
  path: string;
}

/**
 * Zona tenang 4 modul — angka yang dituntut ISO/IEC 18004. `uqr` bawaannya 1,
 * dan QR berzona tenang tipis adalah QR yang gagal dipindai di atas latar
 * kartu yang tidak putih bersih.
 */
const QUIET_ZONE = 4;

/**
 * Kodekan `text` menjadi geometri SVG.
 *
 * Koreksi galat `M` (15%): URI otpauth ~150 karakter tetap muat di versi
 * kecil, dan layar laptop yang dipotret ponsel cukup sering memantulkan
 * cahaya untuk membuat `L` gagal.
 */
export function qrSvgData(text: string): QrSvgData {
  const { size, data } = encode(text, { ecc: "M", border: QUIET_ZONE });
  let path = "";
  for (let y = 0; y < size; y++) {
    const row = data[y];
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && row[x]) x++;
      path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  }
  return { size, path };
}
