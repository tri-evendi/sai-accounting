/**
 * Viewport bersama kedua root layout (issue #471).
 *
 * Ditulis SEKALI dan diimpor dua kali, bukan disalin: sejak #399 ada dua root
 * layout (`(app)` dan `(marketing)`), dan warna bilah status yang berbeda
 * antara halaman pendaratan dan halaman bersesi adalah jenis penyimpangan yang
 * hanya terlihat oleh orang yang kebetulan berpindah di antara keduanya sambil
 * memakai aplikasi terpasang.
 */
import type { Viewport } from "next";

import { BRAND_HEX } from "@/lib/theme/antd-tokens";

export const viewport: Viewport = {
  /*
   * `maximumScale` sengaja TIDAK dipatok, dan `userScalable` tidak dimatikan.
   * Mengunci cubit-perbesar adalah cara termudah membuat aplikasi terasa
   * "seperti native" dan sekaligus cara termudah mengunci keluar pengguna yang
   * memang membutuhkannya untuk membaca. Sasaran #471 adalah "bisa dipakai di
   * 390px TANPA memperbesar" — itu tuntutan pada tata letaknya, bukan izin
   * untuk mencabut perbesarannya.
   */
  width: "device-width",
  initialScale: 1,
  /* Sama dengan `theme_color` manifest dan `colorPrimary` AntD. */
  themeColor: BRAND_HEX,
};
