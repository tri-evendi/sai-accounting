/**
 * `/robots.txt` — apa yang boleh dirayapi.
 *
 * ══ KENAPA DAFTAR LARANGAN, BUKAN `Allow: /` TELANJANG ═════════════════════
 * Aplikasi ini satu host untuk dua dunia: satu halaman pemasaran publik dan
 * seluruh app internal bertenant di belakang penjaga. Perayap tidak akan pernah
 * BISA membaca yang kedua — proxy memantulkannya ke `/login` — tetapi ia tetap
 * akan MENCOBA, dan setiap percobaan adalah render dinamis dengan panggilan
 * `auth()` di dalamnya. Melarang di depan lebih murah daripada memantulkan
 * ribuan kali.
 *
 * Jalur yang dilarang di bawah sengaja mencerminkan `isPublicPath` di
 * `src/proxy.ts` DARI SISI SEBALIKNYA: yang publik di sana, dirayapi di sini.
 * Keduanya harus bergerak bersama — halaman publik baru yang ditambahkan di
 * proxy tetapi tidak di sini hanya kehilangan perayapan (tidak berbahaya),
 * sedangkan jalur internal baru yang lupa dilarang di sini akan dicoba perayap
 * (boros, tapi tetap aman karena penjaganya proxy, bukan berkas ini).
 *
 * ⚠ Berkas ini BUKAN kontrol akses. `robots.txt` adalah permintaan sopan yang
 * dipatuhi perayap yang beritikad baik dan diabaikan yang tidak. Yang benar-
 * benar menjaga app internal tetap `src/proxy.ts` + penjaga izin per halaman.
 */
import type { MetadataRoute } from "next";

import { publicAppUrl } from "@/lib/public-url";

export default function robots(): MetadataRoute.Robots {
  const asal = publicAppUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/t/", // seluruh app bertenant
        "/operator",
        "/platform",
        "/companies",
        "/login",
        "/register",
        "/verify-email",
        "/forgot-password",
        "/reset-password",
        "/accept-invitation",
        "/select-company",
        "/unlock",
        "/change-password",
        "/setup-required",
        "/feature-inactive",
      ],
    },
    sitemap: new URL("/sitemap.xml", asal).toString(),
  };
}
