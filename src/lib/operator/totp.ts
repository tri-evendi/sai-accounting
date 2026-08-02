/**
 * TOTP (RFC 6238, atas HOTP RFC 4226) untuk MFA WAJIB konsol operator
 * (issue #154).
 *
 * Ditulis sendiri dengan `node:crypto` alih-alih menambah dependensi: seluruh
 * algoritmanya HMAC-SHA1 + pemotongan dinamis (~40 baris), dan permukaan
 * pemanggilnya cuma satu (login operator). Divalidasi terhadap vektor uji
 * resmi RFC 6238 Appendix B di `tests/operator-totp.test.ts`.
 *
 * MURNI selain `node:crypto`; TIDAK diimpor proxy (edge) — verifikasi TOTP
 * hanya terjadi di server action login, yang berjalan di runtime Node.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Dekode Base32 (RFC 4648, tanpa padding wajib) — format rahasia TOTP yang
 * dipahami semua aplikasi authenticator. Karakter asing → null (kredensial
 * yang salah bentuk tidak boleh diam-diam terverifikasi sebagian).
 */
export function decodeBase32(secret: string): Buffer | null {
  const cleaned = secret.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  if (cleaned.length === 0) return null;

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Kode TOTP untuk satu langkah waktu. `counter` = floor(unix / 30). */
function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  // JS bitwise hanya 32-bit — tulis 64-bit big-endian secara manual.
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  message.writeUInt32BE(counter % 0x100000000, 4);

  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Kode TOTP pada waktu tertentu — diekspor untuk tes & skrip pembuat kredensial. */
export function totpAt(secretBase32: string, unixSeconds: number): string | null {
  const key = decodeBase32(secretBase32);
  if (!key) return null;
  return hotp(key, Math.floor(unixSeconds / TOTP_STEP_SECONDS));
}

/**
 * Verifikasi kode 6 digit dengan toleransi ±1 langkah (jam perangkat yang
 * miring ≤30 detik masih diterima — praktik baku RFC 6238 §5.2, jendela
 * sekecil mungkin). Perbandingan waktu-konstan; rahasia yang tak terurai atau
 * kode yang salah bentuk selalu ditolak.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: Date = new Date()
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = decodeBase32(secretBase32);
  if (!key) return false;

  const counter = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
  const provided = Buffer.from(code);
  for (const drift of [0, -1, 1]) {
    const expected = Buffer.from(hotp(key, counter + drift));
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return true;
    }
  }
  return false;
}
