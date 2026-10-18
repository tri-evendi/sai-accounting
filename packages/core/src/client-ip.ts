/**
 * ALAMAT KLIEN — satu pembaca untuk seluruh aplikasi (issue #372).
 *
 * ══ KENAPA BERKAS INI ADA ═══════════════════════════════════════════════════
 * Logika di bawah lahir di `lib/operator/plane.ts` (#162), untuk daftar IP
 * konsol operator. Ia tidak pernah benar-benar milik bidang operator: DELAPAN
 * permukaan PELANGGAN membaca alamat klien sendiri, semuanya dengan bentuk yang
 * sama —
 *
 *     request.headers.get("x-forwarded-for")?.split(",")[0]
 *
 * — yaitu entri paling KIRI, yang justru bisa diketik klien. Lima di antaranya
 * adalah kunci pembatas laju PER-IP endpoint publik (`/register`,
 * `/forgot-password`, `/reset-password`, verifikasi surel, penerimaan
 * undangan), satu formulir kontak pendaratan, dan dua jejak audit.
 *
 * Akibatnya bukan teoretis: pembatas laju persisten yang dibangun #138 justru
 * untuk selamat dari restart dan terbagi antar-instance BISA DILEWATI dengan
 * satu header. Penyerang mengirim `X-Forwarded-For: <acak>` yang berbeda pada
 * setiap permintaan, dan setiap permintaan tampak datang dari alamat baru —
 * penghitung per-IP tidak pernah menyentuh batasnya. Jejak auditnya pun mencatat
 * alamat pilihan penyerang, sebagai fakta.
 *
 * Karena itu pembacanya dipindahkan ke sini dan dipakai bersama. Salinan
 * kesembilan yang "hampir benar" adalah cara lubang ini lahir pertama kali.
 *
 * ══ NAMA ENVIRONMENT-NYA TIDAK BERUBAH ══════════════════════════════════════
 * Tetap `OPERATOR_TRUSTED_PROXY_HOPS`, walau pemakainya kini bukan hanya
 * operator. Ia menggambarkan TOPOLOGI PEMASANGAN — berapa proxy tepercaya
 * berdiri di depan aplikasi — dan menggantinya berarti setiap pemasangan yang
 * sudah berjalan diam-diam kembali ke bawaan pada hari deploy berikutnya, tepat
 * pada nilai yang menentukan entri mana yang dipercaya. Dokumentasinya
 * (`docker-compose.yml`) sudah menjelaskan artinya dengan benar.
 *
 * MURNI & AMAN-EDGE: tanpa Prisma, tanpa `server-only` — `proxy.ts` berjalan di
 * runtime Edge dan mengimpornya, sama seperti sebelumnya.
 */

/** Bawaan: satu proxy tepercaya di depan aplikasi — Traefik, dan hanya itu. */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Berapa banyak proxy TEPERCAYA yang berdiri di depan aplikasi
 * (`OPERATOR_TRUSTED_PROXY_HOPS`). Hari ini 1: Traefik. Menaruh Cloudflare,
 * CDN, atau load-balancer kedua di depannya menjadikannya 2 — dan angka itu
 * HARUS diperbarui bersamaan, sebab ia yang menentukan entri mana di
 * `x-forwarded-for` yang benar-benar ditulis oleh mesin milik kita.
 *
 * Nilai yang tidak masuk akal (bukan bilangan bulat, < 1) jatuh ke bawaan,
 * bukan ke 0: hop 0 berarti mempercayai entri paling kanan yang ditulis
 * KLIEN — persis lubang yang issue #162 tutup.
 */
export function trustedProxyHops(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.OPERATOR_TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOPS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_TRUSTED_PROXY_HOPS;
  return value;
}

/**
 * Alamat klien dari header proxy — DIHITUNG DARI KANAN (issue #162).
 *
 * ══ KENAPA BUKAN ENTRI PERTAMA ═════════════════════════════════════════════
 * `x-forwarded-for` bertambah dari KIRI ke KANAN: setiap proxy MENAMBAHKAN
 * alamat lawan bicaranya di ujung kanan. Entri paling kiri karena itu bukan
 * "IP klien" melainkan "apa pun yang mula-mula ada di header itu" — dan yang
 * mula-mula ada di sana bisa saja diketik klien sendiri.
 *
 * Sebelum #162 fungsi ini mengambil entri PERTAMA. Itu benar hanya selama
 * Traefik MENIMPA header kiriman klien alih-alih menambahinya — dan Traefik
 * menimpanya hanya selama `forwardedHeaders.trustedIPs` kosong. Begitu
 * seseorang mengisi `trustedIPs` (persis yang dilakukan orang saat menaruh
 * Cloudflare atau load-balancer kedua di depan), Traefik mulai
 * MEMPERTAHANKAN header kiriman klien — dan entri pertama menjadi teks
 * pilihan penyerang:
 *
 *     X-Forwarded-For: <ip-yang-diizinkan>
 *
 * Perubahan itu terjadi di berkas konfigurasi infrastruktur, jauh dari berkas
 * ini, dan tidak ada satu pun tes yang akan berubah warna karenanya. Karena
 * itu yang diperbaiki bukan konfigurasinya melainkan CARA MEMBACANYA: dengan
 * menghitung dari kanan, sampah yang ditambahkan klien di depan tidak pernah
 * terbaca, berapa pun banyaknya.
 *
 * Entri ke-`hops` dari kanan adalah yang ditulis proxy TERLUAR yang masih
 * kita percayai. Dengan satu Traefik (hops = 1) itu entri paling kanan —
 * satu-satunya yang Traefik sendiri tulis, dan satu-satunya yang klien tidak
 * bisa sentuh.
 *
 * ══ GAGAL-TERTUTUP ═════════════════════════════════════════════════════════
 * Rantai yang LEBIH PENDEK dari `hops` berarti permintaan ini tidak melewati
 * jalur yang kita kira — misalnya menembus langsung ke Traefik, melewati CDN
 * yang seharusnya di depan. Itu tidak ditebak: null → `ipAllowed` menolak.
 *
 * `x-real-ip` hanya dipakai bila `x-forwarded-for` TIDAK ADA sama sekali, dan
 * hanya saat hops = 1. Dengan proxy berlapis, `x-real-ip` yang ditulis proxy
 * terdekat berisi alamat proxy SEBELUMNYA, bukan alamat klien — memakainya di
 * situ berarti membandingkan daftar IP operator dengan IP milik CDN.
 */
export function clientIpFrom(
  headers: {
    get(name: string): string | null;
  },
  env: Record<string, string | undefined> = process.env
): string | null {
  const hops = trustedProxyHops(env);

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    // Rantai lebih pendek dari yang dikonfigurasi → JANGAN menebak.
    return entries[entries.length - hops] ?? null;
  }

  if (hops > 1) return null;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

