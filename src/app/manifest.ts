/**
 * MANIFEST APLIKASI (issue #471) — "pasang ke layar depan".
 *
 * == Yang ini BUKAN ========================================================
 * Bukan aplikasi native (tidak ada dua basis kode untuk tiga layar) dan bukan
 * mode luring. Buku besar yang bisa DITULIS saat luring menuntut resolusi
 * konflik, dan itu masalah yang jauh lebih besar daripada yang dipecahkan di
 * sini. Karena itu tidak ada service worker sama sekali: sebuah service worker
 * yang menyinggahkan halaman buku besar akan menyajikan saldo BASI dengan
 * tampilan yang persis sama dengan saldo terkini — kegagalan paling mahal yang
 * bisa ditambahkan ke aplikasi akuntansi, dan ia tidak pernah tampil seperti
 * kegagalan.
 *
 * Yang didapat dari berkas ini cuma satu, dan memang hanya itu yang diminta:
 * ikon di layar depan yang membuka aplikasi tanpa bilah alamat peramban.
 *
 * == `start_url` sengaja "/" ================================================
 * Bukan sebuah dasbor. Rute buku besar berbentuk `/t/{tenant}/{perusahaan}/…`
 * dan sebuah manifest yang membekukan satu perusahaan ke ikon layar depan akan
 * salah untuk setiap orang yang memegang lebih dari satu PT — dan diam-diam
 * benar untuk yang memegang satu, sehingga cacatnya baru terlihat jauh
 * belakangan. `/` mengantar lewat penjaga sesi ke perusahaan yang benar.
 */
import type { MetadataRoute } from "next";

import { APP_NAME } from "@sai/core/constants";
import { APP_BACKGROUND_HEX, BRAND_HEX } from "@sai/ui/theme/antd-tokens";
import { brandMarkUrl, cachedBrandMark } from "@sai/platform/brand-assets";
import { platformDb } from "@sai/platform/platform-db";

/* Dinamis: ikonnya mengikuti logo produk yang diunggah di konsol (`/brand`). */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const unggahan = await cachedBrandMark({ platform: platformDb });
  return {
    name: APP_NAME,
    short_name: "SAI",
    description:
      "Pembukuan sederhana untuk usaha dagang dan jasa: kas, piutang, utang, persediaan, dan laporan keuangan.",
    start_url: "/",
    display: "standalone",
    background_color: APP_BACKGROUND_HEX,
    theme_color: BRAND_HEX,
    /* Light-first, sesuai MASTER.md — dan latar putih di layar pembuka membuat
       peralihan ke halaman pertama tidak berkedip. */
    orientation: "portrait-primary",
    /* Logo unggahan: satu ikon dengan ukuran aslinya, TANPA varian maskable —
       logo unggahan belum tentu punya area aman yang tahan dipotong peluncur. */
    icons: unggahan
      ? [{ src: brandMarkUrl(unggahan), sizes: `${unggahan.width}x${unggahan.height}`, type: unggahan.mimeType, purpose: "any" }]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          /*
           * Android memotong ikon dan hanya menjamin lingkaran 80% di tengah tetap
           * terlihat. Tanpa entri ini, ikon "any" dipakai apa adanya dan sudutnya
           * terpotong.
           */
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
  };
}
