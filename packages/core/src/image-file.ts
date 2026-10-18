/**
 * Pemeriksa berkas gambar untuk logo (logo produk di konsol, logo perusahaan
 * di pengaturan PT). Murni: membaca format dan ukuran dari kepala berkas,
 * tanpa pustaka gambar native.
 *
 * Hanya PNG dan JPEG yang diterima. Keduanya bisa ditampilkan peramban,
 * dimasukkan ke PDF oleh jsPDF, dan tidak bisa menjalankan skrip. SVG ditolak:
 * ia dokumen XML yang bisa membawa skrip, dan jsPDF tidak menggambarnya.
 *
 * Yang diperiksa adalah ISI berkas, bukan nama atau MIME yang dikirim
 * peramban: tanda tangan PNG/JPEG di awal berkas dan ukuran gambar dari
 * kepalanya (chunk IHDR untuk PNG, penanda SOFn untuk JPEG).
 */

export type ImageMime = "image/png" | "image/jpeg";

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

/** Batas ukuran berkas logo. Logo yang lebih besar memperlambat setiap PDF dan setiap muatan halaman. */
export const LOGO_MAX_BYTES = 512 * 1024;
/** Sisi terpanjang yang diterima. */
export const LOGO_MAX_SIDE = 4096;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function inspectPng(b: Uint8Array): ImageInfo | null {
  if (b.length < 24) return null;
  if (!PNG_SIGNATURE.every((v, i) => b[i] === v)) return null;
  // Chunk pertama wajib IHDR: panjang 13, lalu "IHDR", lalu lebar & tinggi.
  if (u32(b, 8) !== 13) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  return { mime: "image/png", width: u32(b, 16), height: u32(b, 20) };
}

/** Penanda SOFn yang membawa ukuran gambar (bukan DHT 0xC4, JPG 0xC8, DAC 0xCC). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function inspectJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Penanda tanpa panjang (RSTn, TEM) dan pengisi 0xFF.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // akhir gambar / awal data sebelum SOF
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (i + 9 > b.length) return null;
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return { mime: "image/jpeg", width, height };
    }
    i += 2 + length;
  }
  return null;
}

/** Format & ukuran gambar dari isinya, atau `null` bila bukan PNG/JPEG yang sah. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes);
}

export type LogoRejection = "empty" | "too_large" | "not_image" | "too_small" | "too_big_dimensions";

/**
 * Validasi berkas logo. `minSide` berbeda per pemakai: logo produk dipakai
 * sebagai ikon aplikasi dan favicon, jadi minimal 256 px; logo perusahaan
 * cukup 64 px untuk kepala dokumen.
 */
export function validateLogo(
  bytes: Uint8Array,
  opts: { minSide: number }
): { ok: true; info: ImageInfo } | { ok: false; reason: LogoRejection } {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: "too_large" };
  const info = inspectImage(bytes);
  if (!info || info.width === 0 || info.height === 0) return { ok: false, reason: "not_image" };
  if (Math.min(info.width, info.height) < opts.minSide) return { ok: false, reason: "too_small" };
  if (Math.max(info.width, info.height) > LOGO_MAX_SIDE) return { ok: false, reason: "too_big_dimensions" };
  return { ok: true, info };
}

/** SHA-256 heksadesimal — versi logo untuk URL & cache. Memakai Web Crypto (Node & peramban). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
