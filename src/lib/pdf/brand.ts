/**
 * Warna merek untuk DOKUMEN CETAK — satu sumber untuk delapan pembangun PDF.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Sebelum berkas ini, warna kop tabel ditulis sebagai angka RGB telanjang di
 * masing-masing pembangun, dan hasilnya BUKAN satu identitas melainkan enam:
 * laporan keuangan biru tua #1E40AF, laporan kas biru lain #2563EB, kontrak
 * biru ketiga #2980B9 dengan tabel pembayaran hijau, faktur & retur UNGU
 * #8E44AD, surat jalan abu batu #2C3E50. Empat di antaranya adalah palet "Flat
 * UI" klasik — jejak salin-tempel, bukan keputusan desain.
 *
 * Semua dokumen itu keluar ke pihak yang sama: pelanggan, pemasok, bank. Satu
 * perusahaan yang mengirim faktur ungu dan surat jalan abu terlihat seperti dua
 * perusahaan.
 *
 * ══ KENAPA BUKAN `colorPrimary` LAYAR ══════════════════════════════════════
 * Merek aplikasi kini bawaan Ant Design, `#1677FF`. Angka itu TIDAK dipakai di
 * sini: teks putih di atasnya hanya **4,10:1**, di bawah ambang 4,5:1 — dan
 * kop tabel cetak memakai fontSize 8–9, ukuran paling kecil yang ada. Kertas
 * juga tak punya tema gelap sebagai pelarian, dan cetak laser hitam-putih
 * menurunkan kontrasnya lagi.
 *
 * Karena itu cetakan memakai anak tangga yang lebih gelap dari palet AntD yang
 * SAMA — bukan warna karangan, bukan merek lama yang diselundupkan kembali.
 * Pola yang identik dengan token uang & teks tautan di layar: identitas AntD
 * dipertahankan, yang ditolak hanyalah asumsi bahwa anak tangga ke-6 layak
 * memikul teks kecil.
 *
 * Rasio dihitung dengan rumus luminансi relatif WCAG terhadap teks putih.
 */

/**
 * Kop tabel dokumen. AntD **blue-7** `#0958D9` — **6,16:1** dengan teks putih.
 *
 * (Perbandingan: `#1677FF` bawaan 4,10:1 GAGAL · `#1E40AF` merek lama 8,72:1 ·
 * `#003A8C` blue-8 10,59:1, lolos tapi nyaris hitam di cetak abu-abu.)
 */
export const PRINT_BRAND: [number, number, number] = [9, 88, 217];

/**
 * Kop tabel PEMBAYARAN pada kontrak & faktur. AntD **green-8** `#237804` —
 * **5,59:1** dengan teks putih.
 *
 * Hijau di sini bukan hiasan: ia semantik uang masuk yang sama dengan layar,
 * dan satu-satunya tempat dokumen boleh menyimpang dari warna merek. Yang
 * dipakai sebelumnya `#27AE60` hanya **2,87:1** — gagal telak, dan kegagalan
 * itu tidak pernah terlihat karena tak ada yang mengukurnya.
 */
export const PRINT_MONEY_IN: [number, number, number] = [35, 120, 4];
