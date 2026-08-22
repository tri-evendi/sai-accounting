/**
 * `/sitemap.xml` — halaman yang boleh ditemukan orang tanpa akun.
 *
 * ══ DAFTARNYA DITURUNKAN, TIDAK DIKETIK ════════════════════════════════════
 * Pohon dokumentasi datang dari `DOC_INDEX`, registri yang sama yang menyusun
 * navigasi dan merender halamannya. Mengetik ulang jalurnya di sini berarti
 * peta situs akan basi pada dokumen berikutnya — dan basinya tidak berbunyi: ia
 * hanya berhenti menyebut halaman yang justru baru ditulis. Ini alasan yang
 * sama persis yang membuat `LandingModules` membaca `BUSINESS_MODULES`
 * ketimbang daftar di markup.
 *
 * ══ YANG SENGAJA TIDAK IKUT ════════════════════════════════════════════════
 * Setiap jalur PRA-AKUN yang bukan halaman untuk dibaca: `/login`, `/register`,
 * `/verify-email`, `/accept-invitation`, `/forgot-password`, `/reset-password`.
 * Semuanya publik di `proxy.ts` karena harus bisa dibuka tanpa sesi, tetapi tak
 * satu pun punya isi yang layak muncul di hasil pencarian — `/register` yang
 * terindeks hanya memberi orang formulir tanpa halaman yang menjelaskannya,
 * yaitu persis keadaan yang halaman pendaratan dibuat untuk mengakhiri.
 *
 * ⚠ TANPA `lastModified`. Nilai yang jujur harus datang dari waktu ubah berkas
 * dokumennya, dan `DOC_INDEX` tidak menyimpannya; mengarang `new Date()` di
 * setiap render justru memberi tahu perayap bahwa SEMUA halaman berubah setiap
 * kali peta ini diambil — sinyal yang salah, dan lebih buruk daripada diam.
 */
import type { MetadataRoute } from "next";

import { DOC_INDEX, docsPath } from "@/lib/docs";
import { publicAppUrl } from "@/lib/public-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const asal = publicAppUrl();
  const url = (jalur: string) => new URL(jalur, asal).toString();

  return [
    { url: url("/"), changeFrequency: "monthly", priority: 1 },
    /* `/pricing` (#399) — halaman harga berdiri sendiri; isinya katalog paket
       yang sama dengan seksi harga di `/`, tetapi dengan alamatnya sendiri
       supaya bisa ditemukan & dibagikan. */
    { url: url("/pricing"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/docs"), changeFrequency: "monthly", priority: 0.6 },
    ...DOC_INDEX.map((doc) => ({
      url: url(docsPath(doc.slug)),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    { url: url("/terms"), changeFrequency: "yearly", priority: 0.3 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
