/**
 * Ejaan pembeli yang MERUJUK PERUSAHAAN YANG SAMA.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * `scripts/link-contract-customers.ts` menjodohkan teks `contracts.buyer` ke
 * master pelanggan dengan aturan yang sengaja KAKU: entitas HTML dibuka, spasi
 * dirapatkan, huruf dikecilkan. Aturan itu tidak akan pernah dilonggarkan
 * sendiri, sebab setiap pelonggaran yang terdengar masuk akal ("abaikan tanda
 * baca", "abaikan Co./Ltd") juga mulai menyamakan perusahaan yang memang
 * berbeda — dan yang tergabung salah jauh lebih mahal daripada yang terpisah:
 * piutang dua pihak melebur menjadi satu tagihan, dan tak ada laporan yang akan
 * menyebutnya salah.
 *
 * Yang tersisa adalah selisih yang HANYA BISA DIPUTUSKAN MANUSIA. Di buku
 * `pt-sai`, satu importir tertulis dalam empat ejaan:
 *
 *      77 × Foshan Taste Import & Export Co., Ltd
 *      40 × Foshan Taste Import &amp; Export Co., Ltd    ← entitas HTML
 *       4 × Foshan Taste Import &amp; Export Co.,Ltd     ← tanpa spasi setelah koma
 *       1 × FOSHAN TASTE IMPORT & EXPORT                 ← tanpa "Co., Ltd"
 *
 * Dua yang pertama sudah disatukan aturan kaku itu. Dua sisanya tidak, dan
 * memang tidak boleh — "Co.,Ltd" versus "Co., Ltd" adalah selisih yang di
 * perusahaan lain bisa saja membedakan dua badan hukum. Berkas ini tempat
 * seseorang MENYATAKAN bahwa di kasus ini ia tidak membedakan apa pun.
 *
 * ══ CARA MEMBACANYA ════════════════════════════════════════════════════════
 * Dikunci per SLUG PERUSAHAAN. Nama pembeli milik satu buku; menyamakan ejaan
 * di buku A tidak boleh diam-diam berlaku di buku B, yang pelanggannya lain.
 *
 *     "<slug>": {
 *       "<nama kanonik — yang akan dibuat di master>": [
 *         "<ejaan lain yang menunjuk perusahaan yang sama>",
 *       ],
 *     }
 *
 * Nama kanonik ditulis PERSIS seperti yang diinginkan muncul di master
 * pelanggan; ia sendiri tidak perlu didaftar sebagai aliasnya sendiri.
 *
 * ══ APA YANG TIDAK DILAKUKAN BERKAS INI ════════════════════════════════════
 *  • TIDAK mengubah teks `contracts.buyer`. Itu snapshot dokumen — yang salah
 *    cetak di kontrak yang sudah ditandatangani tetap tercetak begitu. Yang
 *    disatukan adalah TAUTANNYA, sehingga keempat ejaan menunjuk satu pelanggan.
 *  • TIDAK berlaku pada migrasi 0057. Migrasi berjalan sendiri tanpa ditonton
 *    siapa pun dan hanya boleh melakukan yang paling sedikit mengejutkan; berkas
 *    ini dibaca skrip yang menunggu bendera `--tautkan` dari manusia.
 *  • TIDAK menebak. Alias yang tidak cocok ke satu baris pun DILAPORKAN skrip,
 *    supaya berkas ini tidak diam-diam membusuk saat datanya dibersihkan.
 *
 * Entri baru wajib membawa alasannya. "Kelihatannya sama" bukan alasan; yang
 * dituntut adalah bukti bahwa keduanya memang satu lawan transaksi.
 */

export type ContractBuyerAliases = Record<string, Record<string, string[]>>;

export const CONTRACT_BUYER_ALIASES: ContractBuyerAliases = {
  /**
   * PT SAI — buku ekspor rempah. Seluruh pembelinya importir Tiongkok, dan
   * ejaannya berasal dari impor warisan yang tidak pernah dinormalkan.
   */
  "pt-sai": {
    /*
     * Satu importir, empat ejaan. Buktinya dibaca dari buku `pt-sai`
     * (2026-08-27), bukan dari kemiripan namanya saja:
     *
     *   ejaan                                        kontrak  rentang tanggal
     *   Foshan Taste Import & Export Co., Ltd            77    2021-08 → 2023-09
     *   Foshan Taste Import &amp; Export Co., Ltd        40    2021-07 → 2024-10
     *   Foshan Taste Import &amp; Export Co.,Ltd          4    2024-11 → 2025-02
     *   FOSHAN TASTE IMPORT & EXPORT                      1    2025-03
     *
     * Yang menentukan adalah KOLOM LAIN: keempatnya menyebut consignee
     * `Foshan Taste Import & Export`. Itu bukti dari luar teks pembelinya
     * sendiri, jadi ia tidak melingkar. (Kelompok 40 juga memuat consignee lain
     * — wajar, consignee bukan pembeli.)
     *
     * Rentang tanggalnya menguatkan: dua ejaan pertama berjalan bersamaan
     * 2021–2023 (satu pembeli yang ditulis dua cara), lalu ejaannya bergeser
     * sekali di akhir 2024 dan sekali lagi di 2025 — pola teks yang menua,
     * bukan tiga lawan transaksi yang datang silih berganti.
     *
     * Nama kanoniknya memakai bentuk yang paling banyak dipakai di dokumen
     * (77 kontrak), bukan yang paling rapi menurut selera.
     */
    "Foshan Taste Import & Export Co., Ltd": [
      /*
       * Tanpa spasi setelah koma (4 kontrak). Ditulis dalam DUA bentuk ampersand
       * dan itu BUKAN dua perusahaan: `kunciPembeli` membuka entitas HTML lebih
       * dulu, jadi keduanya menjadi kunci yang sama. Yang kedua ditulis supaya
       * pembaca berikutnya tidak perlu tahu urutan itu untuk yakin `&amp;`
       * memang tertangani — empat baris di sini menghasilkan tiga kunci.
       */
      "Foshan Taste Import &amp; Export Co.,Ltd",
      "Foshan Taste Import & Export Co.,Ltd",
      // Tanpa akhiran badan hukum (1 kontrak).
      "FOSHAN TASTE IMPORT & EXPORT",
    ],
  },
};
