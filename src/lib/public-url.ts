/**
 * Alamat publik aplikasi — untuk metadata, peta situs, dan robots.
 *
 * ══ KENAPA `AUTH_URL`, DAN BUKAN VARIABEL BARU ═════════════════════════════
 * Tiga rute API sudah membangun tautan surel dari `AUTH_URL`
 * (`api/auth/register`, `api/auth/forgot-password`, `api/tenant/invitations`),
 * masing-masing dengan `?? new URL(request.url).origin` sebagai jalan mundur.
 * Menambah `NEXT_PUBLIC_SITE_URL` di sebelahnya berarti dua sumber untuk satu
 * pertanyaan — dan pada hari keduanya berbeda, tautan di surel dan tautan
 * kanonik di HTML akan menunjuk ke host yang berlainan tanpa ada yang gagal.
 *
 * ⚠ Jalan mundur `request.url` TIDAK tersedia di sini. `generateMetadata`,
 * `sitemap.ts`, dan `robots.ts` tidak menerima request, jadi satu-satunya
 * sumbernya adalah lingkungan. Bila `AUTH_URL` kosong — yaitu pengembangan
 * lokal, tempat `.env.example` sengaja membiarkannya terkomentar — nilainya
 * jatuh ke `localhost:3000`, yang sama dengan bawaan Next. Itu benar untuk
 * pengembangan dan tidak pernah benar di produksi; `scripts/setup-production.sh`
 * sudah memperingatkan `AUTH_URL` yang masih menunjuk localhost.
 */

/** Bawaan pengembangan — sama dengan bawaan `next dev`. */
const LOKAL = "http://localhost:3000";

/**
 * Alamat publik tanpa garis miring akhir, selalu sebuah `URL` yang sah.
 *
 * `AUTH_URL` yang tidak bisa diurai diperlakukan seperti kosong, bukan
 * dilempar: metadata yang salah tidak boleh menjatuhkan halaman pemasaran.
 */
export function publicAppUrl(): URL {
  const mentah = process.env.AUTH_URL?.trim().replace(/\/$/, "");
  if (!mentah) return new URL(LOKAL);
  try {
    return new URL(mentah);
  } catch {
    return new URL(LOKAL);
  }
}
