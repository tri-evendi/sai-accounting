/**
 * LAMBANG PRODUK — geometrinya, satu berkas, semua permukaan.
 *
 * ══ MASALAH YANG DITUTUPNYA: SATU PRODUK, TIGA LAMBANG ═════════════════════
 * Sebelum berkas ini, "logo SAI" adalah tiga gambar berbeda yang tidak satu pun
 * tahu keberadaan yang lain:
 *
 *   | Di mana                                   | Yang digambar            | Warna     |
 *   |-------------------------------------------|--------------------------|-----------|
 *   | `BrandMark` (sidebar, masuk, pendaratan)  | buku besar + punggung    | navy      |
 *   | `favicon.ico`, `apple-icon`, `icons/*`    | **diagram batang**       | biru AntD |
 *   | `opengraph-image`                         | **huruf "S"**            | navy      |
 *
 * Yang paling sering dilihat orang justru yang paling menyimpang: ikon tab,
 * ikon layar depan, dan ikon "pasang aplikasi" semuanya diagram batang dengan
 * warna merek LAMA — PNG yang dikomit sekali pada #471 lalu tidak pernah ikut
 * berubah ketika mereknya berubah, sebab tidak ada apa pun yang gagal kalau ia
 * tertinggal. Pratinjau WhatsApp menampilkan huruf awal produk, yang bukan
 * lambang melainkan penggantinya.
 *
 * Satu produk dengan tiga lambang tidak terbaca sebagai tiga pilihan desain; ia
 * terbaca sebagai tiga produk — dan pada ikon layar depan, sebagai aplikasi
 * yang salah dibuka.
 *
 * Berkas ini sumber tunggalnya: komponen React, kartu pratinjau sosial, dan
 * generator ikon raster ketiganya membaca `BRAND_MARK_PATH` yang sama. Tidak
 * ada jalan untuk menggambar lambang keempat tanpa menyentuh berkas ini.
 *
 * ══ TENTANG GAMBARNYA ══════════════════════════════════════════════════════
 * Buku besar dilihat dari depan: satu bidang pejal dengan punggung terpotong di
 * kiri. Bentuk PEJAL, bukan garis — keputusan yang sudah dibayar sekali dan
 * tidak diulang di sini: dua rancangan bergaris (tiga batang debit/kredit/
 * jumlah, dan akun-T) gagal pada 16px, yang kedua bahkan melebur menjadi "₮",
 * lambang Tugrik Mongolia.
 *
 * **Yang berubah pada perombakan ini, dan alasannya diukur, bukan dirasa:**
 * punggungnya menebal dari **1,8 → 2,8 unit** pada kanvas 24 unit. Pada favicon
 * 16px glif berdiri selebar ~11px, jadi satu unit ≈ 0,46px: punggung lama jatuh
 * di **0,8px** — di bawah satu piksel, sehingga ia dirender sebagai semburat
 * abu alih-alih celah, dan lambangnya terbaca sebagai kotak pejal tanpa
 * punggung. Punggung baru mendarat di **1,3px**: satu kolom piksel penuh.
 *
 * Empat rancangan lain dicoba dengan cara yang sama — dirender 16/20/24/32/64px
 * lalu DILIHAT, bukan dinilai dari kode — dan semuanya ditolak:
 *   • **dua buku bertumpuk** (yang paling tepat maknanya: beberapa PT, satu
 *     akun) menuntut parit antar-buku ≥3 unit untuk selamat di 16px, dan pada
 *     lebar itu buku depannya kehilangan punggungnya sendiri. Di 16px hasilnya
 *     gumpalan, bukan dua buku;
 *   • **sudut kanan-atas dipotong** terbaca sebagai ikon "berkas" generik —
 *     dokumen berlipat sudut, bukan buku besar;
 *   • **undak di kanan-atas** terbaca seperti lambang yang rusak dirender;
 *   • **garis-garis halaman** persis mengulangi kegagalan yang sudah tercatat:
 *     hilang di bawah 24px.
 *
 * Sengaja geometri sendiri, bukan ikon dari set ikon: ikon adalah kosakata
 * ANTARMUKA (MASTER.md §Ikon), dan meminjam satu di antaranya sebagai lambang
 * produk berarti lambang itu akan muncul lagi di tengah layar sebagai tombol.
 *
 * Ini lambang buatan pengembang, bukan karya perancang merek. Bila kelak ada
 * berkas resmi, yang diganti **hanya `BRAND_MARK_PATH` di bawah** — dan karena
 * ketiga permukaan membacanya dari sini, penggantian itu ikut sampai ke ikon
 * tab, ikon layar depan, dan kartu pratinjau tanpa ada yang perlu diingat.
 */

/** Kanvas glif. Semua angka path di bawah berada di dalamnya. */
export const BRAND_MARK_VIEWBOX = "0 0 24 24";

/**
 * Satu path, dua subpath, `evenodd` — bukan dua persegi bertumpuk.
 *
 * Punggung buku adalah LUBANG yang ditembus warna di belakangnya, jadi lambang
 * ini tidak perlu tahu warna latarnya dan tetap benar di atas permukaan apa
 * pun. Cara lain (persegi kedua berwarna latar) akan menuntut hex mentah —
 * ditolak penjaga token ESLint (issue #54) — dan akan salah begitu lambangnya
 * dipakai di atas bidang yang bukan warna itu.
 */
export const BRAND_MARK_PATH =
  "M6.5 3.5H17.5A2.5 2.5 0 0 1 20 6V18A2.5 2.5 0 0 1 17.5 20.5H6.5A2.5 2.5 0 0 1 4 18V6A2.5 2.5 0 0 1 6.5 3.5ZM8.2 3.5H11V20.5H8.2Z";

export interface BrandMarkSvgOptions {
  /** Sisi kotak, piksel. */
  size: number;
  /** Warna kotak di belakang glif. */
  background: string;
  /** Warna glif. */
  foreground: string;
  /**
   * Seberapa besar glif terhadap kotaknya.
   *
   * Dua nilai yang dipakai, dan keduanya punya sebab:
   *   • **0,5** — di dalam aplikasi (`BrandMark`), di mana lambang berdiri di
   *     sebelah teks dan kotaknya ikut menjadi target sentuh;
   *   • **0,62** — ikon berdiri sendiri (tab, layar depan), yang tidak punya
   *     tetangga untuk diseimbangkan dan karenanya boleh lebih penuh.
   * Ikon `maskable` memakai nilainya sendiri — lihat generator.
   */
  glyphRatio?: number;
  /**
   * Radius sudut terhadap sisi kotak. `0` = kotak penuh (ikon maskable, yang
   * sudutnya memang dipotong sistem operasi dan tidak boleh dipotong dua kali).
   */
  radiusRatio?: number;
}

/**
 * Lambang sebagai string SVG — untuk yang BUKAN React.
 *
 * Dipakai generator ikon raster (`scripts/build-brand-icons.ts`). Komponen
 * React menggambar `<path>`-nya sendiri dari konstanta di atas: menyuntikkan
 * string SVG lewat `dangerouslySetInnerHTML` akan menukar pemeriksaan tipe JSX
 * dengan string yang hanya diperiksa saat dirender.
 */
export function brandMarkSvg({
  size,
  background,
  foreground,
  glyphRatio = 0.62,
  radiusRatio = 0.22,
}: BrandMarkSvgOptions): string {
  const radius = Math.round(size * radiusRatio);
  const glyph = Math.round(size * glyphRatio);
  const offset = Math.round((size - glyph) / 2);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>`,
    `<svg x="${offset}" y="${offset}" width="${glyph}" height="${glyph}" viewBox="${BRAND_MARK_VIEWBOX}">`,
    `<path fill="${foreground}" fill-rule="evenodd" clip-rule="evenodd" d="${BRAND_MARK_PATH}"/>`,
    `</svg></svg>`,
  ].join("");
}
