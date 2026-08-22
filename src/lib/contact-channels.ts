/**
 * KANAL KONTAK PEMASANGAN — surel & WhatsApp, dibaca dari environment (#398).
 *
 * ══ KENAPA SATU HELPER, BUKAN DUA `process.env` DI KOMPONEN ════════════════
 * `PLATFORM_CONTACT_EMAIL` sudah dibaca di tiga tempat (kartu paket rundingan,
 * jawaban FAQ dukungan, `lib/alert.ts`), dan setiap tempat menulis ulang
 * `?.trim()`-nya sendiri. Menambah kanal kedua dengan cara yang sama berarti
 * cara keempat dan kelima. Di sini keduanya dibaca sekali, dinormalkan sekali,
 * dan yang keluar sudah berbentuk siap pakai — alamat, dan URL `wa.me`.
 *
 * ══ TIDAK DIISI = TIDAK DIRENDER ═══════════════════════════════════════════
 * Keduanya opsional dan TANPA nilai bawaan. Kanal yang belum disetel tidak
 * pernah tampil sebagai tombol yang menuju ke mana pun — pola yang sama yang
 * dipakai jawaban FAQ dukungan (`landing-faq.tsx`: tanpa alamat, jawabannya
 * dokumentasi saja, bukan alamat karangan).
 *
 * ══ NOMOR YANG SALAH BENTUK = TIDAK DIRENDER, DAN DISUARAKAN ═══════════════
 * `wa.me` menuntut nomor internasional TANPA `+`, tanpa spasi, tanpa nol awal
 * (`62812…`, bukan `0812…` atau `+62 812…`). Nomor yang salah bentuk
 * menghasilkan tautan yang membuka WhatsApp lalu berkata "nomor tidak
 * ditemukan" — kegagalan yang baru ketahuan dari calon pelanggan. Karena itu
 * nomor yang tidak lolos `WHATSAPP_NUMBER_PATTERN` diperlakukan seperti tidak
 * diisi (gagal-tertutup), dan `scripts/check-env.mjs` menolaknya saat mulai,
 * supaya kesalahannya terbaca operator, bukan pengunjung.
 *
 * MURNI: tanpa Prisma, tanpa I/O — `env` bisa disuntik supaya bisa diuji.
 */

/**
 * Nomor internasional tanpa `+`: E.164 punya paling banyak 15 digit dan tidak
 * pernah diawali nol. Batas bawah 7 digit menolak nilai yang jelas bukan nomor
 * (mis. kode negara saja).
 */
export const WHATSAPP_NUMBER_PATTERN = /^[1-9]\d{6,14}$/;

/** Bentuk `wa.me` — tautan universal WhatsApp, membuka aplikasi atau web. */
export const whatsappUrl = (number: string): string => `https://wa.me/${number}`;

export interface ContactChannels {
  /** `PLATFORM_CONTACT_EMAIL`, sudah di-`trim`; `undefined` bila kosong. */
  email?: string;
  /** `https://wa.me/<nomor>` bila `PLATFORM_CONTACT_WHATSAPP` sah; `undefined` bila kosong/salah bentuk. */
  whatsappUrl?: string;
}

/** Nomor WhatsApp yang sah dari nilai environment mentah, atau `undefined`. */
export function parseWhatsappNumber(raw: string | undefined): string | undefined {
  const number = raw?.trim();
  if (!number || !WHATSAPP_NUMBER_PATTERN.test(number)) return undefined;
  return number;
}

/** Kanal yang BENAR-BENAR tersedia di pemasangan ini. */
export function contactChannels(
  env: Record<string, string | undefined> = process.env,
): ContactChannels {
  const email = env.PLATFORM_CONTACT_EMAIL?.trim() || undefined;
  const number = parseWhatsappNumber(env.PLATFORM_CONTACT_WHATSAPP);
  return {
    ...(email !== undefined ? { email } : {}),
    ...(number !== undefined ? { whatsappUrl: whatsappUrl(number) } : {}),
  };
}
