/**
 * ISI dokumentasi sistem (issue #300) — prosa, bahasa Indonesia.
 *
 * ══ Kenapa terpisah dari `lib/docs.ts` ═════════════════════════════════════
 * `lib/docs.ts` ikut ke bundel PERAMBAN (menu Bantuan memutuskan tautan
 * kontekstualnya dari `usePathname()`). Prosa tidak dibutuhkan untuk keputusan
 * itu, dan berkas ini karena itu hanya diimpor halaman servernya. Yang menahan
 * keduanya tetap sejalan bukan disiplin melainkan `tsc`: `DOC_BLOCKS` bertipe
 * `Record<DocSlug, …>`, jadi halaman tanpa isi dan isi tanpa halaman sama-sama
 * ditolak sebelum dijalankan.
 *
 * ══ Aturan menulis di sini ═════════════════════════════════════════════════
 *  • **Kenapa dulu, langkah sesudahnya** (keputusan 5 issue #300, direvisi
 *    Okt 2026). Setiap halaman tetap membuka dengan alasan; langkah-langkah
 *    dan tangkapan layar menyusul di bawahnya. Tangkapan layar BOLEH — lewat
 *    blok `gambar`, dan HANYA berkas yang dibangkitkan ulang oleh
 *    `bun run docs:screenshots` (lihat blok `gambar` di bawah).
 *  • **Jangan menulis ulang definisi istilah.** Kamus (`lib/labels.ts`, #21/#1)
 *    sudah memilikinya — pakai blok `istilah`, yang MEMBACANYA. Definisi yang
 *    disalin ke sini ditolak `tests/docs.test.ts`.
 *  • **Jangan mengetik daftar peran/izin.** Blok `matriks-izin` membangkitkan
 *    tabelnya dari `PERMISSION_ROLES`, dan halamannya menyebut dirinya BAWAAN
 *    yang bisa ditimpa (keputusan 4).
 *  • **Bahasa Indonesia**, dan pilihan itu ditampilkan kepada pembaca ber-`en`/
 *    `zh` sebagai pemberitahuan dalam bahasanya sendiri (keputusan 3), bukan
 *    dibiarkan terbaca sebagai terjemahan yang tertinggal.
 */

import type { NamaDiagram } from "@/components/docs/docs-figures";
import type { DocSlug } from "@/lib/docs";
import type { TermKey } from "@sai/core/labels";

/**
 * Blok prosa. Sengaja data bertipe, bukan Markdown:
 *
 *  • tanpa dependensi baru — repo ini tidak punya parser Markdown, dan menambah
 *    satu demi sepuluh halaman adalah harga yang salah;
 *  • `tsc` ikut memeriksa: `TermKey` yang salah ketik ditolak sebelum ia menjadi
 *    tautan mati, dan jenis blok baru tanpa cabang perender ditolak lewat
 *    `never` di `components/docs/doc-body.tsx`;
 *  • penjaga bisa MEMBACANYA tanpa merender apa pun.
 */
export type DocBlock =
  /** Satu paragraf. Satu gagasan; kalau butuh dua, tulis dua blok. */
  | { kind: "paragraf"; teks: string }
  /** Daftar berpoin — hal yang setara, bukan langkah berurutan. */
  | { kind: "poin"; butir: readonly string[] }
  /**
   * Daftar BERURUTAN — dikerjakan dari atas ke bawah, dan urutannya berarti.
   *
   * Sampai #453 urutan terpaksa ditulis sebagai `poin`, dan itu berbohong: daftar
   * berpoin menyatakan hal-hal yang SETARA. Pembaca yang menganggap butir kedua
   * bisa dikerjakan lebih dulu tidak sedang salah membaca — ia membaca persis
   * yang ditulis bentuknya.
   */
  | { kind: "langkah"; butir: readonly string[] }
  /** Sub-judul di dalam halaman; jangkarnya diturunkan dari judulnya. */
  | { kind: "sub"; judul: string }
  /**
   * Kotak "yang harus diketahui sebelum melanjutkan".
   *
   * `nada` bawaannya `info`. `peringatan` untuk yang MERUGIKAN kalau
   * dilewatkan — bukan untuk yang penting, sebab semua yang ditulis di sini
   * penting dan kotak yang selalu oranye berhenti berarti apa-apa. Nadanya
   * dibedakan tepi + latar DAN kata penanda di depannya: warna tidak pernah
   * menjadi penanda tunggal (MASTER.md Prinsip Inti #2).
   */
  | { kind: "catatan"; teks: string; nada?: "info" | "peringatan" }
  /**
   * Istilah dari kamus (#21/#1). Definisinya TIDAK ditulis di sini — perender
   * membacanya dari `TERMS` di `lib/labels.ts`, sumber yang sama yang dipakai
   * `<TermTooltip>` dan halaman `/glossary`.
   */
  | { kind: "istilah"; kunci: readonly TermKey[] }
  /** Matriks izin BAWAAN, dibangkitkan saat render (keputusan 4). */
  | { kind: "matriks-izin" }
  /**
   * Cuplikan yang harus dibaca KARAKTER PER KARAKTER — perintah, alamat,
   * jawaban JSON. Dirender `<pre>` bertulisan monospace: sebuah `curl` yang
   * dibungkus paragraf akan ikut dirapikan penyeimbang baris, dan tanda kutip
   * yang berpindah baris adalah perintah yang gagal ditempel.
   *
   * `bahasa` hanya untuk pembaca manusia (label di sudut kotak); tidak ada
   * pewarna sintaks di repo ini, dan menambahkannya demi empat cuplikan adalah
   * harga yang salah — alasan yang sama yang menolak parser Markdown di atas.
   */
  | { kind: "kode"; bahasa: string; teks: string }
  /**
   * Daftar endpoint `/api/v1`, DIBANGKITKAN dari `lib/api-v1-spec.ts` saat
   * render — alasan yang sama dengan `matriks-izin`: daftar endpoint yang
   * diketik ke dalam prosa adalah daftar yang mulai berbohong pada endpoint
   * berikutnya, dan penjaga `tests/api-v1-spec.test.ts` sudah menuntut
   * spesifikasi itu sejalan dengan route-nya.
   */
  | { kind: "endpoint-api" }
  /**
   * Riwayat rilis, DIBANGKITKAN dari `lib/changelog.ts` saat render — alasan
   * yang sama dengan `matriks-izin` dan `endpoint-api`. Daftar versi yang
   * diketik ke dalam prosa adalah daftar yang mulai berbohong pada rilis
   * berikutnya, dan riwayat rilis adalah kasus terburuknya: ia SELALU salah
   * satu rilis setelah ditulis.
   */
  | { kind: "riwayat-rilis" }
  /**
   * Gambar MEKANISME — bukan tangkapan layar.
   *
   * ⚠ Aturan "tanpa tangkapan layar" (keputusan 5, #300) TIDAK dilanggar di
   * sini, dan bedanya bukan teknis: tangkapan layar menggambarkan TOMBOL, yang
   * berpindah setiap rilis dan membuat dokumennya berbohong tanpa satu baris
   * pun disunting. Gambar di sini menggambarkan MESIN — dokumen menjadi jurnal
   * menjadi laporan — dan mesin itu tidak berubah karena tata letak halaman
   * berubah.
   *
   * `nama` memilih gambarnya di `components/docs/docs-figures.tsx`; `tsc`
   * menolak nama yang tidak punya gambar. `keterangan` adalah PROSA dan karena
   * itu tinggal di sini bersama prosa lainnya — ia yang dibaca orang yang tidak
   * bisa melihat gambarnya, jadi ia harus berdiri sendiri sebagai kalimat.
   */
  | { kind: "diagram"; nama: NamaDiagram; keterangan: string }
  /**
   * TANGKAPAN LAYAR — gambar layar aplikasi yang sesungguhnya.
   *
   * ══ Kenapa keputusan 5 (#300) direvisi, dan apa yang menahan risikonya ══
   * Keputusan 5 menolak tangkapan layar karena tangkapan yang DIBUAT TANGAN
   * menua diam-diam: tombolnya pindah, gambarnya tidak. Panduan bergambar
   * (Okt 2026) membalik alasan itu dengan dua pagar, bukan dengan disiplin:
   *
   *  • setiap berkas DIBANGKITKAN oleh `scripts/docs-screenshots.ts`
   *    (`bun run docs:screenshots`) dari aplikasi yang berjalan dengan data
   *    demo fiktif — tangkapan yang basi diperbarui dengan satu perintah,
   *    bukan dengan menyunting gambar;
   *  • `tests/docs-screenshots.test.ts` menjaga TIGA ARAH: setiap `berkas`
   *    yang dirujuk di sini ada di `public/docs/screenshots/`, setiap berkas di
   *    sana dirujuk halaman mana pun, dan setiap berkas punya resep tangkapnya
   *    di skrip — tidak ada gambar yatim yang tak bisa dibuat ulang.
   *
   * `berkas` adalah `<bagian>/<nama>` tanpa ekstensi, menunjuk
   * `public/docs/screenshots/<bagian>/<nama>.webp`. `alt` WAJIB dan berdiri
   * sendiri sebagai kalimat (pembaca layar tidak melihat gambarnya);
   * `keterangan` opsional, tampil di bawah gambar dan ikut terindeks.
   */
  | { kind: "gambar"; berkas: string; alt: string; keterangan?: string }
  /**
   * Rujukan ke halaman panduan lain — "Lihat juga". Slug-nya bertipe
   * `DocSlug`, jadi tautan ke halaman yang tidak ada ditolak `tsc`.
   */
  | { kind: "lihat-juga"; slug: readonly DocSlug[] };

/**
 * Ukuran SETIAP tangkapan layar — satu viewport tetap (1440×900, tema terang,
 * bahasa `id`). Tetap supaya `width`/`height` gambar bisa ditulis tanpa
 * membaca berkasnya saat render (tata letak tidak melompat), dan supaya
 * penjaga bisa menolak berkas yang ditangkap dengan ukuran lain.
 */
export const UKURAN_TANGKAPAN = { lebar: 1440, tinggi: 900 } as const;

/** Alamat publik satu tangkapan layar. */
export function alamatTangkapan(berkas: string): string {
  return `/docs/screenshots/${berkas}.webp`;
}

const MESIN_AKUNTANSI: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Aplikasi ini punya dua lapisan, dan hanya satu yang Anda lihat. Di permukaan ada formulir bahasa tugas: “Catat Penjualan”, “Terima Uang”, “Kurangi Stok”. Di bawahnya ada satu mesin akuntansi baku yang menerjemahkan setiap formulir itu menjadi jurnal — catatan berpasangan yang jumlah kiri dan kanannya selalu sama. Itulah arti “simple surface, standard engine”: permukaannya boleh ramah, tetapi angka yang keluar harus sama dengan angka yang diminta akuntan publik.",
    },
    {
      kind: "paragraf",
      teks:
        "Konsekuensinya nyata bagi Anda: satu formulir bisa menyentuh beberapa akun sekaligus, dan Anda tidak perlu memilih akunnya. Faktur penjualan senilai Rp 100 juta dengan PPN 11% tidak menambah “pendapatan Rp 111 juta” — ia menambah piutang Rp 111 juta, pendapatan Rp 100 juta, dan utang PPN Rp 11 juta. Sebelas juta itu bukan uang perusahaan; ia dititipkan untuk negara. Mesinnya yang tahu, bukan Anda.",
    },
    {
      kind: "diagram",
      nama: "alur-jurnal",
      keterangan:
        "Satu faktur menjadi satu jurnal berpasangan — tiga akun sekaligus — dan laporan mana pun dibaca dari jurnal itu, bukan dari fakturnya. Angka di gambar adalah contoh di paragraf sebelumnya.",
    },
    { kind: "sub", judul: "Kenapa jurnal dibalik, bukan dihapus" },
    {
      kind: "paragraf",
      teks:
        "Kalau sebuah transaksi salah, aplikasi ini tidak menghapus jurnalnya. Ia membuat jurnal BARU yang isinya kebalikan — debit menjadi kredit, kredit menjadi debit — sehingga saldonya kembali seperti sebelum transaksi itu ada. Jurnal aslinya tetap terbaca, dan pembatalnya tercatat di sebelahnya.",
    },
    {
      kind: "paragraf",
      teks:
        "Setiap laporan yang pernah Anda cetak, kirim ke bank, atau lampirkan ke SPT dihitung dari jurnal pada hari itu. Kalau jurnalnya bisa hilang, laporan yang sudah keluar kehilangan sumbernya, dan angka yang Anda kirim bulan lalu tidak bisa lagi dibuktikan. Membalik menyimpan dua-duanya: yang pernah tercatat, dan yang berlaku sekarang.",
    },
    {
      kind: "poin",
      butir: [
        "Yang menghilang dari saldo adalah dampaknya, bukan catatannya.",
        "Tanggal jurnal pembalik adalah tanggal koreksinya, bukan tanggal transaksi aslinya — karena itulah laporan bulan lalu tidak berubah surut.",
        "Alasan pembatalan ikut disimpan; enam bulan kemudian ia satu-satunya yang bisa menjelaskan kenapa ada dua baris yang saling meniadakan.",
      ],
    },
    { kind: "sub", judul: "Daftar Akun bukan daftar kategori" },
    {
      kind: "paragraf",
      teks:
        "Daftar Akun (bagan akun) menentukan bentuk setiap laporan. Menambah akun berarti menambah baris di neraca atau laba/rugi; memindahkan sebuah akun ke tipe yang lain memindahkan angkanya antar-laporan. Karena itu halaman ini hanya terbuka untuk peran berakses penuh, dan hanya saat Mode Akuntan menyala. Kesalahan di sini tidak tampak sebagai kesalahan: hasilnya laporan yang wajar dengan angka di tempat yang salah.",
    },
  { kind: "sub", judul: "Melihat jurnal, buku besar, dan daftar akun" },
  {
    kind: "paragraf",
    teks:
      "Ketiga layar ini baru tampil saat Mode Akuntan Anda menyala. Catatan Transaksi (Jurnal Umum) memuat setiap jurnal — yang lahir otomatis dari formulir maupun yang diketik manual — dengan nomor, tanggal, tipe, dan totalnya.",
  },
  {
    kind: "gambar",
    berkas: "akuntansi/jurnal",
    alt: "Halaman Jurnal Umum berisi daftar jurnal contoh bertipe Penyesuaian, Penjualan, Kas/Bank, dan Pembelian beserta total rupiahnya.",
  },
  {
    kind: "langkah",
    butir: [
      "Untuk jurnal manual, tekan Jurnal Baru, isi baris debit dan kredit sampai seimbang, lalu Simpan Jurnal.",
      "Untuk membatalkan, buka jurnalnya dan tekan Balik Jurnal — jurnal pembalik bertanggal hari koreksi lahir di sebelahnya.",
    ],
  },
  {
    kind: "paragraf",
    teks:
      "Rincian per Akun (Buku Besar) menampilkan mutasi dan saldo berjalan satu akun untuk rentang tanggal yang Anda pilih, bisa disaring per pusat biaya. Daftar Akun (Akun Perkiraan) memuat kode, tipe, mata uang, dan saldo normal setiap akun; akun baru ditambahkan dengan Akun Baru atau diimpor dari Excel.",
  },
  {
    kind: "gambar",
    berkas: "akuntansi/buku-besar",
    alt: "Halaman Buku Besar dengan pilihan akun, rentang tanggal, dan pusat biaya, menunggu akun dipilih.",
  },
  {
    kind: "gambar",
    berkas: "akuntansi/daftar-akun",
    alt: "Halaman Akun Perkiraan berisi 43 akun bertingkat seperti Kas & Setara Kas, Kas Kecil, Bank, dan Piutang Usaha beserta tipe dan saldo normalnya.",
  },
    { kind: "istilah", kunci: ["jurnal", "buku_besar", "akun_perkiraan"] },
  ];

const PERIODE: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Menutup periode berarti menyatakan satu bulan SELESAI: sesudah itu tidak ada transaksi baru yang boleh mendarat di dalamnya, dan tidak ada transaksi lama di dalamnya yang boleh diubah. Aplikasi menolaknya di server, bukan menyembunyikan tombolnya — jadi penolakannya berlaku juga untuk impor, penyesuaian stok, dan setiap jalur yang belum terbayang saat halaman ini ditulis.",
    },
    {
      kind: "paragraf",
      teks:
        "Kenapa perlu: laporan bulanan diberikan kepada pihak luar — bank, pemegang saham, kantor pajak. Tanpa kunci periode, sebuah faktur yang disimpan hari ini dengan tanggal dua bulan lalu akan mengubah laporan yang sudah dikirim, tanpa satu pun tanda di layar. Biasanya bukan Anda yang menemukannya, melainkan orang yang membandingkan dua salinan laporan yang seharusnya sama.",
    },
    { kind: "sub", judul: "Kalau ternyata ada yang salah di bulan terkunci" },
    {
      kind: "paragraf",
      teks:
        "Jawabannya sama dengan jawaban akuntansi sejak dulu: koreksi dicatat di bulan BERJALAN, bukan disisipkan mundur. Anda membuat transaksi baru bertanggal hari ini yang membetulkan dampaknya. Laporan bulan lalu tetap seperti yang sudah dikirim; laporan bulan ini memuat koreksinya, dan selisihnya bisa dijelaskan karena ada barisnya.",
    },
    {
      kind: "catatan",
      teks:
        "Membuka kembali periode yang sudah dikunci memang mungkin, dan sengaja dibuat merepotkan: ia kewenangan peran berakses penuh dan tercatat di jejak audit. Kalau sebuah bulan perlu dibuka dua kali, biasanya yang bermasalah adalah waktu penutupannya, bukan bulannya.",
      nada: "peringatan",
    },
  { kind: "sub", judul: "Langkah menutup sebuah bulan" },
  {
    kind: "langkah",
    butir: [
      "Buka Bantuan & Pengaturan → Kunci Bulan (halamannya berjudul Tutup Periode).",
      "Tekan Tinjau pada bulan yang ingin ditutup. Ringkasan Periode memperlihatkan jumlah jurnal, total debit, total kredit, dan hasil pemeriksaan.",
      "Perbaiki setiap pemeriksaan bertanda Harus diperbaiki — jurnal yang tidak seimbang atau neraca saldo yang tidak seimbang menahan penutupan. Tanda Perlu dicek boleh dilewati setelah Anda yakin.",
      "Isi Catatan penutupan bila perlu, lalu tekan Tutup Periode dan konfirmasi.",
    ],
  },
  {
    kind: "gambar",
    berkas: "akuntansi/tutup-periode",
    alt: "Halaman Tutup Periode dengan daftar bulan berstatus Terbuka dan Ringkasan September berisi pemeriksaan jurnal seimbang, neraca saldo seimbang, saldo aset wajar, dan tombol Tutup Periode.",
    keterangan: "Pemeriksaan “Saldo aset wajar” di contoh ini menandai saldo bank negatif — perlu dicek, tetapi tidak menahan penutupan.",
  },
  {
    kind: "poin",
    butir: [
      "Bulan sebelumnya yang masih terbuka diberi peringatan: tutuplah berurutan.",
      "Buka Kembali Periode menuntut alasan (minimal lima karakter) dan tercatat di jejak audit.",
      "Halaman yang sama memuat Revaluasi saldo valas (jurnal akhir bulan yang dibalik otomatis tanggal 1) dan Tutup buku tahunan, yang butuh akun Laba Ditahan sudah dipetakan.",
    ],
  },
    { kind: "istilah", kunci: ["tutup_periode", "saldo_awal"] },
  ];

const PERSETUJUAN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Aturan Persetujuan menetapkan ambang: di atas nominal tertentu, sebuah dokumen tidak langsung berlaku. Ia masuk antrean dan menunggu peran tertentu memutuskannya. Ambang dan peran penyetujunya di-SNAPSHOT saat pengajuan dibuat, jadi mengubah aturan hari ini tidak mengubah siapa yang harus memutuskan pengajuan yang sudah berjalan.",
    },
    {
      kind: "paragraf",
      teks:
        "Yang tertahan adalah DAMPAKNYA, bukan pekerjaannya. Dokumennya tetap tersimpan, tetap bisa dibaca, tetap bisa diperbaiki. Yang belum terjadi adalah jurnalnya. Karena itu antrean yang menumpuk bukan sekadar ketidaknyamanan administratif: selama ia menumpuk, saldo yang Anda lihat belum memuat dokumen-dokumen itu.",
    },
    {
      kind: "diagram",
      nama: "alur-persetujuan",
      keterangan:
        "Yang menunggu di ambang adalah JURNALNYA, bukan dokumennya: dokumen selalu tersimpan.",
    },
    {
      kind: "poin",
      butir: [
        "Antrean terbuka untuk semua peran — penyetuju melihat yang harus ia putuskan, pemohon melihat kabar pengajuannya. Yang dibatasi adalah siapa yang boleh MEMUTUS.",
        "Penolakan bukan penghapusan: dokumennya kembali ke pemohon beserta catatan alasannya, dan bisa diajukan ulang.",
        "Menyetujui adalah tindakan yang mengikat dan tercatat namanya. Itu sebabnya keputusan diambil di dalam dialog konfirmasi, bukan dari satu ketukan di baris daftar.",
      ],
    },
  { kind: "sub", judul: "Memasang aturan dan memutuskan pengajuan" },
  {
    kind: "langkah",
    butir: [
      "Buka Persetujuan → Aturan Persetujuan.",
      "Pilih Jenis dokumen (kontrak, faktur, atau pembayaran), isi Mulai nilai dalam rupiah, dan pilih Peran penyetuju.",
      "Tekan Simpan Aturan. Aturan berlaku untuk dokumen yang dibuat SESUDAHNYA.",
    ],
  },
  {
    kind: "gambar",
    berkas: "akuntansi/aturan-persetujuan",
    alt: "Halaman Aturan Persetujuan dengan daftar aturan yang masih kosong dan formulir Tambah Aturan berisi jenis dokumen, mulai nilai, dan peran penyetuju.",
  },
  {
    kind: "paragraf",
    teks:
      "Penyetuju membuka Persetujuan → Perlu Persetujuan. Bagian Menunggu Keputusan Anda memuat pengajuan yang menunggu peran Anda; Setujui memposting jurnalnya, Tolak mengembalikan dokumen tanpa jurnal. Catatan keputusan ikut tersimpan. Pengajuan Saya dan Riwayat Keputusan ada di halaman yang sama.",
  },
  {
    kind: "gambar",
    berkas: "akuntansi/persetujuan",
    alt: "Halaman Perlu Persetujuan dengan bagian Menunggu Keputusan Anda dan Pengajuan Saya yang masih kosong.",
  },
  {
    kind: "catatan",
    teks:
      "Tanpa satu aturan pun, semua dokumen langsung masuk jurnal. Dokumen yang terbit dari Transaksi Berulang SELALU menunggu persetujuan, berapa pun nilainya.",
  },
  ];

const PENJUALAN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Satu penjualan melewati tiga peristiwa yang terjadi pada waktu berbeda, dan masing-masing mengubah hal yang berbeda. Kontrak adalah kesepakatan: belum ada uang, belum ada barang yang berpindah, dan belum ada satu pun jurnal. Tagihan penjualan adalah pengakuan bahwa Anda BERHAK atas uangnya: di sinilah piutang dan pendapatan lahir. Surat jalan adalah barangnya keluar: di sinilah stok berkurang.",
    },
    {
      kind: "paragraf",
      teks:
        "Menggabungkan ketiganya menjadi satu formulir akan terasa lebih sederhana selama seminggu dan salah selamanya sesudahnya. Ekspor komoditas hampir tidak pernah rapi: kontrak ditandatangani Januari, barang dikirim Maret dalam dua pengiriman, pembayaran datang April sebagian. Kalau ketiganya satu dokumen, Anda harus memilih satu tanggal untuk tiga peristiwa — dan laporan mana pun yang memakai tanggal itu akan salah untuk dua di antaranya.",
    },
    { kind: "sub", judul: "Kenapa Catat Penjualan tetap ada" },
    {
      kind: "paragraf",
      teks:
        "Untuk penjualan yang memang selesai sekaligus, wisaya “Catat Penjualan” mengisi ketiganya dalam satu jalan berpandu. Ia bukan jalur pintas yang melewati mesin — ia tetap membuat dokumen yang sama dan jurnal yang sama; yang dihemat hanya perpindahan halaman.",
    },
    { kind: "sub", judul: "Piutang dan retur" },
    {
      kind: "poin",
      butir: [
        "“Pelanggan Belum Bayar” bukan daftar terpisah yang Anda isi sendiri: ia adalah tagihan yang belum lunas, dihitung ulang setiap kali sebuah pembayaran dicatat.",
        "Retur tidak menghapus faktur aslinya. Ia dokumen tersendiri yang membalik sebagian dampaknya — persis alasan yang sama dengan jurnal pembalik.",
        "Valas menyimpan tiga angka sekaligus: mata uang, kurs, dan nilai rupiahnya. Tanpa ketiganya, laba selisih kurs tidak bisa dihitung, dan sebuah angka tanpa mata uang di aplikasi ekspor bisa terbaca tujuh belas ribu kali lebih besar dari yang dimaksud.",
      ],
    },
  { kind: "sub", judul: "Langkah: mencatat penjualan" },
  {
    kind: "paragraf",
    teks:
      "Catat Penjualan adalah wisaya lima langkah. Tidak ada yang tersimpan sampai Selesai & Simpan di langkah terakhir, jadi Anda bebas mundur-maju.",
  },
  {
    kind: "langkah",
    butir: [
      "Pelanggan — mulai dari kontrak bila ada (pelanggan, mata uang, dan barangnya ikut terisi), atau pilih pelanggan terdaftar, atau isi pelanggan baru.",
      "Barang & Harga — barang, jumlah, dan harga.",
      "Surat Jalan (opsional) — kirim barangnya sekalian; stok berkurang dan HPP terjurnal.",
      "Tagihan — tanggal, jatuh tempo, PPN, dan mata uang.",
      "Ringkasan — periksa, lalu Selesai & Simpan.",
    ],
  },
  {
    kind: "gambar",
    berkas: "penjualan/catat-penjualan",
    alt: "Wisaya Catat Penjualan langkah 1 dari 5 dengan pilihan kontrak sumber dan pelanggan terdaftar atau baru.",
  },
  {
    kind: "paragraf",
    teks:
      "Tagihan Penjualan memuat setiap faktur dengan status pembayarannya — Lunas, Sebagian, Belum Bayar, Jatuh Tempo. Selain wisaya, Buat Tagihan membuka formulir langsung yang bisa menarik baris dari kontrak.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/tagihan",
    alt: "Daftar Tagihan Penjualan berisi enam faktur contoh dengan tanggal, jumlah barang, nilai, dan status Sah, serta tombol Catat Penjualan (dipandu) dan Buat Tagihan.",
  },
  {
    kind: "paragraf",
    teks:
      "Halaman rinci faktur adalah tempat pekerjaan sesudahnya: Tambah Pembayaran saat uang diterima, Kirim ke Pelanggan lewat surel, kompensasi uang muka, Pratinjau & Cetak PDF, dan Ulangi faktur ini untuk membuat templat transaksi berulang.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/tagihan-rinci",
    alt: "Halaman rinci sebuah tagihan contoh dengan informasi tagihan, baris barang, DPP, PPN 11 persen, total, dan bagian Pembayaran.",
  },
  { kind: "sub", judul: "Kontrak, surat jalan, piutang, retur, dan transaksi berulang" },
  {
    kind: "paragraf",
    teks:
      "Kontrak (modul Perdagangan) mencatat kesepakatan sebelum barang dikirim. Statusnya Menunggu, Sah, Selesai, atau Dibatalkan; halaman rincinya memuat rantai dokumen dan sisa per barang, dengan tombol untuk membuat surat jalan dan faktur dari kontrak itu.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/kontrak",
    alt: "Halaman Kontrak dengan saringan status, grafik status kontrak dan aktivitas bulanan, serta tombol Buat Kontrak.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/surat-jalan",
    alt: "Halaman Surat Jalan yang masih kosong dengan tombol Buat Surat Jalan dan penjelasan bahwa surat jalan mengurangi stok dan mengakui HPP.",
    keterangan: "Menerbitkan surat jalan mengurangi stok dan menjurnal HPP; jumlah besar diminta konfirmasi lebih dulu.",
  },
  {
    kind: "paragraf",
    teks:
      "Pelanggan Belum Bayar adalah laporan umur piutang per tanggal — faktur dan kontrak yang masih bersisa, dikelompokkan menurut umurnya, bisa diunduh Excel atau PDF.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/piutang",
    alt: "Laporan Pelanggan Belum Bayar dengan kartu umur piutang 0–30 sampai lebih dari 90 hari, total outstanding, dan grafik sebaran umur.",
  },
  {
    kind: "paragraf",
    teks:
      "Barang Dikembalikan memisahkan retur penjualan dan retur pembelian. Buat Retur memilih dokumen sumber, lalu jumlah yang diretur per baris — tidak boleh melebihi sisa yang bisa diretur. Retur penjualan mengembalikan stok dan menerbitkan nota.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/retur",
    alt: "Halaman Retur dengan tab Retur Penjualan dan Retur Pembelian yang masih kosong serta tombol Buat Retur.",
  },
  {
    kind: "paragraf",
    teks:
      "Transaksi Berulang menerbitkan faktur atau jurnal menurut jadwal (mingguan, bulanan, tahunan). Templat dibuat dari faktur yang sudah ada lewat Ulangi faktur ini. Kemunculan yang jatuh di bulan terkunci ditahan, bukan dipaksakan.",
  },
  {
    kind: "gambar",
    berkas: "penjualan/transaksi-berulang",
    alt: "Halaman Transaksi Berulang yang masih kosong dengan penjelasan bahwa dokumen dari templat selalu menunggu persetujuan.",
  },
    { kind: "istilah", kunci: ["kontrak", "faktur", "surat_jalan", "piutang", "retur"] },
    {
      kind: "paragraf",
      teks:
        "Sebagian tagihan berulang tanpa pernah berubah — sewa, langganan, retainer bulanan. Untuk itu ada Transaksi Berulang: buka faktur yang sudah benar, tekan \u201cUlangi faktur ini\u201d, lalu tentukan jadwalnya. Setiap bulan aplikasi menyalin faktur itu apa adanya.",
    },
    {
      kind: "poin",
      butir: [
        "Yang terbit MENUNGGU PERSETUJUAN, selalu, berapa pun nilainya \u2014 dan itu disengaja: tidak ada manusia yang melihat dokumen itu pada saat ia lahir. Carilah di halaman Persetujuan, bukan langsung di laporan.",
        "Menyunting faktur sumbernya berarti menyunting templatnya. Itu memang cara mengubah nominal sewa yang naik tahun depan.",
        "Kejadian yang jatuh di periode yang sudah DITUTUP tidak diterbitkan, dan tidak pula digeser ke hari ini \u2014 sewa bulan Juli yang tercatat di bulan Agustus adalah beban di bulan yang salah. Ia ditahan dan disebutkan di daftar riwayatnya.",
        "Menonaktifkan templat menghentikan penerbitan berikutnya; dokumen yang terlanjur lahir tidak tersentuh.",
      ],
    },
  ];

const STOK: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Angka stok di layar bukan angka yang disimpan lalu diperbarui. Ia hasil penjumlahan seluruh mutasi: pembelian menambah, surat jalan mengurangi, retur mengembalikan, penyesuaian membetulkan. Itu sebabnya tidak ada kolom yang bisa Anda ketik ulang — mengetik ulang akan menghasilkan angka yang tidak bisa ditelusuri ke satu peristiwa pun.",
    },
    {
      kind: "paragraf",
      teks:
        "Persediaan adalah UANG di neraca. Menaikkan stok 10 ton berarti menaikkan aset perusahaan sebesar nilai 10 ton itu, dan nilai itu harus datang dari suatu tempat: pembelian, atau pengakuan bahwa sebelumnya kurang catat. Kartu Stok menunjukkan asal setiap angka, baris per baris.",
    },
    { kind: "sub", judul: "Hitung ulang stok (opname) adalah pengakuan, bukan penimpaan" },
    {
      kind: "paragraf",
      teks:
        "Saat Anda menghitung fisik gudang dan hasilnya berbeda dari catatan, aplikasi tidak menimpa catatan dengan hasil hitungan. Ia mencatat SELISIHNYA sebagai penyesuaian berjurnal: stok bertambah atau berkurang, dan lawannya adalah akun selisih persediaan yang masuk ke laba/rugi. Selisih persediaan adalah biaya: barang yang susut, rusak, atau tidak pernah tercatat keluar. Mencatatnya sebagai koreksi angka berarti menyembunyikan biaya itu.",
    },
    {
      kind: "catatan",
      teks:
        "Barang tanpa dasar biaya muncul sebagai “—”, tidak pernah sebagai nol. Nol berarti “gratis”, dan menjumlahkannya sebagai nol menyusutkan nilai persediaan tanpa satu pun tanda di layar. Jumlah baris yang dikecualikan selalu disebut di bawah tabelnya.",
      nada: "peringatan",
    },
  { kind: "sub", judul: "Layar-layar stok" },
  {
    kind: "paragraf",
    teks:
      "Stok Barang meringkas jumlah barang, kondisi stok (aman, menipis, habis), nilai persediaan dengan biaya rata-rata, dan stok terbanyak.",
  },
  {
    kind: "gambar",
    berkas: "stok/ringkasan",
    alt: "Halaman Stok Barang dengan kartu jumlah barang, stok aman, menipis, habis, nilai persediaan, grafik kondisi stok, dan stok terbanyak.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka Stok & Aset → Tambah / Kurangi Stok.",
      "Pilih barang (atau Barang Baru), lalu Jenis Pergerakan: Barang Masuk, Barang Keluar, atau Hasil Proses (susut).",
      "Isi jumlah. Untuk barang masuk, Harga Pokok per Unit WAJIB — ia yang menghitung HPP rata-rata saat barang keluar.",
      "Opsional: pemasok pengirim dan Bayar dari kas/bank bila barangnya dibayar tunai. Tekan Simpan Pergerakan Stok.",
    ],
  },
  {
    kind: "gambar",
    berkas: "stok/tambah-kurangi",
    alt: "Formulir Catat Pergerakan Stok dengan isian barang, jenis pergerakan Barang Masuk, jumlah, harga pokok per unit, pemasok pengirim, dan bayar dari kas.",
  },
  {
    kind: "paragraf",
    teks:
      "Riwayat Stok (kartu stok) menampilkan saldo awal, masuk, keluar, dan saldo akhir per barang untuk minggu, bulan, tahun, atau rentang khusus, dan bisa dicetak atau diunduh Excel.",
  },
  {
    kind: "gambar",
    berkas: "stok/riwayat",
    alt: "Halaman Riwayat Stok bulanan untuk Oktober berisi tiga barang contoh dengan saldo awal, masuk, keluar, dan saldo akhir.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka Hitung Ulang Stok. Cetak Lembar Hitung bila penghitungan dilakukan di gudang.",
      "Isi Hitung Fisik untuk setiap barang yang dihitung; kolom Selisih terisi sendiri. Barang yang dikosongkan tidak diubah.",
      "Tekan Simpan Penyesuaian dan konfirmasi. Riwayatnya terbaca di Lihat Riwayat Hitung Ulang.",
    ],
  },
  {
    kind: "gambar",
    berkas: "stok/hitung-ulang",
    alt: "Halaman Hitung Ulang Stok dengan tabel stok sistem dan kolom hitung fisik untuk tiga barang contoh, serta tombol Cetak Lembar Hitung.",
  },
    { kind: "istilah", kunci: ["persediaan", "kartu_stok", "stok_opname"] },
  ];

const BIAYA_IMPOR: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Barang impor jarang datang bersama seluruh biayanya. Kontainernya masuk gudang minggu ini; bea masuk ditagih Bea Cukai, freight dan asuransi ditagih forwarder, dan tagihan-tagihan itu tiba berminggu-minggu kemudian — dari pihak yang berbeda, dengan tanggal yang berbeda. Padahal harga pokok barang itu, menurut akuntansi mana pun, termasuk seluruh biaya sampai barangnya siap dijual.",
  },
  {
    kind: "paragraf",
    teks:
      "Jalan yang tampak paling mudah adalah membuka kembali pembelian lamanya dan menaikkan harga belinya. Jangan lakukan itu. Sebagian barang itu mungkin sudah terjual, dan harga pokok penjualannya sudah masuk jurnal — jurnal yang mungkin sudah dicetak, ditandatangani, bahkan dilaporkan pajaknya. Mengubahnya sekarang membuat laporan yang sudah keluar berbeda dari basis datanya, tanpa jejak koreksi.",
  },
  { kind: "sub", judul: "Yang masih di gudang menempel, yang sudah terjual tidak" },
  {
    kind: "paragraf",
    teks:
      "Karena itu biayanya dibagi dua menurut satu pertanyaan sederhana: apakah barangnya masih ada. Bagian yang jatuh pada barang yang MASIH DI GUDANG boleh menempel di harga pokoknya — harga pokok penjualannya belum lahir, jadi tidak ada yang ditulis ulang. Bagian yang jatuh pada barang yang SUDAH TERJUAL tidak bisa lagi mengubah angka yang sudah terbit; ia dibukukan ke akun Selisih Harga Pokok pada bulan berjalan.",
  },
  {
    kind: "poin",
    butir: [
      "Tagihannya dicatat lebih dulu seperti pembelian biasa — dari Bea Cukai, dari forwarder, dari siapa pun yang menagih. Utangnya lahir di sana, dan muncul di daftar Tagihan Harus Dibayar seperti tagihan lain.",
      "Dokumen Biaya Impor tidak menerbitkan utang kedua. Ia hanya membagi nilai tagihan yang sudah tercatat itu ke barang-barang yang menanggungnya.",
      "Satu tagihan hanya bisa disebar sekali. Menyebarnya dua kali akan menggandakan harga pokok tanpa satu pun tanda di layar, jadi tagihan yang sudah disebar tidak lagi muncul di pemilihnya.",
    ],
  },
  { kind: "sub", judul: "Menurut nilai atau menurut berat" },
  {
    kind: "paragraf",
    teks:
      "Satu tagihan menanggung beberapa barang sekaligus, dan pembagiannya harus punya dasar yang bisa dipertanggungjawabkan. Dua dasar yang tersedia menjawab dua sebab yang berbeda: bea masuk umumnya mengikuti NILAI barang, sedangkan ongkos angkut umumnya mengikuti BERAT. Dasar yang dipilih ikut disimpan bersama dokumennya — tanpa itu, angka yang dihasilkan tidak bisa dijelaskan lagi enam bulan kemudian.",
  },
  {
    kind: "catatan",
    teks:
      "Pembagiannya PROPORSI, bukan penelusuran per lot. Buku ini menilai persediaan dengan rata-rata tertimbang, dan di bawah metode itu tidak ada cara jujur untuk mengatakan “180 kg dari pembelian inilah yang terjual” — unit-unitnya memang sudah bercampur. Yang dipakai adalah berapa bagian dari yang dibeli itu yang masih tersisa di saldo barangnya. Perkiraannya tepat ketika tidak ada pembelian lain di antaranya, dan itulah kasus yang paling lazim untuk satu kontainer.",
    nada: "peringatan",
  },
  {
    kind: "paragraf",
    teks:
      "Setelah dokumennya disimpan, dua hal terjadi sekaligus dan keduanya bisa diperiksa. Nilai persediaan barang yang masih di gudang naik — terlihat di Kartu Stok sebagai baris penyesuaian nilai yang TIDAK menambah kuantitas apa pun. Dan bagian yang sudah terjual berpindah dari Persediaan ke Selisih Harga Pokok di laporan laba/rugi bulan itu.",
  },
  { kind: "sub", judul: "Langkah menyebar biaya impor" },
  {
    kind: "langkah",
    butir: [
      "Catat dulu tagihan biayanya (freight, bea masuk) sebagai pembelian dari pemasok jasanya.",
      "Buka Pembelian → Biaya Impor, lalu buat penyebaran baru dan pilih tagihan yang disebar.",
      "Pilih Dasar sebar — menurut nilai barang atau menurut berat — dan centang penerimaan barang yang menanggung biaya itu.",
      "Tekan Simpan & Sebar.",
    ],
  },
  {
    kind: "gambar",
    berkas: "pembelian/biaya-impor",
    alt: "Formulir Sebar Biaya Impor dengan pilihan tagihan yang disebar, tanggal dokumen, dasar sebar menurut nilai barang, dan daftar penerimaan barang contoh beserta sisa di gudang.",
  },
  { kind: "istilah", kunci: ["persediaan", "kartu_stok", "hpp"] },
];

const MODUL: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Tidak semua perusahaan membutuhkan hal yang sama. Perusahaan jasa tidak punya stok; perusahaan dagang lokal tidak menerbitkan dokumen ekspor; sebagian tidak pernah mencatat aset tetap. Modul usaha adalah cara mengatakan bidang usaha Anda sekali, lalu membiarkan aplikasinya menampilkan yang memang Anda pakai.",
  },
  {
    kind: "paragraf",
    teks:
      "Akibatnya nyata, dan itu sebabnya halaman ini ada. Modul yang dimatikan MENGHILANGKAN menunya dari layar semua orang, berhenti menyemai akun-akun miliknya ke bagan akun, dan mengubah halamannya menjadi pemberitahuan bahwa fitur itu sedang tidak aktif. Ini bukan preferensi tampilan seperti bahasa atau tema — ini keputusan yang dirasakan seluruh kantor.",
  },
  { kind: "sub", judul: "Modul bukan hak akses, dan perbedaannya penting" },
  {
    kind: "paragraf",
    teks:
      "Hak akses menentukan siapa boleh apa: seorang staf gudang boleh mengubah stok, seorang direktur boleh membuka laporan. Modul menentukan hal lain, yaitu perusahaan ini mengerjakan apa. Mematikan sebuah modul tidak mencabut izin siapa pun, dan menyalakannya kembali tidak memberi izin baru kepada siapa pun.",
  },
  {
    kind: "poin",
    butir: [
      "Data yang sudah tercatat TIDAK hilang saat modulnya dimatikan. Ia berhenti ditampilkan, bukan berhenti ada — dan kembali utuh begitu modulnya dinyalakan lagi.",
      "Akun yang sudah terpakai di jurnal tetap di bagan akun. Yang berhenti hanyalah PENYEMAIAN akun baru milik modul itu.",
      "Laporan keuangan tidak berubah angkanya. Neraca dan laba/rugi dihitung dari jurnal, dan jurnal tidak peduli menu mana yang sedang tampil.",
    ],
  },
  {
    kind: "catatan",
    teks:
      "Kalau sebuah menu yang Anda cari tidak ada, kemungkinan besar modulnya sedang dimatikan — bukan aplikasinya yang tidak bisa. Halaman Pengaturan menyebut daftar modul yang sedang mati kepada semua orang, termasuk yang tidak berhak menyalakannya, supaya Anda tahu ada yang bisa dimintai.",
    nada: "peringatan",
  },
  {
    kind: "paragraf",
    teks:
      "Mengubahnya adalah kewenangan yang sama dengan mengubah profil perusahaan, dan hanya pemegang kewenangan itu yang melihat menunya. Perubahannya dicatat di jejak audit — sebuah menu yang hilang tanpa ada yang mengaku mematikannya adalah kebingungan yang mahal.",
  },
  { kind: "sub", judul: "Menyalakan atau mematikan modul" },
  {
    kind: "langkah",
    butir: [
      "Buka Bantuan & Pengaturan → Modul Usaha.",
      "Pilih kategori usaha untuk set modul yang lazim, atau nyalakan dan matikan modul satu per satu. Akuntansi Inti selalu aktif.",
      "Tekan Simpan Perubahan dan konfirmasi.",
    ],
  },
  {
    kind: "gambar",
    berkas: "perusahaan/modul-usaha",
    alt: "Halaman Modul Usaha dengan lima kategori usaha — Perdagangan Komoditas, Distribusi, Jasa, Pabrik, Pilih Sendiri — masing-masing menjelaskan modul yang dinyalakan dan dimatikan.",
  },
];

const KAS: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Buku Kas & Bank adalah catatan Anda: setiap uang masuk dan keluar yang sudah Anda catat. Rekening koran adalah catatan bank. Keduanya boleh berbeda, dan perbedaan yang wajar punya nama — cek yang belum dicairkan, transfer yang masuk sebelum Anda mencatatnya, biaya administrasi yang hanya bank tahu.",
    },
    {
      kind: "paragraf",
      teks:
        "Rekonsiliasi tidak menyamakan dua angka dengan mengubah salah satunya. Ia mencocokkan baris per baris, lalu menyisakan daftar hal yang belum bertemu pasangannya. Daftar sisa itulah hasilnya, dan setiap barisnya adalah pertanyaan yang punya jawaban. Selisih yang tidak bisa dijelaskan baris per baris belum selesai, berapa pun kecilnya.",
    },
    {
      kind: "poin",
      butir: [
        "Yang dicocokkan adalah transaksi, bukan total. Dua kesalahan yang kebetulan saling meniadakan menghasilkan total yang cocok dan buku yang salah.",
        "Setelah sebuah periode rekonsiliasi dikunci, baris di dalamnya tidak lagi bisa dicocokkan ulang — alasannya sama dengan kunci periode.",
        "Biaya bank yang ditemukan saat mencocokkan tetap harus dicatat sebagai transaksi kas; ia beban, bukan penyesuaian angka.",
      ],
    },
    {
      kind: "paragraf",
      teks:
        "Mencocokkan dimulai dari rekening koran Anda sendiri. Setiap bank menyediakannya lewat internet banking — biasanya di menu Mutasi Rekening atau Riwayat Transaksi, dengan pilihan rentang tanggal lalu unduh sebagai CSV atau Excel. Ambil rentang yang sama persis dengan periode rekonsiliasi yang Anda buat; rentang yang lebih lebar menghasilkan baris di luar periode yang tidak akan pernah menemukan pasangannya.",
    },
    {
      kind: "poin",
      butir: [
        "Berkasnya diunggah APA ADANYA. Judul kolom boleh berbahasa Indonesia (Tanggal, Keterangan, Jumlah, DB/CR) maupun Inggris, dan kolom yang tidak dibutuhkan seperti Cabang atau Saldo diabaikan — bukan ditolak.",
        "Sebelum satu baris pun tersimpan, aplikasi memperlihatkan hasil bacanya. Cocokkan beberapa baris pertama dengan berkas aslinya: kolom yang tertukar menghasilkan impor yang BERHASIL dengan nilai salah, dan hanya mata Anda yang bisa menangkapnya di situ.",
        "Kalau ada satu baris yang tidak bisa dibaca, tidak ada yang disimpan sama sekali. Setiap masalah disebut beserta nomor barisnya, supaya diperbaiki sekaligus lalu diunggah ulang.",
        "Tanggal yang ditulis 05/08/2026 bisa berarti 5 Agustus atau 8 Mei. Aplikasi memutuskannya dari seluruh berkas — satu baris bertanggal 31 sudah cukup menjelaskan sisanya — dan bila berkasnya tidak memuat petunjuk apa pun, ia mengatakannya di layar alih-alih menebak diam-diam.",
      ],
    },
  { kind: "sub", judul: "Langkah: mencatat uang masuk dan keluar" },
  {
    kind: "paragraf",
    teks:
      "Buku Kas & Bank menampilkan saldo per jenis kas dan mata uang, serta daftar transaksi yang bisa disaring jenis kas, mata uang, tahun, dan bulan.",
  },
  {
    kind: "gambar",
    berkas: "kas/buku-kas",
    alt: "Halaman Buku Kas & Bank dengan saldo Bank (IDR), saringan jenis kas dan periode, dan daftar empat transaksi beban contoh.",
  },
  {
    kind: "langkah",
    butir: [
      "Dari Beranda pilih Terima Uang atau Bayar — atau Catat Transaksi di Buku Kas & Bank.",
      "Pilih Jenis Kas (Bank, Kas Besar, Kas Kecil), tanggal, dan keterangan.",
      "Isi SATU kolom saja: uang masuk atau uang keluar.",
      "Pilih kategorinya — atau, dengan Mode Akuntan, akun lawannya. Pratinjau jurnal memperlihatkan dampaknya sebelum disimpan.",
      "Tekan Simpan Transaksi.",
    ],
  },
  {
    kind: "gambar",
    berkas: "kas/catat-transaksi",
    alt: "Formulir Terima Uang dengan jenis kas Bank, tanggal, keterangan, kolom debit uang masuk dan kredit uang keluar, serta pilihan akun lawan.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka Cocokkan Rekening Koran → Rekonsiliasi Baru. Pilih rekening, awal dan akhir periode, serta saldo awal dan akhir menurut rekening koran; tekan Buat & Lanjut.",
      "Tambahkan baris rekening koran satu per satu atau Impor CSV dari internet banking.",
      "Pasangkan setiap baris koran dengan transaksi buku. Yang tidak berpasangan biasanya transaksi yang belum dicatat — catat, lalu pasangkan.",
    ],
  },
  {
    kind: "gambar",
    berkas: "kas/rekonsiliasi",
    alt: "Formulir Rekonsiliasi Baru dengan mata uang rekening, awal dan akhir periode, saldo awal dan akhir menurut koran, dan tombol Buat & Lanjut.",
  },
    { kind: "istilah", kunci: ["kas_bank", "rekonsiliasi_bank"] },
  ];

const SALDO_AWAL: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Perusahaan Anda tidak lahir pada hari aplikasi ini dipasang. Sudah ada uang di bank, pelanggan yang belum bayar, utang ke pemasok, dan barang di gudang. Saldo awal adalah cara memberi tahu mesinnya keadaan itu, sekali, sebagai satu jurnal bertanggal sehari sebelum Anda mulai.",
    },
    {
      kind: "paragraf",
      teks:
        "Kalau dilewati, tidak ada yang gagal, dan itulah masalahnya. Aplikasi akan bekerja di atas asumsi bahwa perusahaan Anda dimulai dari nol: laba bulan pertama terlihat luar biasa karena penerimaan piutang lama tercatat sebagai pendapatan baru, dan neraca tidak seimbang dengan kenyataan. Biasanya akuntan Anda yang menemukannya, beberapa bulan kemudian.",
    },
    {
      kind: "poin",
      butir: [
        "Saldo awal dimasukkan SEBELUM transaksi pertama. Sesudahnya ia masih bisa dibetulkan, tetapi setiap laporan yang sudah dicetak di antaranya salah.",
        "Piutang dan utang dimasukkan per pelanggan/pemasok, bukan sebagai satu total. Tanpa rinciannya, tidak ada yang bisa menjawab siapa yang belum bayar.",
        "Jumlah sisi kiri dan kanan harus sama. Selisihnya bukan untuk dibulatkan; ia berarti ada yang belum dihitung.",
      ],
    },
    {
      kind: "langkah",
      butir: [
        "Daftarkan dulu master-nya — pelanggan, pemasok, dan barang. Saldo awal per pihak mustahil diisi kalau pihaknya belum ada.",
        "Isi saldonya PER pelanggan, per pemasok, dan per barang — bukan sebagai satu total.",
        "Periksa jumlah sisi kiri dan sisi kanan sampai sama. Selisih bukan untuk dibulatkan.",
        "Simpan sebelum transaksi pertama dicatat. Sesudahnya masih bisa dibetulkan, tetapi setiap laporan yang dicetak di antaranya salah.",
      ],
    },
    {
      kind: "paragraf",
      teks:
        "Semua itu menuntut daftarnya sudah ada lebih dulu: piutang awal per pelanggan mustahil diisi kalau pelanggannya belum terdaftar, dan stok awal per barang mustahil kalau barangnya belum ada. Mengetik ulang ratusan baris dari Excel adalah pekerjaan yang tidak perlu dilakukan siapa pun — Impor Data Awal memindahkannya langsung dari berkas yang sudah Anda punya.",
    },
    {
      kind: "poin",
      butir: [
        "Unduh templatnya lebih dulu. Ia sudah berisi judul kolom yang benar, satu baris contoh, dan lembar Petunjuk.",
        "Urutan kolom bebas — kolom dikenali dari JUDULNYA. Kolom tambahan dari aplikasi lama Anda diabaikan, bukan ditolak.",
        "Kalau ada SATU baris yang salah, tidak ada yang disimpan. Setiap masalah dilaporkan beserta nomor barisnya, supaya diperbaiki sekaligus lalu diunggah ulang.",
        "Nama yang sudah ada dilewati, tidak pernah ditimpa. Mengunggah berkas yang sama dua kali tidak menggandakan apa pun, dan tidak menghapus suntingan yang Anda buat sesudahnya.",
      ],
    },
  { kind: "sub", judul: "Wisaya penyiapan, langkah demi langkah" },
  {
    kind: "paragraf",
    teks:
      "Perusahaan yang baru dibuat langsung membuka Setup Perusahaan & Saldo Awal; halaman lain menunggu sampai wisaya selesai. Wisaya ini hanya dijalankan sekali.",
  },
  {
    kind: "langkah",
    butir: [
      "Identitas — nama, alamat, NPWP, dan apakah perusahaan PKP.",
      "Modul Usaha — pilih kategori usaha.",
      "Mata Uang & Tahun Buku.",
      "Bagan Akun — terima bagan bawaan atau sesuaikan.",
      "Saldo Awal — kas & bank, piutang per pelanggan, persediaan per barang, utang per pemasok; aset tetap lewat berkas. Pilih Mulai tanpa saldo awal bila memang belum ada.",
      "Tinjau, lalu Simpan & Selesai: satu jurnal saldo awal yang seimbang lahir, dan Anda bisa langsung mulai bekerja.",
    ],
  },
  {
    kind: "gambar",
    berkas: "perusahaan/setup",
    alt: "Wisaya Setup Perusahaan & Saldo Awal langkah 1 dari 6, Identitas, dengan nama perusahaan contoh, alamat, NPWP, dan centang PKP.",
  },
  {
    kind: "paragraf",
    teks:
      "Impor Data Awal memindahkan daftar pelanggan, pemasok, dan barang dari Excel. Unduh templat untuk jenis data yang dipilih, isi, lalu Unggah & impor. Berkas .xlsx paling besar 5 MB; bila ada satu baris yang salah, tidak ada yang disimpan, dan nama yang sudah ada dilewati. Saldo awal TIDAK lewat layar ini — ia milik wisaya penyiapan, yang punya templat per bagiannya sendiri.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/impor-data-awal",
    alt: "Halaman Impor Data Awal dengan langkah unduh templat Pelanggan dan langkah unggah berkas yang sudah diisi.",
  },
    { kind: "istilah", kunci: ["saldo_awal", "neraca"] },
  ];

const PERAN_IZIN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Akses di aplikasi ini ditentukan oleh IZIN, bukan oleh jabatan. Satu izin adalah kalimat kecil seperti “melihat tagihan penjualan” atau “menulis jurnal manual”. Setiap peran memegang sekumpulan izin, dan setiap halaman maupun titik API menyebut izin yang dituntutnya. Menyembunyikan sebuah menu karena itu bukan pengamanan: yang menolak permintaan adalah server, bukan menu yang tidak digambar.",
    },
    {
      kind: "catatan",
      teks:
        "Tabel di bawah adalah BAWAAN: titik awal yang dibawa aplikasi, bukan keadaan perusahaan Anda. Dua hal membuatnya bergerak. Setiap sel bisa ditimpa dari halaman Hak Akses, jadi sebuah peran boleh diberi atau dicabut izin di luar bawaan ini. Dan peran itu sendiri adalah data: Direktur Utama bisa membuat peran yang belum ada saat halaman ini ditulis. Yang berlaku di perusahaan Anda hanya terbaca di halaman Hak Akses.",
    },
    { kind: "matriks-izin" },
    { kind: "sub", judul: "Dua lingkup yang tidak pernah bercampur" },
    {
      kind: "paragraf",
      teks:
        "Izin PERUSAHAAN menentukan apa yang boleh Anda lakukan di dalam buku perusahaan ini, dan datang dari keanggotaan Anda di perusahaan itu. Izin AKUN (tenant) berlaku bahkan ketika Anda belum punya satu pun perusahaan: boleh membuat perusahaan baru, boleh menyentuh langganan, boleh mengundang orang. Keduanya tidak pernah dicampur. Kalau izin membuat perusahaan harus datang dari keanggotaan di sebuah perusahaan, pelanggan baru tidak akan pernah bisa mulai.",
    },
    { kind: "sub", judul: "Mode Akuntan bukan peran" },
    {
      kind: "paragraf",
      teks:
        "Jurnal, buku besar, dan daftar akun hanya muncul saat Mode Akuntan menyala. Itu SAKELAR TAMPILAN, bukan izin: mematikannya menyembunyikan permukaan yang membingungkan staf non-akuntan, tetapi tidak memberi siapa pun akses yang tidak ia punya, dan tidak mencabut akses siapa pun. Yang memutuskan tetap izinnya.",
    },
    {
      kind: "paragraf",
      teks:
        "Aturan yang sama berlaku bagi MESIN. Sebuah sistem luar seperti kasir, marketplace, atau laporan otomatis membaca buku Anda lewat TOKEN API. Token itu tidak punya izinnya sendiri: ia BERPERAN sebagai salah satu peran di atas dan mendapat persis apa yang peran itu dapat, termasuk kehilangan akses ke modul yang Anda matikan.",
    },
    {
      kind: "poin",
      butir: [
        "Token diperlihatkan SEKALI, saat diterbitkan. Yang disimpan hanya sidik jarinya — itulah sebabnya basis data yang bocor tidak membawa serta kredensial yang bisa dipakai, dan juga sebabnya token yang hilang harus dicabut lalu diterbitkan ulang, bukan dilihat lagi.",
        "Terbitkan SATU token per sistem yang menyambung, bukan satu untuk semuanya. Kalau salah satunya bocor, yang dicabut hanya yang itu.",
        "Kolom “Terakhir dipakai” adalah cara Anda tahu token mana yang sudah tidak dipakai siapa pun — dan token yang tidak dipakai siapa pun adalah yang paling aman dicabut sekaligus paling berbahaya dibiarkan hidup.",
        "Mencabut berlaku seketika. Catatannya tetap tersimpan: siapa menerbitkan, kapan terakhir dipakai, kapan dicabut.",
      ],
    },
  { kind: "sub", judul: "Mengundang pengguna ke perusahaan" },
  {
    kind: "langkah",
    butir: [
      "Buka Bantuan & Pengaturan → Pengguna di perusahaan yang dituju.",
      "Tekan Undang Pengguna, isi email dan pilih Peran.",
      "Tekan Kirim Undangan. Penerima mendapat surel dan menentukan kata sandinya sendiri; undangannya tampil di Undangan Menunggu sampai diterima atau dicabut.",
    ],
  },
  {
    kind: "gambar",
    berkas: "perusahaan/undang-pengguna",
    alt: "Formulir Undang Pengguna Baru dengan email contoh, peran Manajer Keuangan, dan tombol Kirim Undangan.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/undangan-menunggu",
    alt: "Halaman Manajemen Pengguna dengan kursi terpakai 2 dari 15 dan satu undangan menunggu beserta tanggal berlakunya.",
    keterangan: "Undangan yang belum diterima ikut memakai kursi paket. Cabut undangan yang tidak jadi agar kursinya kembali.",
  },
  {
    kind: "poin",
    butir: [
      "Hanya pemilik dan admin akun yang bisa mengundang.",
      "Atur Ulang Kata Sandi pada seorang pengguna memberinya kata sandi sementara yang wajib diganti saat masuk berikutnya, dan mengeluarkan sesinya.",
      "Izin Khusus pada seorang pengguna menimpa perannya untuk satu izin: Ikuti peran, Selalu boleh, atau Selalu tidak.",
    ],
  },
  {
    kind: "gambar",
    berkas: "perusahaan/pengguna",
    alt: "Halaman Manajemen Pengguna dengan kartu kursi terpakai dan tabel pengguna berisi nama pengguna, email, peran Direktur Utama, dan status Aktif.",
  },
  { kind: "sub", judul: "Mengubah matriks izin" },
  {
    kind: "paragraf",
    teks:
      "Hak Akses menampilkan matriks peran × izin untuk perusahaan ini. Centang atau hapus centang, lalu Simpan Perubahan; sel yang berbeda dari bawaan ditandai diubah, dan Reset ke bawaan mengembalikannya. Perubahan berlaku paling lama satu menit kemudian dan tercatat di jejak audit. Kelola Peran di atas matriks menambah peran baru — peran baru lahir tanpa izin sama sekali.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/hak-akses",
    alt: "Halaman Hak Akses dengan bagian Kelola Peran berisi empat peran sistem dan formulir peran baru, di atas matriks izin.",
  },
  ];

/**
 * API — halaman untuk orang yang sudah memegang token dan sedang mencari cara
 * memakainya.
 *
 * ⚠ Daftar endpoint TIDAK diketik di sini: blok `endpoint-api` membangkitkannya
 * dari `lib/api-v1-spec.ts`, sumber yang sama yang menyusun `openapi.json` dan
 * yang dipaksa sejalan dengan route-nya oleh `tests/api-v1-spec.test.ts`.
 * Alasannya sama dengan matriks izin: yang diketik ulang akan menyimpang, dan
 * yang menyimpang di dokumentasi API baru ketahuan dari integrator.
 */
const API: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Sebuah program lain — kasir di toko, marketplace, lembar kerja yang menarik angka setiap pagi — bisa membaca buku perusahaan ini tanpa seorang pun menyalin data dengan tangan. Jalannya API: alamat web yang mengembalikan data sebagai JSON, bukan sebagai halaman. Untuk masuk, API memakai TOKEN yang Anda terbitkan sendiri di layar Token API — bukan nama pengguna dan kata sandi.",
    },
    {
      kind: "paragraf",
      teks:
        "API ini MEMBACA, tidak menulis. Tidak ada cara menerbitkan faktur atau memindahkan stok lewat jalur ini, dan itu disengaja. Setiap dokumen yang masuk lewat aplikasi melewati mesin akuntansi yang sama: jurnal berpasangan, ambang persetujuan, periode terkunci, kuota modul. Pintu tulis yang melewati semuanya akan menghasilkan buku yang tidak bisa dipertanggungjawabkan oleh orang yang menandatanganinya.",
    },
    { kind: "sub", judul: "Token BERPERAN, jadi izinnya bukan izin baru" },
    {
      kind: "paragraf",
      teks:
        "Sebuah token tidak punya daftar izinnya sendiri. Ia diterbitkan SEBAGAI salah satu peran yang ada di perusahaan ini dan mendapat persis apa yang peran itu dapat, tidak lebih. Ia juga ikut kehilangan akses ketika modulnya dimatikan atau izin perannya ditimpa. Jadi apa yang boleh dibaca sebuah token selalu sama dengan apa yang boleh dibaca perannya.",
    },
    {
      kind: "poin",
      butir: [
        "Terbitkan token untuk peran yang PALING SEDIKIT cukup. Sebuah penarik faktur tidak perlu peran yang juga boleh melihat gaji.",
        "Satu token per sistem yang menyambung, bukan satu untuk semuanya — kalau salah satu bocor, yang dicabut hanya yang itu.",
        "Token diperlihatkan sekali saat diterbitkan; yang tersimpan hanya sidik jarinya. Yang hilang tidak bisa dilihat lagi, hanya dicabut lalu diterbitkan ulang.",
        "Mencabut berlaku seketika, pada permintaan berikutnya — bukan setelah tokennya kedaluwarsa, sebab token di sini memang tidak punya masa berlaku.",
      ],
    },
    { kind: "sub", judul: "Perusahaannya ditentukan token, bukan alamat" },
    {
      kind: "paragraf",
      teks:
        "Alamat API tidak memuat nama tenant maupun nama perusahaan. Sebuah token diterbitkan DI DALAM satu perusahaan dan selamanya membaca buku perusahaan itu saja. Konsekuensinya: kalau Anda memegang tiga perusahaan, Anda memerlukan tiga token, dan sebuah program yang menarik ketiganya menyimpan ketiganya. Itu disengaja — alamat yang bisa menyebut perusahaan lain adalah satu salah ketik antara buku yang benar dan buku tetangganya.",
    },
    { kind: "sub", judul: "Satu permintaan, dari awal sampai jawabannya" },
    {
      kind: "paragraf",
      teks:
        "Token dikirim di header Authorization dengan skema Bearer. Tidak ada bentuk lain: tidak lewat parameter kueri (ia tercatat di log server dan riwayat peramban), tidak lewat cookie.",
    },
    {
      kind: "kode",
      bahasa: "bash",
      teks:
        'curl -H "Authorization: Bearer sai_12_xxxxxxxxxxxxxxxxxxxxxxxx" \\\n  "https://buku.contoh.co.id/api/v1/customers?limit=50&offset=0"',
    },
    {
      kind: "paragraf",
      teks:
        "Jawabannya selalu berbentuk sama: sebuah larik `data`, dan sebuah `meta` yang memberi tahu ada berapa seluruhnya dan apakah masih ada halaman berikutnya.",
    },
    {
      kind: "kode",
      bahasa: "json",
      teks:
        '{\n  "data": [\n    { "id": 7, "name": "PT Contoh Sejahtera", "isActive": true, "updatedAt": "2026-08-21T09:14:02.000Z" }\n  ],\n  "meta": { "total": 128, "limit": 50, "offset": 0, "hasMore": true }\n}',
    },
    {
      kind: "poin",
      butir: [
        "Ambil `meta.hasMore` apa adanya; jangan menghitung sendiri dari `total` dan `limit`. Yang menghitung sendiri berhenti satu halaman terlalu awal, diam-diam, dan kehilangan baris terakhir setiap kali.",
        "Nilai kueri yang salah ditolak, bukan diperbaiki: `?limit=abc` menjawab 400, bukan diam-diam kembali ke bawaan. Parameter yang salah ketik tetapi tetap dijawab “berhasil” menghasilkan program yang tampak bekerja sambil menarik halaman yang salah selama berbulan-bulan.",
        "`limit` di atas batas juga ditolak, bukan dipotong — penarik yang meminta 10.000 lalu menerima 200 tanpa diberi tahu akan menyimpulkan datanya memang cuma 200.",
        "Tidak ada bentuk “kembalikan semuanya”. Daftar yang muat hari ini adalah daftar yang tidak muat setelah pelanggan keseratus.",
      ],
    },
    { kind: "sub", judul: "Endpoint yang ada hari ini" },
    { kind: "endpoint-api" },
    { kind: "sub", judul: "Menarik hanya yang berubah" },
    {
      kind: "paragraf",
      teks:
        "Setiap baris membawa `updatedAt`, dan setiap daftar menerima `?updatedSince=` berisi waktu ISO-8601. Simpan `updatedAt` tertinggi yang pernah Anda terima, lalu kirimkan kembali pada penarikan berikutnya: yang datang hanya yang berubah sejak itu. Itulah selisih antara satu permintaan kecil per jam dan seluruh daftar per jam — dan pada buku yang sudah besar, selisih antara integrasi yang tetap cepat dan integrasi yang lama-lama ditinggalkan orang.",
    },
    {
      kind: "kode",
      bahasa: "bash",
      teks:
        'curl -H "Authorization: Bearer $SAI_TOKEN" \\\n  "https://buku.contoh.co.id/api/v1/invoices?updatedSince=2026-08-21T09:14:02Z&limit=200"',
    },
    {
      kind: "paragraf",
      teks:
        "Urutannya `updatedAt` menaik dengan `id` sebagai pemutus seri. Itu yang membuat penarikan bertahap tidak pernah melewatkan atau menggandakan baris ketika dua dokumen berubah pada detik yang sama.",
    },
    { kind: "sub", judul: "Kalau jawabannya bukan 200" },
    {
      kind: "poin",
      butir: [
        "400 — permintaannya yang salah: parameter yang bukan angka, tanggal yang tidak terbaca, `limit` di luar batas. Pesannya menyebut parameter mana.",
        "401 — kredensialnya bermasalah: tidak ada, salah, atau sudah dicabut. Ketiganya dijawab sama persis, dan itu disengaja. Jawaban yang membedakan ketiganya akan menjadikan endpoint ini alat untuk menebak token yang masih hidup.",
        "403 — tokennya sah, tetapi perannya tidak berhak. Jawabannya menyebut izin yang kurang, supaya yang perlu diminta adalah token berperan lain, bukan tebakan peran satu per satu.",
        "429 — terlalu banyak permintaan. Batasnya dihitung per TOKEN, bukan per alamat IP: dua sistem dengan tokennya masing-masing tidak saling menghabiskan jatah, dan satu program yang mengamuk tidak mematikan yang lain.",
        "Ulangi permintaan yang gagal karena 429 atau galat jaringan dengan jeda yang membesar, bukan seketika. Penarik yang mengulang tanpa jeda adalah penarik yang menghabiskan jatahnya sendiri lalu menyalahkan servernya.",
      ],
    },
    { kind: "sub", judul: "Spesifikasi mesin, untuk yang membangkitkan kode" },
    {
      kind: "paragraf",
      teks:
        "Seluruh bentuk di atas juga tersedia sebagai dokumen OpenAPI 3.1 di alamat `/api/v1/openapi.json` — setiap endpoint, setiap kolom, setiap tipe, beserta izin yang dituntutnya. Ia bisa dibuka pembangkit klien (kode penarik yang ditulis mesin), penguji API, atau alat dokumentasi apa pun yang membaca OpenAPI.",
    },
    {
      kind: "catatan",
      teks:
        "Alamat spesifikasi itu TIDAK menuntut token, dan itu disengaja: seseorang harus bisa membaca bentuk API ini sebelum memutuskan meminta kredensial. Yang publik hanyalah BENTUKNYA — nama kolom dan tipe. Satu baris data pun tidak bisa dibaca tanpa token yang sah.",
    },
    {
      kind: "paragraf",
      teks:
        "Yang tidak akan Anda temukan di sini: janji waktu tanggap, jaminan ketersediaan, dan versi kedua. `v1` di alamatnya adalah janji yang sudah dibuat — bentuk jawaban yang sudah terbit tidak diubah diam-diam; kolom baru boleh muncul, kolom yang ada tidak dicabut tanpa alamat versi baru.",
    },
  { kind: "sub", judul: "Menerbitkan dan mencabut token" },
  {
    kind: "langkah",
    butir: [
      "Buka Bantuan & Pengaturan → Token API.",
      "Isi Nama (mis. nama sistem yang memakainya) dan pilih Berperan sebagai.",
      "Tekan Terbitkan dan SALIN tokennya saat itu juga — ia hanya ditampilkan sekali.",
      "Untuk menghentikan akses, tekan Cabut pada baris token; penolakan berlaku seketika.",
    ],
  },
  {
    kind: "gambar",
    berkas: "perusahaan/token-api",
    alt: "Halaman Token API dengan formulir Terbitkan token baru berisi nama dan peran, serta daftar token yang masih kosong.",
  },
  ];

const PAKET: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Satu akun pelanggan boleh memegang beberapa perusahaan. Yang membedakan paket adalah kuota, bukan fitur mana yang dinyalakan: berapa perusahaan dan berapa pengguna yang boleh ada di dalamnya. Kuota diperiksa saat Anda menambah, bukan sebagai tagihan kejutan di akhir bulan.",
    },
    { kind: "sub", judul: "Kenapa setiap perusahaan punya buku yang benar-benar terpisah" },
    {
      kind: "paragraf",
      teks:
        "Buku besar setiap perusahaan hidup di basis datanya sendiri, bukan sebagai kolom penanda perusahaan di dalam satu tabel bersama. Bedanya terlihat saat terjadi kesalahan. Dengan satu tabel bersama, sebuah kueri yang lupa menyaring perusahaan akan mengembalikan transaksi perusahaan lain tanpa memunculkan galat. Dengan basis data terpisah, tidak ada yang bisa dikembalikan: jalur yang kehilangan konteks perusahaan langsung GAGAL di tempat kejadiannya.",
    },
    {
      kind: "diagram",
      nama: "buku-per-pt",
      keterangan:
        "Yang dibagi bersama hanyalah akun pengguna dan keanggotaannya; angkanya tidak pernah berbagi tempat.",
    },
    {
      kind: "poin",
      butir: [
        "Yang berpindah saat Anda berganti perusahaan adalah seluruh buku, bukan sebuah penyaring. Nama perusahaan yang sedang dibuka karena itu selalu terlihat di bilah atas.",
        "Pengguna, daftar perusahaan, dan keanggotaan tinggal di satu tempat bersama — orang yang sama boleh masuk ke beberapa perusahaan dengan peran yang berbeda di masing-masing.",
        "Alamat setiap halaman memuat nama akun dan nama perusahaan, jadi tautan yang Anda salin selalu menunjuk buku yang sama saat dibuka orang lain.",
        "Nama perusahaan boleh diganti kapan saja; alamat pendeknya (slug) tidak — ia ikut menyusun nama basis datanya, dan setiap tautan yang pernah dibagikan berdiri di atasnya.",
      ],
    },
  {
    kind: "catatan",
    teks:
      "Kuota yang sedang terpakai terbaca di panel Akun & Perusahaan; perbandingan paket dan cara naik-turun paket dijelaskan di halaman uji coba, aktivasi, dan tagihan.",
  },
  { kind: "lihat-juga", slug: ["langganan-dan-tagihan", "panel-akun"] },
  ];

const DATA_ANDA: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Seluruh pembukuan setiap perusahaan Anda bisa diunduh sendiri, kapan saja, tanpa meminta kepada siapa pun. Itu keputusan yang sengaja: data pembukuan adalah milik Anda, dan hak untuk mengambilnya tidak boleh bergantung pada hubungan yang sedang baik dengan penyedia layanannya.",
    },
    {
      kind: "poin",
      butir: [
        "Ekspor tetap bekerja ketika langganan sedang tertunggak dan seluruh perusahaan dalam keadaan hanya-baca. Justru dalam keadaan itulah ia paling dibutuhkan.",
        "Permintaan penghapusan akun adalah permintaan, bukan tombol yang langsung menghapus — ia mengakhiri kontrak, dan pelaksanaannya berjalan sebagai proses dengan tenggang waktu.",
        "Sebagian jejak audit dianonimkan, tidak ikut terhapus. Catatan tentang siapa menyetujui sebuah pembayaran adalah bagian dari pembukuan pihak lain juga, dan menghapusnya melubangi buku yang masih harus dipertanggungjawabkan.",
      ],
    },
    {
      kind: "catatan",
      teks:
        "Naskah hukumnya — Syarat Layanan dan Kebijakan Privasi — berdiri sebagai halaman tersendiri dan bisa dibaca sebelum Anda menyetujuinya. Halaman ini menjelaskan mekanismenya di dalam produk; kalau keduanya berselisih, yang mengikat adalah naskah hukumnya.",
    },
  { kind: "sub", judul: "Mengunduh seluruh data" },
  {
    kind: "langkah",
    butir: [
      "Sebagai pemilik akun, buka panel akun → Data & Privasi.",
      "Tekan Siapkan Ekspor Data (ZIP). Penyiapannya berjalan di latar dan menunjukkan persentasenya.",
      "Tekan Unduh ZIP. Isinya berkas CSV untuk setiap tabel setiap perusahaan, yang terbuka di Excel atau LibreOffice. Berkasnya disimpan tujuh hari.",
    ],
  },
  {
    kind: "gambar",
    berkas: "tenant/data-privasi",
    alt: "Halaman Data & Privasi dengan tombol Siapkan Ekspor Data (ZIP) dan kotak merah Minta Penghapusan Akun.",
  },
  {
    kind: "paragraf",
    teks:
      "Minta Penghapusan Akun menutup seluruh akses dan menganonimkan data pribadi setelah masa tenggang 30 hari; selama tenggang itu permintaan bisa dibatalkan, dan semua pemilik diberi tahu lewat surel. Buku pembukuannya sendiri tidak ikut terhapus — undang-undang mewajibkannya disimpan sepuluh tahun.",
  },
  ];

/** Isi setiap halaman, dikunci pada daftar isi lewat `DocSlug`. */
const LAPORAN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Hampir setiap laporan di aplikasi ini menanyakan tanggal sebelum menampilkan satu angka pun, dan itu bukan formalitas. Buku besar adalah daftar KEJADIAN yang masing-masing bertanggal, bukan daftar saldo. Pertanyaan berapa laba perusahaan baru punya jawaban setelah Anda menyebut sejak kapan sampai kapan, sama seperti jarak tempuh yang perlu titik awal.",
    },
    {
      kind: "paragraf",
      teks:
        "Karena itu ada dua jenis laporan, dan membedakannya adalah satu-satunya hal yang benar-benar perlu Anda hafal. Laporan PERIODE menjumlahkan apa yang terjadi di antara dua tanggal: Laba/Rugi, Arus Kas, Penjualan per Pelanggan. Laporan POSISI memotret keadaan pada SATU tanggal: Neraca, Neraca Saldo, Nilai Persediaan. Yang pertama bertanya “apa yang terjadi”, yang kedua bertanya “apa yang saya punya sekarang”.",
    },
    { kind: "sub", judul: "Kenapa laporan yang sama bisa memberi dua angka" },
    {
      kind: "paragraf",
      teks:
        "Laporan yang Anda buka hari ini bisa berbeda dengan salinan yang dicetak minggu lalu untuk periode yang sama. Tiga sebab yang paling sering, dan semuanya wajar: ada transaksi baru yang dicatat mundur ke periode itu; ada dokumen yang tadinya menunggu persetujuan lalu jurnalnya terbit; atau periodenya belum ditutup, sehingga isinya masih boleh bertambah.",
    },
    {
      kind: "paragraf",
      teks:
        "Itulah hubungan antara halaman ini dan Tutup Buku. Selama sebuah bulan masih terbuka, laporannya adalah gambaran sementara — benar hari ini, dan boleh berubah besok. Menutup bulan mengubahnya menjadi angka yang tidak bisa bergerak lagi. Laporan yang diberikan kepada bank, pemegang saham, atau kantor pajak sebaiknya diambil dari bulan yang sudah ditutup.",
    },
    { kind: "sub", judul: "Angka di beranda dan angka di laporan" },
    {
      kind: "paragraf",
      teks:
        "Kartu di beranda dan laporan cetak bisa menyebut angka yang berbeda pada hari yang sama, dan keduanya benar. Beranda meringkas periode berjalan sampai detik ini; laporan menjawab persis periode yang Anda minta. Kalau keduanya harus cocok, samakan dulu periodenya — hampir semua selisih yang dilaporkan orang berakhir di sini.",
    },
    {
      kind: "poin",
      butir: [
        "Setiap laporan bisa diekspor ke PDF atau Excel, dan berkasnya memuat periode yang dipakai di kepala halaman — jadi salinan yang beredar tidak pernah kehilangan konteksnya.",
        "Nilai ditampilkan dalam IDR, yaitu nilai dasar buku besar. Transaksi valas sudah dikonversi memakai kurs yang tercatat pada dokumennya, bukan kurs hari ini.",
        "Pilahan per pusat biaya hanya ditawarkan pada Laba/Rugi. Neraca sengaja tidak: menyaring neraca per unit membuat sisi kiri dan kanannya tidak lagi seimbang, kecuali ada akun antar-unit yang menjembataninya.",
        "Realisasi vs Anggaran membaca angka realisasinya dari buku besar yang sama dengan Laba/Rugi — jadi kalau keduanya berbeda, yang berbeda adalah periodenya, bukan sumbernya.",
      ],
    },
    { kind: "sub", judul: "Paket laporan: banyak laporan satu periode, satu berkas" },
    {
      kind: "paragraf",
      teks:
        "Untuk penutupan bulan, auditor, atau bank, biasanya yang diminta bukan satu laporan melainkan seperangkat. Tombol Paket laporan di Pusat Laporan membuatnya sekaligus: pilih periode (bulanan, kuartalan, tahunan, atau rentang khusus), centang laporannya, pilih formatnya, lalu unduh satu berkas ZIP berisi halaman ringkasan, satu PDF per laporan, dan satu buku kerja Excel dengan satu lembar per laporan.",
    },
    {
      kind: "langkah",
      butir: [
        "Buka Pusat Laporan, tekan Paket laporan.",
        "Pilih periodenya. Laporan posisi (Neraca, Neraca Saldo, Umur Piutang/Utang) diambil per tanggal akhir periode; laporan periode menjumlahkan seluruh rentangnya.",
        "Set penutupan bulanan sudah tercentang: Neraca, Laba/Rugi, Arus Kas, Perubahan Ekuitas, Neraca Saldo, Umur Piutang, Umur Utang. Tambahkan atau kurangi sesuai kebutuhan.",
        "Pilih PDF, Excel, atau keduanya, lalu tekan Buat paket. Kemajuannya tampil di layar, dan berkasnya terunduh begitu siap.",
      ],
    },
    {
      kind: "poin",
      butir: [
        "Angkanya sama persis dengan laporan yang dibuka satu per satu: paket memakai mesin laporan yang sama, bukan hitungan kedua.",
        "Laporan yang modulnya tidak aktif untuk perusahaan ini, atau yang tidak boleh Anda buka, tidak ikut — dan halaman ringkasan menyebutnya beserta alasannya, sehingga penerima berkas tahu apa yang tidak ada di dalamnya.",
        "Menekan tombol yang sama lagi dalam beberapa menit memakai paket yang sedang dibuat, bukan membuat salinan kedua.",
        "Berkas paket, seperti setiap berkas ekspor, disimpan 7 hari lalu dihapus otomatis. Sesudah itu, buat ulang paketnya.",
      ],
    },
    {
      kind: "catatan",
      teks:
        "Laporan tidak pernah menghitung ulang apa pun sendiri. Ia menjumlahkan jurnal yang sudah ada. Kalau sebuah angka terasa salah, yang perlu dicari adalah transaksi mana yang menyusunnya, bukan rumusnya. Setiap laporan bisa ditelusuri sampai ke barisnya.",
    },
  { kind: "sub", judul: "Membuka dan mengekspor laporan" },
  {
    kind: "paragraf",
    teks:
      "Pusat Laporan mengelompokkan semua laporan per kategori: Keuangan, Penjualan, Pembelian, Stok, Kas & Bank, dan Pajak. Neraca Saldo hanya tampil saat Mode Akuntan menyala.",
  },
  {
    kind: "gambar",
    berkas: "laporan/pusat-laporan",
    alt: "Pusat Laporan dengan tombol Paket laporan dan kartu Neraca Saldo, Laba / Rugi, Beban menurut Sifat, Laba Rugi per Proyek, Perubahan Ekuitas, Neraca, Arus Kas, dan Realisasi vs Anggaran.",
  },
  {
    kind: "langkah",
    butir: [
      "Tekan Buka laporan pada kartunya.",
      "Atur periode (atau Per Tanggal untuk neraca), pusat biaya, dan pembanding bila perlu, lalu Tampilkan.",
      "Baca Ringkasan Bahasa Sehari-hari di atas tabel, lalu ekspor dengan Pratinjau & Cetak (PDF) atau Unduh Excel.",
    ],
  },
  {
    kind: "gambar",
    berkas: "laporan/laba-rugi",
    alt: "Laporan Laba / Rugi Januari sampai Oktober dengan ringkasan bahasa sehari-hari, kartu uang masuk, laba kotor, uang keluar, selisih, dan tabel pendapatan serta beban pokok.",
  },
  {
    kind: "gambar",
    berkas: "laporan/neraca",
    alt: "Laporan Neraca per tanggal dengan ringkasan harta, utang, dan modal, serta rincian akun aset.",
  },
  {
    kind: "langkah",
    butir: [
      "Di Pusat Laporan, tekan Paket laporan.",
      "Pilih periode — bulanan, kuartalan, tahunan, atau rentang khusus.",
      "Centang laporannya. Set bawaan memilih Neraca, Laba/Rugi, Arus Kas, Perubahan Ekuitas, Neraca Saldo, Piutang, dan Utang; paling banyak 20 laporan.",
      "Pilih format PDF, Excel, atau keduanya, lalu tekan Buat paket dan tunggu persentasenya selesai.",
      "Unduh berkas ZIP-nya. Paket disimpan tujuh hari.",
    ],
  },
  {
    kind: "gambar",
    berkas: "laporan/paket-laporan",
    alt: "Dialog Unduh paket laporan dengan pilihan periode bulanan September, daftar laporan yang dicentang, dan format PDF serta Excel.",
  },
  {
    kind: "paragraf",
    teks:
      "Anggaran & Target (menu Rencana & Target) menyimpan anggaran per akun dan target penjualan, lalu membandingkannya dengan realisasi. Menyimpan anggaran tidak memposting jurnal apa pun.",
  },
  {
    kind: "gambar",
    berkas: "laporan/anggaran",
    alt: "Halaman Anggaran & Target dengan tiga kartu: Realisasi vs Anggaran, Anggaran Akun, dan Target Penjualan.",
  },
    { kind: "istilah", kunci: ["laba_rugi", "neraca", "tutup_periode"] },
  ];

const COCOK_ACCURATE: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Banyak perusahaan tidak berpindah sistem dalam satu hari. Selama beberapa bulan dua buku berjalan berdampingan: yang lama di Accurate, yang baru di sini. Yang penting selama masa itu adalah memastikan keduanya mengatakan hal yang sama. Halaman “Cocokkan dengan Accurate” mengerjakan itu, dan tidak lebih.",
  },
  {
    kind: "paragraf",
    teks:
      "Anda mengekspor laporan Rincian Buku Besar dari Accurate, mengunggahnya apa adanya, lalu melihat kedua buku berdampingan per akun: saldo awal, jumlah debit, jumlah kredit, saldo akhir. Di bawahnya berdiri daftar yang jauh lebih berguna daripada angka totalnya — transaksi yang hanya ada di salah satu sisi.",
  },
  {
    kind: "langkah",
    butir: [
      "Ekspor laporan Rincian Buku Besar dari Accurate untuk periode yang ingin dicocokkan.",
      "Unggah berkasnya apa adanya — tidak perlu dirapikan lebih dulu.",
      "Baca kedua buku berdampingan per akun: saldo awal, jumlah debit, jumlah kredit, saldo akhir.",
      "Telusuri daftar di bawahnya — transaksi yang hanya ada di salah satu sisi. Di situlah selisihnya menjelaskan dirinya.",
    ],
  },
  { kind: "sub", judul: "Kenapa hasilnya tidak bisa langsung diimpor" },
  {
    kind: "paragraf",
    teks:
      "Rincian buku besar TIDAK bisa diubah menjadi jurnal. Itu sifat laporannya, bukan keterbatasan aplikasi ini: laporan itu mencetak satu akun beserta mutasinya, dan sisi lawan setiap transaksi tidak ada di dalamnya. Beban asuransi Rp 1,6 juta yang tercatat di sana tidak menyebutkan uangnya keluar dari mana: kas, utang usaha, atau uang muka.",
  },
  {
    kind: "paragraf",
    teks:
      "Setiap catatan di buku ini punya dua sisi yang jumlahnya harus sama, dan aplikasi ini menolak jurnal yang timpang. Jadi satu-satunya cara mengimpor laporan itu sebagai jurnal adalah MENEBAK lawan akunnya — dan sebuah tebakan yang berhasil disimpan tidak akan terlihat sebagai kesalahan sampai neraca dibaca orang. Karena itu halaman ini hanya membaca. Tidak ada akun yang dibuat, tidak ada jurnal yang diposting.",
  },
  {
    kind: "catatan",
    teks:
      "Mengunggah berkas ke halaman ini tidak pernah mengubah satu angka pun di buku Anda. Kalau Anda mengunggah berkas yang salah, yang terjadi paling buruk adalah laporan pencocokan yang tidak masuk akal — bukan pembukuan yang rusak.",
  },
  { kind: "sub", judul: "Berkasnya jangan disunting dulu" },
  {
    kind: "paragraf",
    teks:
      "Tombol Ekspor Accurate menghasilkan halaman cetak berformat Excel, bukan tabel: nama perusahaan dan judul laporan diulang di setiap halaman, judul kolomnya berdiri di baris kelima dan muncul lagi tiap ganti halaman, dan kolom keterangan memuat dua baris dalam satu sel. Semua itu dirapikan otomatis saat dibaca — jadi unggah apa adanya, jangan dirapikan dulu di Excel.",
  },
  {
    kind: "paragraf",
    teks:
      "Ada satu perilaku Accurate yang akibatnya terlihat di hasil. Ketika sebuah baris jatuh persis di ganti halaman, selnya ikut terpotong dan nomor referensinya terlempar sendirian ke puncak halaman berikutnya. Potongan itu disambungkan kembali ke barisnya, dan setiap sambungan dilaporkan di layar beserta nomor barisnya. Potongan yang tidak bisa dipastikan milik baris mana dibiarkan dan dilaporkan apa adanya, sebab menempelkan nomor referensi ke transaksi yang salah lebih berbahaya daripada satu baris aneh yang bisa Anda periksa sendiri.",
  },
  { kind: "sub", judul: "Membaca hasilnya" },
  {
    kind: "poin",
    butir: [
      "Selisih selalu berarah “di sini dikurangi Accurate”. Angka positif berarti buku ini lebih besar.",
      "Sebuah akun bisa dinyatakan cocok meski transaksinya tidak berpasangan satu-satu — itu wajar dan bukan kesalahan: satu jurnal gabungan di sini sah menutup beberapa baris di sana. Yang menentukan cocok atau tidak adalah angkanya.",
      "Transaksi yang cocok nominal dan referensinya tetapi berbeda tanggal ditandai tersendiri. Itu temuan, bukan sekadar kecocokan: satu transaksi yang dibukukan di dua tanggal berbeda menggeser laba dua periode sekaligus.",
      "Nomor referensi yang sama muncul dua kali dengan nominal yang sama juga ditandai: kandidat pembukuan ganda di sisi Accurate. Hal seperti ini tidak terlihat dari saldo akhirnya.",
    ],
  },
  { kind: "sub", judul: "Rancangan saldo awal" },
  {
    kind: "paragraf",
    teks:
      "Kalau Anda pindah seluruhnya alih-alih berjalan paralel, saldo akhir menurut Accurate bisa diunduh sebagai rancangan saldo awal: satu berkas Excel berisi akun, sisi debit atau kredit, dan nominalnya. Sisinya ditentukan dari bagan akun DI SINI, bukan dari berkasnya. Laporan Accurate tidak menyebut tipe akun sama sekali, sehingga angka 1.000 di akun beban berarti debit sementara angka yang sama di akun utang berarti kredit. Akun yang belum ada di bagan akun ini ditandai, bukan ditebak sisinya.",
  },
  {
    kind: "paragraf",
    teks:
      "Berkas itu tidak diunggah balik ke mana pun. Ia bahan untuk diperiksa mata manusia, lalu dimasukkan lewat wisaya saldo awal — pintu yang sama yang dipakai perusahaan baru, dan yang sengaja hanya bisa dilalui sekali.",
  },
  {
    kind: "gambar",
    berkas: "akuntansi/cocokkan-accurate",
    alt: "Halaman Integrasi Accurate dengan pemberitahuan bahwa halaman ini hanya membaca, petunjuk menyiapkan berkas Rincian Buku Besar, dan kotak unggah berkas .xlsx.",
  },
  { kind: "istilah", kunci: ["buku_besar", "saldo_awal", "neraca_saldo"] },
];

const MANUFAKTUR: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Sebuah perusahaan dagang menjual barang yang ia beli, jadi harga pokoknya adalah harga belinya. Perusahaan yang MEMBUAT barang tidak punya angka semudah itu: yang keluar dari pabrik tidak pernah ada harga belinya. Ia berharga sebanyak yang dihabiskan untuk membuatnya — bahan, upah orang yang mengerjakannya, dan biaya pabrik yang menempel pada jam kerja itu (listrik, mesin, sewa). Modul Manufaktur ada untuk menghitung ketiganya dan menaruh hasilnya sebagai harga pokok barang jadi.",
  },
  {
    kind: "paragraf",
    teks:
      "Kuncinya satu gagasan: selama batch dikerjakan, bahannya sudah keluar dari gudang tetapi barang jadinya belum ada. Nilainya harus menunggu di suatu tempat, dan tempat itu adalah Barang Dalam Proses. Ia bukan gudang dan tidak bisa dilihat isinya di rak — ia ruang tunggu di neraca. Saat batch selesai, seluruh isinya berpindah menjadi harga pokok barang jadi, dan saldonya kembali nol.",
  },
  {
    kind: "istilah",
    kunci: ["resep_produksi", "perintah_produksi", "barang_dalam_proses", "overhead_pabrik"],
  },
  { kind: "sub", judul: "Tiga layar, satu urutan" },
  {
    kind: "paragraf",
    teks:
      "Ketiga layar modul ini bukan tiga fitur terpisah; ia satu urutan, dan yang belakangan tidak bisa dipakai sebelum yang di depannya ada.",
  },
  {
    kind: "langkah",
    butir: [
      "Stasiun Kerja — tempat pekerjaan dilakukan, beserta tarif upah dan tarif overhead per jam. Ini yang mengubah “3 jam di penggilingan” menjadi rupiah.",
      "Resep Produksi — bahan apa saja dan tahapan apa saja untuk sekian unit keluaran. Ini rencananya.",
      "Perintah Produksi — satu batch yang benar-benar dijalankan. Ini satu-satunya dari ketiganya yang menulis ke buku besar.",
    ],
  },
  {
    kind: "catatan",
    teks:
      "Stasiun Kerja dan Resep Produksi tidak pernah menyentuh buku besar. Menyunting tarif atau mengganti resep tidak mengubah satu angka pun di laporan; yang berubah hanyalah perhitungan batch BERIKUTNYA. Batch yang sudah berjalan memakai angka yang berlaku saat ia dijalankan.",
  },
  { kind: "sub", judul: "Susut MEMBAGI, bukan mengalikan" },
  {
    kind: "paragraf",
    teks:
      "Sebuah bahan bisa diberi persentase susut: bagian yang hilang dalam proses — menguap, tercecer, terpotong. Yang mudah keliru adalah arah hitungnya. Kalau resep butuh 1.000 kg BERSIH dan susutnya 5%, yang harus disiapkan bukan 1.050 kg. Menambah 5% dari kebutuhan bersih memberi 1.050 kg, lalu 5% darinya hilang dan tersisa 997,5 kg — kurang. Yang benar adalah membagi: jumlah yang setelah kehilangan 5% masih menyisakan tepat 1.000 kg.",
  },
  {
    kind: "kode",
    bahasa: "hitung",
    teks: "kotor = bersih ÷ (1 − susut)\n     = 1.000 ÷ (1 − 0,05)\n     = 1.052,632 kg",
  },
  {
    kind: "paragraf",
    teks:
      "Selisihnya kecil pada satu bahan dan berlipat pada resep panjang, dan ia selalu ke arah yang sama: kurang, bukan lebih. Aplikasi ini selalu membagi. Susut 100% ditolak — tidak ada jumlah yang bisa disiapkan supaya tersisa sesuatu ketika semuanya hilang.",
  },
  { kind: "sub", judul: "Resep bertingkat: yang dihitung dan yang diambil" },
  {
    kind: "paragraf",
    teks:
      "Sebuah bahan bisa saja bukan barang yang dibeli, tetapi barang yang perusahaan ini buat sendiri dan punya resepnya. Halaman rincian resep menurunkan yang seperti itu sampai ke bahan yang benar-benar dibeli, supaya biaya standarnya lengkap sampai ke dasar. Yang ditelusuri itu ditandai sebagai rakitan antara; yang tidak punya resep adalah bahan daun.",
  },
  {
    kind: "catatan",
    nada: "peringatan",
    teks:
      "Penurunan itu hanya untuk MENGHITUNG BIAYA. Perintah produksi tidak ikut menurunkannya: ia mengambil komponen langsung resepnya dari gudang, apa adanya. Jadi rakitan antara harus sudah ada stoknya — dibuat lewat perintah produksinya sendiri lebih dulu. Kalau belum ada, batchnya ditolak karena stok kurang, bukan diam-diam menggantinya dengan bahan-bahan penyusunnya.",
  },
  { kind: "sub", judul: "Tiga jurnal untuk satu batch" },
  {
    kind: "paragraf",
    teks:
      "Satu perintah produksi punya dua tindakan yang Anda lakukan — mulai dan selesai — tetapi ia menulis tiga jurnal. Tahu ketiganya membuat saldo Barang Dalam Proses bisa dibaca kapan saja.",
  },
  {
    kind: "langkah",
    butir: [
      "Saat dimulai: bahan keluar dari gudang dan nilainya masuk ke Barang Dalam Proses. Stok bahan turun; belum ada barang jadi.",
      "Saat selesai, langkah pertama: jam kerja yang dilaporkan dikalikan tarif stasiunnya, lalu upah dan overhead ikut masuk ke Barang Dalam Proses.",
      "Saat selesai, langkah kedua: seluruh isi Barang Dalam Proses keluar dan menjadi nilai barang jadi yang masuk gudang.",
    ],
  },
  {
    kind: "paragraf",
    teks:
      "Urutan dua langkah terakhir tidak boleh dibalik, dan aplikasi ini tidak membalikkannya: upah dan overhead harus sudah berada di dalam ruang tunggu sebelum isinya dihitung, kalau tidak barang jadinya lahir dengan harga pokok yang hanya berisi bahan. Kalau semuanya benar, saldo Barang Dalam Proses sebuah perintah produksi yang sudah selesai adalah nol. Saldo yang tersisa di sana berarti ada batch yang belum diselesaikan, bukan selisih yang perlu dicari.",
  },
  {
    kind: "catatan",
    teks:
      "Bahan yang keluar untuk produksi TIDAK menjadi harga pokok penjualan. Ia belum terjual; ia berpindah bentuk. Harga pokok penjualan baru lahir ketika barang jadinya benar-benar dijual, dan angkanya adalah yang dihitung batch ini. Inilah sebabnya mutasi stok milik perintah produksi tidak ikut membuat jurnal sendiri seperti mutasi stok biasa.",
  },
  { kind: "sub", judul: "Kenapa jam sungguhan, bukan jam standar" },
  {
    kind: "paragraf",
    teks:
      "Resep menyebut berapa jam SEHARUSNYA sebuah tahapan memakan waktu. Upah dan overhead yang masuk ke Barang Dalam Proses dihitung dari jam yang benar-benar dilaporkan, bukan dari angka itu. Jam standar adalah rencana, dan membiayai barang jadi dengan rencana membuat setiap batch terlihat persis sesuai rencana selamanya: mesin yang macet setengah hari tidak akan muncul di angka mana pun.",
  },
  {
    kind: "paragraf",
    teks:
      "Tahapan yang jamnya belum dilaporkan menyerap nol, dan itu berbeda dari dikerjakan dalam waktu nol. “Belum dilaporkan” adalah keadaan yang bisa diperbaiki; kalau ia diperlakukan sebagai nol jam, batchnya akan selesai dengan harga pokok yang kurang tanpa ada yang menandainya.",
  },
  { kind: "sub", judul: "Varians adalah informasi, bukan jurnal" },
  {
    kind: "paragraf",
    teks:
      "Setelah batch selesai, aplikasi membandingkan rencana dengan kenyataan: bahan yang dipakai lawan bahan yang diresepkan, jam sungguhan lawan jam standar, keluaran yang jadi lawan keluaran yang dijanjikan. Selisih-selisih itu ditampilkan, dan hanya itu — tidak satu pun menjadi jurnal.",
  },
  {
    kind: "poin",
    butir: [
      "Harga pokok barang jadi Anda adalah biaya yang SUNGGUHAN terpakai; tidak ada selisih yang tersisa untuk dijurnal.",
      "Varians di sini menjelaskan kenapa batch ini lebih mahal. Ia tidak menentukan berapa yang harus dicatat.",
      "Karena itu memperbaiki resep yang ternyata terlalu optimistis tidak pernah mengubah laporan keuangan yang sudah terbit — ia hanya membuat pembandingnya lebih berguna.",
    ],
  },
  { kind: "sub", judul: "Modul ini tidak menyala sendiri" },
  {
    kind: "paragraf",
    teks:
      "Berbeda dari modul lain, Manufaktur harus dinyalakan sendiri di halaman Modul Usaha, dan memilih kategori usaha Manufaktur saat setup sudah menyalakannya. Perusahaan dagang tidak akan pernah menemukannya muncul begitu saja. Saat dinyalakan, tiga akun ditambahkan ke Daftar Akun bila belum ada: Barang Dalam Proses, Beban Upah Langsung, dan Beban Overhead Pabrik — tanpa ketiganya jurnal di atas tidak punya tempat mendarat.",
  },
  { kind: "sub", judul: "Mengisi ketiga layarnya" },
  {
    kind: "paragraf",
    teks:
      "Stasiun Kerja mencatat kode, tarif upah per jam, dan overhead per jam setiap tempat kerja. Isi dulu sebelum resep, sebab langkah kerja resep menunjuk stasiun.",
  },
  {
    kind: "gambar",
    berkas: "manufaktur/stasiun-kerja",
    alt: "Formulir stasiun kerja baru di perusahaan manufaktur contoh, dengan isian kode, nama, tarif upah, dan overhead per jam.",
  },
  {
    kind: "paragraf",
    teks:
      "Resep Produksi menyebut barang yang dibuat, hasil sekali jalan, bahan beserta susutnya, dan langkah kerja di stasiun mana.",
  },
  {
    kind: "gambar",
    berkas: "manufaktur/resep",
    alt: "Formulir Resep Produksi Baru dengan bagian barang yang dibuat, bahan beserta persentase susut, dan langkah kerja.",
  },
  {
    kind: "langkah",
    butir: [
      "Buat perintah produksi dari sebuah resep dan jumlah yang direncanakan (status Draf).",
      "Tekan Keluarkan bahan saat bahan diambil dari gudang — stok bahan berkurang dan pindah ke Barang Dalam Proses.",
      "Tekan Catat hasil & selesaikan dengan jumlah jadi dan jam kerja sungguhan — barang jadi masuk stok dengan harga pokoknya.",
    ],
  },
  {
    kind: "gambar",
    berkas: "manufaktur/perintah-produksi",
    alt: "Halaman Perintah Produksi di perusahaan manufaktur contoh.",
  },
];

const APA_YANG_BARU: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Halaman ini mencatat apa yang berubah di aplikasi, per pembaruan. Yang ditulis di sini hanya yang TERLIHAT saat Anda bekerja — menu baru, perilaku yang berganti, kesalahan yang diperbaiki. Pekerjaan di balik layar yang tidak mengubah apa pun bagi Anda sengaja tidak dicatat: catatan yang memuat segalanya berhenti dibaca.",
  },
  {
    kind: "paragraf",
    teks:
      "Nomor versi yang sedang Anda jalankan tertera di kaki menu samping. Sebutkan nomor itu ketika melaporkan masalah — ia yang memberi tahu kami persis versi mana yang Anda lihat, dan sering kali itu perbedaan antara masalah yang sudah diperbaiki dan yang belum pernah kami temui.",
  },
  {
    kind: "catatan",
    teks:
      "Pembaruan berlaku untuk semua perusahaan sekaligus, dan tidak pernah mengubah data yang sudah Anda catat. Menu yang muncul atau hilang bagi Anda juga bergantung pada modul yang dipakai perusahaan Anda dan pada hak akses Anda — jadi tidak semua yang tertulis di bawah otomatis tampak di layar Anda.",
  },
  { kind: "riwayat-rilis" },
];

const ALUR_USAHA: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Saat perusahaan Anda disiapkan, Anda memilih satu jenis usaha. Pilihan itu menyalakan sekumpulan modul — dan modul itulah yang menentukan menu apa yang muncul di layar. Halaman ini memperlihatkan urutan kerjanya dari ujung ke ujung untuk tiap jenis usaha, supaya Anda tahu tahap mana yang dikerjakan di mana.",
  },
  {
    kind: "catatan",
    teks:
      "Jenis usaha hanya menentukan TITIK AWAL, bukan batas permanen. Modul bisa dinyalakan atau dimatikan kapan saja di halaman Modul Usaha, dan alur Anda ikut berubah. Kalau sebuah menu yang disebut di bawah tidak ada di layar Anda, kemungkinan besar modulnya sedang mati — bukan aplikasinya yang tidak bisa.",
  },
  { kind: "sub", judul: "Perdagangan komoditas & ekspor" },
  {
    kind: "paragraf",
    teks:
      "Alur terpanjang, dan satu-satunya yang dimulai dari kontrak. Kontraknya bukan formalitas: ia yang memegang pembeli, jumlah, harga, dan mata uang — dan setiap dokumen sesudahnya mewarisi keempatnya. Faktur sebuah kontrak karena itu tidak bisa menagih pihak lain.",
  },
  {
    kind: "diagram",
    nama: "alur-komoditas",
    keterangan:
      "Enam tahap: kontrak, beli & terima stok, kirim dengan surat jalan, arsipkan dokumen ekspor, tagih dengan faktur dan e-Faktur, lalu terima uang dan tutup buku. Seluruh modul bawaan menyala.",
  },
  { kind: "sub", judul: "Distribusi & grosir" },
  {
    kind: "paragraf",
    teks:
      "Sama-sama bergudang, tetapi tanpa lapisan ekspor: tidak ada kontrak berjangka, tidak ada penerima barang di pelabuhan tujuan, dan tidak ada arsip dokumen pelabuhan. Kesepakatannya adalah fakturnya sendiri, jadi alurnya mulai dari barang masuk gudang.",
  },
  {
    kind: "diagram",
    nama: "alur-distribusi",
    keterangan:
      "Empat tahap: beli & terima stok, jual dengan faktur dan surat jalan, terima uang, lalu tutup buku. Modul Perdagangan dan Dokumen tidak menyala.",
  },
  { kind: "sub", judul: "Jasa & agensi" },
  {
    kind: "paragraf",
    teks:
      "Tidak ada barang sama sekali, dan itu memendekkan alurnya paling banyak: tanpa stok, tanpa surat jalan, tanpa harga pokok persediaan. Yang dijual adalah pekerjaan, jadi tahap pertamanya langsung faktur. Biayanya datang dari sisi lain — jasa pihak ketiga, barang habis pakai, dan penyusutan peralatan.",
  },
  {
    kind: "diagram",
    nama: "alur-jasa",
    keterangan:
      "Empat tahap: tagih pekerjaan dengan faktur, catat biaya dan penyusutan, terima uang, lalu tutup buku. Modul Stok, Perdagangan, dan Dokumen tidak menyala.",
  },
  {
    kind: "catatan",
    teks:
      "Retur tetap ada pada usaha jasa. Nota kredit atas faktur yang salah adalah hal biasa, dan retur memang milik modul Penjualan — bukan milik stok. Yang tidak ada hanyalah surat jalan, sebab tidak ada barang yang berpindah.",
  },
  { kind: "sub", judul: "Manufaktur" },
  {
    kind: "paragraf",
    teks:
      "Alur perdagangan, dengan satu tahap tambahan di tengahnya: mengubah barang menjadi barang lain. Sebuah pabrik tetap membeli, menjual, bergudang, dan mengekspor, jadi modulnya lebih luas daripada perdagangan, bukan lebih sempit.",
  },
  {
    kind: "diagram",
    nama: "alur-manufaktur",
    keterangan:
      "Enam tahap: beli bahan, siapkan stasiun kerja dan resep, jalankan perintah produksi, jual dan kirim barang jadi, terima uang, lalu tutup buku. Seluruh modul bawaan ditambah Manufaktur.",
  },
  {
    kind: "catatan",
    nada: "peringatan",
    teks:
      "Manufaktur adalah satu-satunya modul yang tidak pernah menyala sendiri. Memilih jenis usaha Manufaktur saat setup menyalakannya; jenis usaha lain harus menyalakannya sendiri di halaman Modul Usaha. Saat dinyalakan, tiga akun ikut lahir: Barang Dalam Proses, Beban Upah Langsung, dan Beban Overhead Pabrik.",
  },
  { kind: "sub", judul: "Kalau tidak satu pun cocok" },
  {
    kind: "paragraf",
    teks:
      "Ada pilihan Kustom, dan ia sengaja tidak menyalakan modul apa pun selain inti akuntansi. Menyalakan semuanya lalu meminta Anda mematikan yang tak dipakai akan meninggalkan sisa yang tidak bisa dibersihkan: akun yang terlanjur tersemai tetap tinggal, sebab akun yang pernah dipakai menjadi dasar angka yang sudah terbit.",
  },
  {
    kind: "paragraf",
    teks:
      "Arah sebaliknya aman dan lengkap: menyalakan sebuah modul kemudian membuat akun-akunnya lahir saat itu juga. Jadi mulailah dari yang Anda yakini, lalu tambahkan begitu kebutuhannya muncul.",
  },
  {
    kind: "istilah",
    kunci: ["kontrak", "surat_jalan", "faktur", "persediaan", "perintah_produksi"],
  },
];

/* ════════════════════════════════════════════════════════════════════════════
 * PANDUAN BERGAMBAR (Okt 2026) — urutan perjalanan pengguna:
 *   1. masuk & akun → 2. panel akun (tenant) → 3. langganan → 4. di dalam
 *   perusahaan. Setiap halaman: tujuan, prasyarat, langkah bergambar, kalau
 *   gagal, dan rujukan. Tangkapan layarnya dibangkitkan `bun run docs:screenshots`.
 * ══════════════════════════════════════════════════════════════════════════ */

const MASUK_DAN_AKUN: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Setiap orang yang memakai aplikasi ini punya SATU akun pribadi: satu alamat email, satu kata sandi. Akun itu tinggal di satu akun pelanggan (tenant) — wadah milik usaha Anda yang memuat semua perusahaan dan seluruh tim. Di dalam wadah itu satu orang boleh menjadi anggota beberapa perusahaan sekaligus, dengan peran yang berbeda di masing-masing. Karena itu tidak ada akun bersama untuk satu bagian: setiap catatan di jejak audit menyebut nama orangnya.",
  },
  {
    kind: "catatan",
    teks:
      "Halaman ini untuk semua pengguna. Tidak ada prasyarat selain email yang terdaftar — atau undangan yang masih berlaku.",
  },
  { kind: "sub", judul: "Akun pertama: lewat demo, bukan formulir daftar" },
  {
    kind: "paragraf",
    teks:
      "Pada pemasangan yang umum, pendaftaran mandiri DITUTUP. Membuka akun dimulai dari percakapan singkat — berapa perusahaan, berapa pengguna, dan dari sistem apa datanya dipindahkan — supaya kuota, migrasi, dan cara pembayarannya disepakati lebih dulu. Halaman Daftar karena itu menampilkan cara menghubungi tim, bukan formulir.",
  },
  {
    kind: "gambar",
    berkas: "auth/daftar-demo",
    alt: "Halaman daftar yang ditutup berjudul Jadwalkan demo atau minta penawaran, dengan tombol Hubungi lewat WhatsApp dan Kirim surel.",
    keterangan: "Tombol yang muncul mengikuti saluran yang disiapkan pengelola layanan; yang tidak disiapkan tidak ditampilkan.",
  },
  {
    kind: "langkah",
    butir: [
      "Hubungi tim lewat tombol WhatsApp, surel, atau Jadwalkan demo di halaman Daftar.",
      "Sesudah demo, pengelola layanan membuatkan akun UJI COBA atas nama usaha Anda — tanpa kartu dan tanpa tagihan otomatis.",
      "Pemilik akun menerima surel berjudul “Akun … siap dicoba”. Buka tautan di dalamnya.",
      "Buat kata sandi Anda di halaman Buat Kata Sandi Baru, lalu tekan Simpan Kata Sandi.",
      "Masuk dengan email dan kata sandi itu. Anda mendarat di panel Akun & Perusahaan.",
    ],
  },
  {
    kind: "gambar",
    berkas: "auth/atur-sandi-baru",
    alt: "Halaman Buat Kata Sandi Baru dengan kolom Kata Sandi Baru, Ulangi Kata Sandi Baru, dan tombol Simpan Kata Sandi.",
  },
  {
    kind: "catatan",
    nada: "peringatan",
    teks:
      "Tautan atur kata sandi berlaku 60 menit dan hanya bisa dipakai sekali. Kalau sudah kedaluwarsa, jangan minta surel sambutan dikirim ulang — pakai “Lupa kata sandi” di halaman masuk dengan email yang sama; hasilnya sama.",
  },
  {
    kind: "paragraf",
    teks:
      "Bila pengelola layanan membuka pendaftaran mandiri, halaman Daftar berisi formulir: nama Anda, nama akun, email, kata sandi, dan persetujuan syarat & kebijakan privasi. Aplikasi lalu mengirim tautan aktivasi yang berlaku 24 jam; akun baru lahir setelah Anda menekan Aktifkan akun saya di halaman tautan itu, dan langsung berstatus uji coba.",
  },
  { kind: "sub", judul: "Masuk" },
  {
    kind: "langkah",
    butir: [
      "Buka halaman masuk dan isi Email atau Nama Pengguna. Isian yang memuat @ dicari sebagai email; tanpa @ dicari sebagai nama pengguna lama.",
      "Isi Kata Sandi, lalu tekan Masuk.",
      "Pemilik dan admin akun mendarat di panel Akun & Perusahaan. Staf yang hanya anggota satu perusahaan langsung dibawa ke Beranda perusahaan itu.",
    ],
  },
  {
    kind: "gambar",
    berkas: "auth/login",
    alt: "Halaman Masuk dengan kolom Email atau Nama Pengguna, Kata Sandi, tombol Masuk, dan tautan Lupa kata sandi.",
  },
  {
    kind: "poin",
    butir: [
      "“Nama pengguna atau kata sandi salah” — periksa huruf besar-kecil kata sandi. Aplikasi sengaja tidak memberi tahu mana yang salah, supaya orang lain tidak bisa menebak email mana yang terdaftar.",
      "Terlalu banyak percobaan: setelah sepuluh kali gagal untuk satu akun dalam 15 menit, percobaan berikutnya ditolak sementara. Tunggu, atau atur ulang kata sandi.",
      "Langsung dibawa ke halaman Ganti Kata Sandi: kata sandi Anda baru saja diatur ulang oleh admin. Ganti dulu, baru halaman lain terbuka.",
    ],
  },
  { kind: "sub", judul: "Membuka buku perusahaan" },
  {
    kind: "paragraf",
    teks:
      "Masuk ke aplikasi belum membuka buku. Saat pertama kali membuka sebuah perusahaan pada hari itu, aplikasi menanyakan kata sandi Anda sekali lagi. Alasannya sama dengan mesin ATM yang menanyakan PIN walau kartunya sudah di dalam: sesi yang tertinggal terbuka di komputer bersama tidak boleh cukup untuk membaca angka perusahaan.",
  },
  {
    kind: "gambar",
    berkas: "auth/buka-buku",
    alt: "Layar Buka buku perusahaan yang meminta Sandi Anda untuk membuka pembukuan sebuah perusahaan contoh, dengan tombol Buka buku.",
  },
  {
    kind: "poin",
    butir: [
      "Sandinya sama dengan sandi masuk Anda — bukan sandi terpisah per perusahaan.",
      "Buku yang sudah dibuka tetap terbuka sekitar delapan jam, terpisah untuk setiap perusahaan.",
      "Salah ketik berkali-kali dibatasi seperti di halaman masuk: sepuluh kali dalam 15 menit.",
    ],
  },
  { kind: "sub", judul: "Memilih perusahaan" },
  {
    kind: "paragraf",
    teks:
      "Kalau Anda anggota lebih dari satu perusahaan, halaman Pilih Perusahaan menampilkan semuanya. Tekan Buka pada perusahaan yang ingin dikerjakan. Untuk berpindah di tengah pekerjaan, pakai Ganti perusahaan di menu nama Anda (pojok kanan atas) atau ikon panah di sebelah nama perusahaan di bilah atas.",
  },
  {
    kind: "gambar",
    berkas: "auth/pilih-perusahaan",
    alt: "Halaman Pilih Perusahaan berisi empat perusahaan contoh, masing-masing dengan tombol Buka, serta tombol Akun & Perusahaan dan Keluar.",
  },
  {
    kind: "catatan",
    teks:
      "“Belum ada perusahaan untuk akun ini” berarti akun Anda belum menjadi anggota perusahaan mana pun. Pemilik atau admin akun perlu mengundang Anda dari halaman Pengguna di perusahaan yang dituju.",
  },
  { kind: "sub", judul: "Menerima undangan" },
  {
    kind: "paragraf",
    teks:
      "Staf baru tidak dibuatkan kata sandi oleh siapa pun. Admin mengundang alamat emailnya; orang yang diundang menerima surel “Undangan bergabung ke …” dan menentukan kata sandinya sendiri.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka tautan di surel undangan. Tautan berlaku tujuh hari dan hanya sekali pakai.",
      "Isi Nama Tampilan (boleh dikosongkan), lalu kata sandi minimal 8 karakter dua kali.",
      "Tekan Buat Akun & Bergabung, lalu masuk dengan email dan kata sandi itu.",
    ],
  },
  {
    kind: "gambar",
    berkas: "auth/terima-undangan",
    alt: "Halaman Terima Undangan untuk email contoh, dengan kolom Nama Tampilan, kata sandi dan ulangannya, serta tombol Buat Akun & Bergabung.",
  },
  {
    kind: "poin",
    butir: [
      "“Tautan undangan tidak berlaku” — undangan sudah dipakai, dicabut, atau lewat tujuh hari. Minta admin mengirim undangan baru.",
      "“Kuota pengguna langganan ini sudah penuh” — semua kursi paket terpakai. Admin perlu mencabut undangan yang tidak jadi, menghapus pengguna yang sudah tidak aktif, atau menaikkan paket.",
      "Kalau email Anda sudah punya akun di akun pelanggan yang SAMA, Anda tidak diminta membuat akun lagi — Anda langsung ditambahkan dan menerima surel pemberitahuan. Satu email hanya bisa hidup di satu akun pelanggan.",
    ],
  },
  { kind: "sub", judul: "Lupa kata sandi" },
  {
    kind: "langkah",
    butir: [
      "Di halaman masuk, tekan “Lupa kata sandi? Atur ulang lewat email”.",
      "Isi email akun Anda dan tekan Kirim Tautan.",
      "Buka surel atur ulang dalam 60 menit, buat kata sandi baru, lalu masuk.",
    ],
  },
  {
    kind: "gambar",
    berkas: "auth/lupa-sandi",
    alt: "Halaman Lupa Kata Sandi dengan kolom Email berisi alamat contoh dan tombol Kirim Tautan.",
  },
  {
    kind: "gambar",
    berkas: "auth/lupa-sandi-terkirim",
    alt: "Konfirmasi Periksa kotak masuk Anda yang menyebut tautan atur ulang berlaku 60 menit.",
    keterangan:
      "Jawabannya selalu sama, terdaftar atau tidak — supaya halaman ini tidak bisa dipakai menebak email siapa yang punya akun.",
  },
  {
    kind: "poin",
    butir: [
      "Setiap permintaan baru membatalkan tautan yang lebih lama. Pakai surel yang paling akhir.",
      "Menyimpan kata sandi baru lewat tautan ini mengeluarkan SEMUA sesi lama Anda di perangkat lain — berguna kalau Anda curiga kata sandi diketahui orang.",
      "Surel tidak datang: periksa folder spam, pastikan ejaan email benar, dan tunggu beberapa menit sebelum meminta lagi (permintaan dibatasi tiga kali per 15 menit per email).",
    ],
  },
  { kind: "sub", judul: "Mengganti kata sandi" },
  {
    kind: "paragraf",
    teks:
      "Ganti kata sandi kapan saja lewat menu nama Anda → Ubah Kata Sandi, atau tombol Ganti Kata Sandi di halaman Pengaturan. Isi kata sandi saat ini, kata sandi baru, dan ulangannya; daftar periksa di bawah kolom menyala satu per satu ketika syaratnya terpenuhi.",
  },
  {
    kind: "gambar",
    berkas: "auth/ganti-sandi",
    alt: "Halaman Ganti Kata Sandi Anda dengan kolom kata sandi saat ini, kata sandi baru, ulangannya, dan daftar periksa syarat.",
  },
  {
    kind: "poin",
    butir: [
      "Syaratnya: 8 sampai 128 karakter, dan berbeda dari kata sandi saat ini. Tidak ada aturan wajib huruf besar atau simbol — kalimat panjang yang mudah Anda ingat lebih kuat daripada kata pendek yang rumit.",
      "Bila admin mengatur ulang kata sandi Anda, Anda mendapat kata sandi sementara dan WAJIB menggantinya saat masuk berikutnya.",
      "Mengganti kata sandi dari halaman ini tidak mengeluarkan sesi di perangkat lain. Kalau tujuannya mengusir sesi yang mencurigakan, pakai Lupa kata sandi.",
    ],
  },
  { kind: "sub", judul: "Keluar dan keamanan sesi" },
  {
    kind: "paragraf",
    teks:
      "Tekan nama Anda di pojok kanan atas, lalu Keluar. Menu yang sama memuat pilihan bahasa (Indonesia, English, 中文) dan tampilan (terang, gelap, ikut sistem), Ganti perusahaan bila Anda anggota lebih dari satu perusahaan, Akun & Perusahaan, dan Ubah Kata Sandi.",
  },
  {
    kind: "gambar",
    berkas: "auth/menu-pengguna",
    alt: "Menu nama pengguna yang terbuka, berisi nama dan peran, pilihan bahasa dan tampilan, Ganti perusahaan, Akun & Perusahaan, Ubah Kata Sandi, dan Keluar.",
  },
  {
    kind: "poin",
    butir: [
      "Sesi berakhir sendiri paling lama 24 jam setelah masuk. Perubahan peran atau pencabutan akses berlaku dalam hitungan menit, tanpa menunggu Anda keluar.",
      "Aplikasi pelanggan belum memakai verifikasi dua langkah (kode authenticator). Lindungi akun dengan kata sandi yang hanya dipakai di sini, dan selalu Keluar dari komputer bersama.",
      "Admin yang mengubah peran Anda atau mengatur ulang kata sandi Anda otomatis mengeluarkan sesi Anda — masuk lagi untuk mendapatkan hak yang baru.",
    ],
  },
  { kind: "lihat-juga", slug: ["panel-akun", "peran-dan-izin", "langganan-dan-tagihan"] },
];

const PANEL_AKUN: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Panel akun adalah lantai di ATAS perusahaan. Di sini diatur hal yang berlaku untuk seluruh usaha Anda: perusahaan mana saja yang ada, siapa timnya, nama dan alamat akun, langganan, serta ekspor data. Pembukuan sehari-hari tidak pernah dikerjakan di sini — begitu Anda menekan Buka pada sebuah perusahaan, Anda masuk ke bukunya.",
  },
  {
    kind: "catatan",
    teks:
      "Siapa melihat apa: setiap anggota akun bisa membuka panel ini dan daftar perusahaannya. Menambah perusahaan dan mengundang tim adalah hak pemilik dan admin akun. Identitas akun, langganan, ekspor data, dan penghapusan akun hanya untuk PEMILIK akun.",
  },
  { kind: "sub", judul: "Akun & Perusahaan" },
  {
    kind: "paragraf",
    teks:
      "Halaman pertama sesudah masuk. Kartu Pemakaian menunjukkan berapa perusahaan dan pengguna yang sudah terpakai dari kuota paket, status langganan, dan tagihan berikutnya. Di bawahnya, Perusahaan Anda memuat setiap perusahaan beserta tombol Buka.",
  },
  {
    kind: "gambar",
    berkas: "tenant/beranda",
    alt: "Panel Akun & Perusahaan dengan kartu pemakaian perusahaan dan pengguna, status Masa Uji Coba, tagihan berikutnya, dan empat perusahaan contoh.",
    keterangan: "Bilah oranye “Hampir penuh” muncul saat kuota hampir habis; merah saat sudah penuh.",
  },
  { kind: "sub", judul: "Menambah perusahaan" },
  {
    kind: "paragraf",
    teks:
      "Setiap perusahaan — PT, PT Perorangan, CV, firma, atau usaha perorangan — mendapat basis datanya sendiri, jadi membuatnya butuh beberapa detik dan diperlihatkan langkah demi langkah.",
  },
  {
    kind: "langkah",
    butir: [
      "Di panel akun, tekan Tambah Perusahaan.",
      "Isi Nama perusahaan. Slug (alamat pendek) terisi sendiri dari namanya; ubah bila perlu — huruf kecil, angka, dan tanda hubung.",
      "Tekan Buat Perusahaan dan tunggu sampai keempat tahap penyiapan selesai.",
      "Pilih Siapkan buku perusahaan ini untuk menjalankan wisaya penyiapan: identitas, modul, tahun buku, bagan akun, dan saldo awal.",
    ],
  },
  {
    kind: "gambar",
    berkas: "tenant/tambah-perusahaan",
    alt: "Formulir Tambah Perusahaan dengan nama perusahaan contoh, slug yang terisi otomatis, nama basis data, dan tombol Buat Perusahaan.",
  },
  {
    kind: "poin",
    butir: [
      "Slug tidak bisa diganti sesudahnya — ia menjadi bagian alamat setiap halaman dan nama basis datanya. Nama perusahaan boleh diganti kapan saja.",
      "“Kuota perusahaan paket Anda sudah terpakai penuh” — naikkan paket di Langganan & Paket, atau hubungi tim.",
      "“Langganan Anda sedang tidak aktif” — uji coba sudah berakhir atau langganan ditangguhkan; perusahaan baru tidak bisa dibuat sampai akun aktif lagi.",
      "Orang yang membuat perusahaan otomatis menjadi Administrator Sistem di dalamnya.",
    ],
  },
  { kind: "sub", judul: "Tim" },
  {
    kind: "paragraf",
    teks:
      "Keanggotaan dicatat PER PERUSAHAAN, sebab peran seseorang bisa berbeda di tiap buku: kepala gudang di satu perusahaan, hanya pembaca laporan di perusahaan lain. Halaman Tim karena itu berisi satu tombol per perusahaan yang membawa Anda ke halaman Pengguna perusahaan itu, tempat undangan dikirim.",
  },
  {
    kind: "gambar",
    berkas: "tenant/tim",
    alt: "Halaman Tim berisi tombol Undang staf ke masing-masing perusahaan contoh.",
  },
  { kind: "sub", judul: "Identitas akun" },
  {
    kind: "paragraf",
    teks:
      "Nama akun adalah nama yang dilihat seluruh anggota. Alamat akun (slug) muncul di setiap tautan buku Anda dan boleh diganti paling sering sekali dalam 30 hari; alamat lama tetap diteruskan ke yang baru, jadi tautan yang pernah disimpan tidak putus.",
  },
  {
    kind: "gambar",
    berkas: "tenant/identitas-akun",
    alt: "Halaman Identitas akun dengan isian Nama akun dan bagian Alamat akun beserta peringatan bahwa alamat hanya bisa diganti sekali dalam 30 hari.",
  },
  {
    kind: "paragraf",
    teks:
      "Bagian Surel Keluar di halaman yang sama mengatur server surel milik usaha Anda untuk mengirim faktur dan pengingat ke pelanggan. Bawaannya Tahan dulu: surel tidak dikirim ke mana pun sampai Anda memilih Kirim lewat SMTP dan menekan Kirim uji ke saya. Surel akun — atur ulang sandi, undangan, aktivasi — tidak memakai server ini.",
  },
  { kind: "sub", judul: "Pemberitahuan" },
  {
    kind: "paragraf",
    teks:
      "Panel akun tidak punya kotak pemberitahuan sendiri. Kabar seputar akun — uji coba yang hampir habis, permintaan penghapusan — dikirim lewat surel ke pemilik. Pemberitahuan pekerjaan (persetujuan, jatuh tempo) tinggal di dalam setiap perusahaan, di ikon kotak masuk pada bilah atas.",
  },
  { kind: "lihat-juga", slug: ["langganan-dan-tagihan", "paket-dan-perusahaan", "data-anda", "mulai-di-perusahaan"] },
];

const LANGGANAN: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Akun baru selalu dimulai dengan UJI COBA: 30 hari, kuota paket Pro, tanpa kartu dan tanpa tagihan otomatis. Tidak ada yang ditagihkan diam-diam ketika uji coba habis. Yang terjadi justru sebaliknya — buku menjadi hanya-baca sampai Anda sendiri meminta aktivasi. Dengan begitu tidak ada tagihan yang lahir untuk layanan yang belum Anda putuskan untuk dipakai.",
  },
  {
    kind: "catatan",
    teks:
      "Halaman Langganan & Paket hanya terbuka untuk PEMILIK akun. Anggota lain melihat statusnya di panel Akun & Perusahaan.",
  },
  { kind: "sub", judul: "Selama uji coba" },
  {
    kind: "paragraf",
    teks:
      "Langganan & Paket menunjukkan paket, status Masa Uji Coba, tanggal berakhirnya, hitung mundur hari, dan harga paket bila diaktifkan. Pengingat juga dikirim ke surel pemilik tujuh, tiga, dan satu hari sebelum uji coba berakhir.",
  },
  {
    kind: "gambar",
    berkas: "tenant/langganan",
    alt: "Halaman Langganan & Paket saat uji coba, dengan kotak Uji coba berakhir dalam 21 hari, tombol Minta aktivasi, dan riwayat tagihan yang masih kosong.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka Langganan & Paket dari panel akun.",
      "Tekan Minta aktivasi. Permintaan Anda tercatat dan tim akan menghubungi Anda; tautan WhatsApp atau surel ikut ditampilkan bila tersedia.",
      "Setelah kesepakatan, pengelola layanan mengaktifkan akun atau memperpanjang uji coba. Tagihan pertama muncul di Riwayat Tagihan.",
    ],
  },
  { kind: "sub", judul: "Sesudah uji coba berakhir: hanya-baca" },
  {
    kind: "paragraf",
    teks:
      "Begitu uji coba lewat, status berubah menjadi “Uji coba berakhir (hanya-baca)”. Semua data tetap ada; Anda masih bisa membuka setiap perusahaan, membaca laporan, dan mengekspor. Yang berhenti hanyalah MENULIS: formulir pencatatan membawa Anda kembali ke Beranda, dan simpanan apa pun ditolak dengan pesan bahwa buku berstatus hanya-baca.",
  },
  {
    kind: "gambar",
    berkas: "tenant/hanya-baca",
    alt: "Panel akun sebuah akun contoh yang uji cobanya sudah berakhir, dengan pita peringatan bahwa buku besar hanya-baca dan status Uji coba berakhir.",
  },
  {
    kind: "gambar",
    berkas: "tenant/langganan-berakhir",
    alt: "Halaman Langganan & Paket setelah uji coba berakhir, dengan kotak Masa uji coba sudah berakhir dan tombol Minta aktivasi.",
  },
  {
    kind: "catatan",
    nada: "peringatan",
    teks:
      "Hanya-baca bukan berarti dihapus. Pada sebagian pemasangan, pengelola layanan menyalakan penghapusan otomatis bagi uji coba yang dibiarkan beku lama (bawaannya 90 hari); bila itu berlaku, Anda menerima surel peringatan 14 dan 3 hari sebelumnya. Ekspor data Anda lebih dulu bila belum yakin akan melanjutkan.",
  },
  { kind: "sub", judul: "Tagihan dan pembayaran" },
  {
    kind: "paragraf",
    teks:
      "Setelah aktif, setiap tagihan langganan tercatat di Riwayat Tagihan dengan nomor, jatuh tempo, total, dan status. Pada pembayaran manual, tombol Bayar menampilkan instruksi transfer dari pengelola layanan, dan tagihan ditandai lunas oleh mereka setelah dana diterima. Bila gerbang pembayaran dipasang, tersedia pilihan virtual account atau QRIS.",
  },
  {
    kind: "poin",
    butir: [
      "Isi Profil Pajak (NPWP, nama, dan alamat sesuai NPWP) bila usaha Anda butuh Faktur Pajak atas tagihan langganan.",
      "Tagihan yang lewat jatuh tempo memberi tenggang 14 hari; sesudahnya langganan ditangguhkan dan buku menjadi hanya-baca dengan cara yang sama seperti uji coba yang berakhir.",
      "Ekspor data tetap bisa dalam setiap keadaan hanya-baca.",
    ],
  },
  { kind: "sub", judul: "Naik atau turun paket" },
  {
    kind: "paragraf",
    teks:
      "Paket & Harga membandingkan paket yang tersedia dan menandai paket saat ini. Naik paket membuat tagihan selisih prorata untuk sisa periode; kuotanya naik setelah tagihan itu lunas. Turun paket berlaku segera, tetapi ditolak bila pemakaian Anda masih melebihi kuota paket tujuan — nonaktifkan dulu pengguna atau perusahaan yang berlebih. Paket berharga negosiasi diatur lewat tim penjualan.",
  },
  {
    kind: "gambar",
    berkas: "tenant/paket",
    alt: "Halaman Paket & Harga dengan tiga kartu paket Starter, Pro yang bertanda Paket saat ini, dan Business, masing-masing dengan kuota perusahaan dan pengguna.",
  },
  { kind: "lihat-juga", slug: ["paket-dan-perusahaan", "data-anda", "panel-akun"] },
];

const MULAI_DI_PERUSAHAAN: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Begitu sebuah perusahaan dibuka, layar berganti menjadi meja kerja perusahaan itu. Nama perusahaan yang sedang dibuka selalu tampil di kiri atas bilah atas — setiap angka yang Anda lihat milik buku itu saja. Menu di kiri dikelompokkan menurut pekerjaan (Penjualan, Pembelian, Kas & Bank, Stok & Aset, Laporan), bukan menurut istilah akuntansi.",
  },
  {
    kind: "catatan",
    teks:
      "Menu yang tampil berbeda untuk setiap orang. Sebuah butir muncul hanya bila peran Anda punya izinnya, modulnya menyala untuk perusahaan ini, dan — untuk menu akuntansi — Mode Akuntan Anda menyala. Menyembunyikan menu hanyalah tampilan; yang benar-benar menolak adalah server.",
  },
  { kind: "sub", judul: "Beranda" },
  {
    kind: "paragraf",
    teks:
      "Beranda adalah ringkasan, bukan laporan. Dari atas ke bawah: Aksi Cepat untuk pekerjaan yang paling sering (Catat Penjualan, Catat Pembelian, Terima Uang, Bayar, Tambah Stok), Rutinitas bulan lalu yang belum dikunci, panel Alur Kerja, hal yang perlu diperhatikan, lalu ringkasan uang, stok, dan penjualan dalam bahasa sehari-hari. Setiap kartu menautkan laporan sumbernya.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/beranda",
    alt: "Beranda perusahaan contoh dengan Aksi Cepat Catat Penjualan, Catat Pembelian, Terima Uang, Bayar, Tambah Stok, Buat Kontrak, dan daftar Rutinitas bulan lalu.",
  },
  {
    kind: "paragraf",
    teks:
      "Perusahaan yang baru disiapkan dan belum punya transaksi menampilkan panel Langkah Pertama sebagai gantinya: penyiapan & saldo awal, tambah pelanggan, tambah pemasok, catat stok awal, penjualan pertama, dan penerimaan pertama.",
  },
  { kind: "sub", judul: "Bantuan, tur, dan Alur Kerja" },
  {
    kind: "paragraf",
    teks:
      "Tombol Bantuan di bilah atas memuat Kamus Istilah, halaman panduan untuk layar yang sedang dibuka, daftar isi panduan, dan Ulangi tur halaman ini. Beberapa halaman — Beranda, Persetujuan, Buat Tagihan, Pusat Laporan, Perintah Produksi — punya tur singkat yang muncul sendiri pada kunjungan pertama; Lewati menutupnya, dan ia bisa diulang lewat menu Bantuan.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/menu-bantuan",
    alt: "Menu Bantuan yang terbuka dari bilah atas, berisi Kamus Istilah, panduan halaman ini, daftar isi panduan, dan Ulangi tur halaman ini.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/tur-beranda",
    alt: "Tur Kenalan dengan Beranda langkah 1 dari 5 yang tampil di atas Beranda, dengan tombol Lewati dan Lanjut.",
    keterangan: "Tur yang sudah dilihat diingat per peramban, jadi ia muncul lagi bila Anda memakai komputer lain.",
  },
  {
    kind: "paragraf",
    teks:
      "Panel Alur Kerja di Beranda menyusun urutan kerja yang lazim — alur penjualan, alur pembelian, tutup buku bulanan, alur stok, alur kas & bank — sebagai tautan bertingkat. Alur hanya tampil bila modulnya menyala, dan langkah yang tidak boleh Anda kerjakan disembunyikan.",
  },
  { kind: "sub", judul: "Mode Akuntan" },
  {
    kind: "paragraf",
    teks:
      "Mode Akuntan mengubah TAMPILAN untuk Anda seorang di perusahaan ini: menu Catatan Transaksi (jurnal), Rincian per Akun (buku besar), Daftar Akun, Cocokkan dengan Accurate, dan laporan Neraca Saldo muncul, serta formulir memakai label debit/kredit. Ia tidak mengubah data dan tidak memberi hak baru. Bawaannya menyala untuk Direktur Utama dan Administrator Sistem, mati untuk peran lain.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/mode-akuntan",
    alt: "Dialog konfirmasi Matikan Mode Akuntan yang menjelaskan menu akuntansi akan disembunyikan, dengan tombol Batal dan Ya, matikan.",
  },
  { kind: "sub", judul: "Pemberitahuan" },
  {
    kind: "paragraf",
    teks:
      "Ikon kotak masuk di bilah atas membuka Pemberitahuan: kabar yang ditujukan kepada Anda, seperti dokumen yang menunggu persetujuan atau penyiapan yang belum selesai. Membuka halaman ini menandai semuanya terbaca.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/pemberitahuan",
    alt: "Halaman Pemberitahuan yang masih kosong dengan tulisan Belum ada pemberitahuan.",
  },
  { kind: "sub", judul: "Pengaturan" },
  {
    kind: "paragraf",
    teks:
      "Pengaturan (menu Bantuan & Pengaturan) memuat profil Anda dan tombol Ganti Kata Sandi, logo perusahaan untuk kop dokumen PDF, tarif PPN, pengingat jatuh tempo, catatan audit keamanan, dan pembersihan data contoh. Bagian yang mengubah perusahaan hanya bisa disunting peran yang berwenang mengatur perusahaan; yang lain melihatnya sebagai bacaan.",
  },
  {
    kind: "gambar",
    berkas: "perusahaan/pengaturan",
    alt: "Halaman Pengaturan dengan pemberitahuan modul yang tidak aktif, bagian Profil berisi tombol Ganti Kata Sandi, dan bagian Logo perusahaan.",
  },
  {
    kind: "poin",
    butir: [
      "Logo: PNG atau JPEG, paling besar 512 KB. Ia dicetak di kepala faktur, kontrak, surat jalan, retur, dan laporan.",
      "Menu yang Anda cari tidak ada? Periksa Modul Usaha — modul yang dimatikan menyembunyikan menunya untuk semua orang — lalu Hak Akses untuk peran Anda.",
      "Halaman bertuliskan “Fitur ini belum aktif” berarti modulnya dimatikan untuk perusahaan ini, bukan bahwa data Anda hilang.",
    ],
  },
  { kind: "lihat-juga", slug: ["modul-usaha", "peran-dan-izin", "saldo-awal", "membaca-laporan"] },
];

const PEMBELIAN: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Pembelian kelihatannya cermin penjualan, tetapi uangnya bergerak dengan urutan yang berbeda. Utang kepada pemasok lahir saat Anda MENCATAT pembelian, bukan saat membayar; dan sering kali uang sudah keluar lebih dulu sebagai uang muka, sebelum ada utang apa pun untuk dilunasi. Karena itu pembelian dibagi menjadi pencatatan, pembayaran, dan kompensasi uang muka — tiga langkah yang masing-masing meninggalkan jejaknya sendiri.",
  },
  {
    kind: "catatan",
    teks:
      "Prasyarat: modul Pembelian menyala, dan peran Anda boleh mencatat pembelian serta mengubah data pemasok (pembayaran dicatat dari halaman pemasok).",
  },
  { kind: "sub", judul: "Mencatat pembelian" },
  {
    kind: "paragraf",
    teks:
      "Catat Pembelian adalah wisaya lima langkah. Tidak ada yang tersimpan sampai tombol Selesai & Simpan di langkah terakhir; Anda boleh mundur-maju, dan isian sementara diingat peramban selama 12 jam.",
  },
  {
    kind: "langkah",
    butir: [
      "Pemasok — pilih yang sudah terdaftar, atau isi datanya untuk pemasok baru.",
      "Barang & Harga — barang, jumlah, dan harga per satuan.",
      "Barang Masuk (opsional) — terima barangnya sekalian ke gudang supaya stok bertambah.",
      "Catat Pembelian — tanggal, jatuh tempo, PPN Masukan, mata uang & kurs, serta ongkos sampai gudang yang dibagi menurut nilai barang atau berat.",
      "Ringkasan — periksa, lalu tekan Selesai & Simpan.",
    ],
  },
  {
    kind: "gambar",
    berkas: "pembelian/catat-pembelian",
    alt: "Wisaya Catat Pembelian langkah 1 dari 5, memilih pemasok yang sudah terdaftar atau mengisi pemasok baru.",
  },
  { kind: "sub", judul: "Pemasok" },
  {
    kind: "paragraf",
    teks:
      "Daftar Pemasok memuat nama, alamat, telepon, surel, dan jumlah transaksi. Halaman rinci seorang pemasok berisi riwayat transaksi, panel uang muka pembelian, dan alokasi pembayaran — pembayaran mana melunasi pembelian mana.",
  },
  {
    kind: "gambar",
    berkas: "pembelian/pemasok",
    alt: "Daftar Pemasok berisi dua pemasok contoh beserta alamat, telepon, dan jumlah transaksinya, dengan tombol Tambah Pemasok.",
  },
  {
    kind: "catatan",
    teks:
      "Menghapus pemasok yang SUDAH punya transaksi atau uang muka tidak menghapusnya — ia dinonaktifkan, supaya transaksi lama tetap menyebut namanya. Pemasok yang belum pernah dipakai benar-benar terhapus.",
  },
  { kind: "sub", judul: "Tagihan yang harus dibayar" },
  {
    kind: "paragraf",
    teks:
      "Tagihan Harus Dibayar adalah laporan umur utang per tanggal yang Anda pilih: sisa utang per pembelian, dikelompokkan 0–30, 31–60, 61–90, dan lebih dari 90 hari. Centang “Hanya yang sudah jatuh tempo” untuk daftar yang perlu segera dibayar. Laporannya bisa diunduh Excel atau dicetak PDF.",
  },
  {
    kind: "gambar",
    berkas: "pembelian/utang",
    alt: "Laporan Tagihan yang Harus Dibayar dengan kartu umur 0–30, 31–60, 61–90, lebih dari 90 hari, total outstanding, dan grafik sebaran umur.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka Pembelian → Pemasok, lalu tekan nama pemasok yang dibayar.",
      "Tekan Tambah Transaksi dan pilih Jenis Transaksi Pembayaran — ia mengurangi Hutang Usaha dan saldo kas sekaligus.",
      "Isi tanggal, nilai, dan mata uang, alokasikan nilainya ke pembelian yang dilunasi, lalu simpan.",
    ],
  },
  {
    kind: "catatan",
    teks:
      "Uang keluar yang dicatat lewat Kas & Bank → Catat Transaksi tidak terikat ke pemasok mana pun, jadi tidak mengurangi sisa utang di laporan ini — untuk melunasi pemasok, pakai halaman pemasok. Lencana “Perkiraan” di laporan utang berarti ada pembayaran yang belum dialokasikan ke dokumen tertentu — totalnya tetap benar, rincian per dokumennya diperkirakan.",
  },
  { kind: "sub", judul: "Uang muka" },
  {
    kind: "paragraf",
    teks:
      "Uang muka adalah uang yang berpindah SEBELUM fakturnya ada — dibayar ke pemasok atau diterima dari pelanggan. Ia dicatat sebagai uang titipan (aset atau kewajiban), bukan sebagai beban atau pendapatan, sampai dikompensasikan ke faktur yang bersangkutan.",
  },
  {
    kind: "gambar",
    berkas: "pembelian/uang-muka",
    alt: "Halaman Uang Muka dengan saringan Semua, Penjualan (diterima), Pembelian (dibayar), ringkasan uang muka belum dikompensasi, dan tombol Catat Uang Muka.",
  },
  {
    kind: "langkah",
    butir: [
      "Tekan Catat Uang Muka, pilih jenisnya (penjualan atau pembelian), pihaknya, kontrak bila ada, nilai, dan mata uang.",
      "Tekan Simpan Uang Muka.",
      "Saat faktur atau pembeliannya terbit, buka dokumen itu dan pakai Kompensasi uang muka. Membatalkan kompensasi membalik jurnalnya, tidak menghapusnya.",
    ],
  },
  { kind: "lihat-juga", slug: ["kas-dan-bank", "biaya-impor", "stok", "alur-penjualan"] },
];

const ASET_TETAP: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Membeli truk Rp 300 juta tidak membuat perusahaan rugi Rp 300 juta bulan itu. Uangnya keluar sekali, tetapi truknya dipakai bertahun-tahun, jadi biayanya dibagi sepanjang umur pakainya: itulah penyusutan. Ia satu-satunya biaya besar yang TIDAK pernah menjadi pengeluaran kas — uangnya sudah keluar saat pembelian; yang dicatat tiap bulan hanyalah bagian biaya yang menjadi jatah bulan itu.",
  },
  {
    kind: "catatan",
    teks:
      "Prasyarat: modul Aset Tetap menyala. Mendaftarkan aset, menjalankan penyusutan, memindahkan, dan melepas aset butuh izin menulis aset tetap.",
  },
  {
    kind: "catatan",
    nada: "peringatan",
    teks:
      "Mendaftarkan aset TIDAK membuat jurnal. Biaya perolehannya dicatat lewat pembelian atau kas seperti biasa; daftar aset hanya mencatat apa yang dimiliki agar penyusutan dan pelepasannya bisa dijurnal.",
  },
  { kind: "sub", judul: "Kategori lebih dulu" },
  {
    kind: "paragraf",
    teks:
      "Kategori menentukan metode, umur manfaat bawaan, dan tiga akun: akun aset, akun akumulasi penyusutan, dan akun beban penyusutan. Setiap aset wajib punya kategori, jadi periksa dulu halaman Kategori. Bila sudah ada kategori umum seperti Bangunan, Kendaraan, dan Peralatan Kantor, cukup periksa akunnya; bila kosong, buat kategori dulu dengan Simpan Kategori.",
  },
  {
    kind: "gambar",
    berkas: "aset/kategori",
    alt: "Halaman Kategori Aset dengan formulir kategori baru dan daftar kategori Bangunan, Kendaraan, Komputer & Elektronik, Mesin & Peralatan, Peralatan Kantor.",
  },
  { kind: "sub", judul: "Mendaftarkan aset" },
  {
    kind: "langkah",
    butir: [
      "Buka Barang Milik Perusahaan, lalu Aset Baru.",
      "Pilih kategori, isi nama aset, tanggal perolehan, lokasi, nilai perolehan, dan nilai residu.",
      "Periksa umur manfaat (bulan) dan akun-akunnya yang terisi dari kategori, lalu tekan Simpan Aset.",
    ],
  },
  {
    kind: "gambar",
    berkas: "aset/baru",
    alt: "Formulir Daftarkan Aset Tetap dengan isian kategori, nama aset, tanggal perolehan, nilai perolehan, umur manfaat 240 bulan, dan tiga akun dari kategori.",
  },
  { kind: "sub", judul: "Penyusutan bulanan" },
  {
    kind: "paragraf",
    teks:
      "Di halaman daftar aset, kartu Jalankan penyusutan bulanan menerima bulan dan tahun. Menekan Jalankan memposting satu jurnal penyusutan untuk bulan itu: beban penyusutan di debit, akumulasi penyusutan di kredit. Bulan yang sudah diposting tidak diposting dua kali.",
  },
  {
    kind: "gambar",
    berkas: "aset/daftar",
    alt: "Halaman Aset Tetap dengan kartu jumlah aset, nilai perolehan, akumulasi penyusutan, nilai buku, dan kartu Jalankan penyusutan bulanan.",
  },
  {
    kind: "poin",
    butir: [
      "Jalankan penyusutan sebelum menutup bulan — bulan yang terkunci menolak jurnal baru, termasuk penyusutan.",
      "Pindah lokasi di halaman rinci aset tidak membuat jurnal; ia hanya mengubah catatan lokasi (lihat Aset per Lokasi).",
      "Catat Pelepasan saat aset dijual atau dibuang: jurnalnya mengeluarkan nilai perolehan dan akumulasinya, dan selisihnya menjadi laba atau rugi pelepasan.",
    ],
  },
  { kind: "lihat-juga", slug: ["periode-terkunci", "mesin-akuntansi", "membaca-laporan"] },
];

const MASTER_DATA: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Pelanggan, penerima barang, dan pusat biaya adalah data induk: nama yang dirujuk oleh ratusan dokumen. Karena itu nama yang sudah dipakai tidak pernah benar-benar dihapus. Faktur tahun lalu harus tetap bisa menyebut pembelinya, walau pembeli itu sudah lama tidak berlangganan.",
  },
  {
    kind: "poin",
    butir: [
      "Pelanggan yang sudah punya faktur, uang muka, atau retur — bila dihapus — dinonaktifkan: ia hilang dari pilihan formulir baru, tetapi dokumen lamanya utuh.",
      "Pelanggan yang belum pernah dipakai benar-benar terhapus.",
      "Penerima barang yang sudah disebut di kontrak juga hanya dinonaktifkan. Pusat biaya selalu dinonaktifkan, tidak dihapus.",
    ],
  },
  { kind: "sub", judul: "Pelanggan" },
  {
    kind: "langkah",
    butir: [
      "Buka Penjualan → Pelanggan, lalu Tambah Pelanggan.",
      "Isi nama, alamat, telepon, surel, dan penanggung jawab. NPWP dan NITKU dibutuhkan bila fakturnya akan diekspor ke e-Faktur.",
      "Tekan Simpan Pelanggan.",
    ],
  },
  {
    kind: "gambar",
    berkas: "penjualan/pelanggan",
    alt: "Daftar Pelanggan berisi tiga pelanggan contoh beserta alamat dan telepon, dengan tombol Tambah Pelanggan.",
  },
  { kind: "sub", judul: "Penerima barang dan pusat biaya" },
  {
    kind: "paragraf",
    teks:
      "Penerima Barang (modul Perdagangan) adalah pihak yang menerima kiriman — sering berbeda dari pembeli pada transaksi ekspor — dan dirujuk kontrak serta surat jalan. Pusat Biaya mengelompokkan pendapatan dan beban per proyek, cabang, atau divisi, bertingkat bila perlu, dan menjadi saringan di laporan seperti Laba Rugi per Proyek.",
  },
  {
    kind: "catatan",
    teks:
      "Mengisi banyak pelanggan, pemasok, atau barang sekaligus lebih cepat lewat Impor Data Awal (berkas Excel). Lihat halaman saldo awal.",
  },
  { kind: "lihat-juga", slug: ["alur-penjualan", "saldo-awal", "membaca-laporan"] },
];

const EFAKTUR: readonly DocBlock[] = [
  {
    kind: "paragraf",
    teks:
      "Aplikasi ini tidak menggantikan Coretax DJP. Ia menyiapkan BERKAS faktur keluaran satu masa pajak dalam templat impor resmi Coretax, supaya Anda tidak mengetik ulang setiap faktur. Aturan perpajakannya — siapa wajib membuat faktur, kapan, dan dengan kode apa — tetap milik DJP dan konsultan pajak Anda; halaman ini hanya menjelaskan cara memakai layarnya.",
  },
  {
    kind: "catatan",
    teks:
      "Prasyarat: modul Pajak (e-Faktur) menyala dan peran Anda boleh membaca data pajak. Pelanggan perlu NPWP/NITKU yang lengkap agar fakturnya bisa diekspor.",
  },
  {
    kind: "langkah",
    butir: [
      "Buka Laporan → Ekspor e-Faktur.",
      "Lengkapi Identitas Pajak Penjual — NPWP Penjual wajib — lalu tekan Simpan Identitas Pajak.",
      "Isi Masa Pajak (dari tanggal, sampai tanggal) dan tekan Terapkan.",
      "Periksa daftar “Perlu dilengkapi” dan “Perlu diperiksa”, perbaiki datanya di faktur atau pelanggan.",
      "Tekan Unduh XML Coretax, lalu unggah di Coretax lewat e-Faktur → Pajak Keluaran → Impor Data.",
    ],
  },
  {
    kind: "gambar",
    berkas: "pajak/efaktur",
    alt: "Halaman e-Faktur (Coretax DJP) dengan bagian Identitas Pajak Penjual berisi NPWP contoh dan bagian Masa Pajak dengan tombol Terapkan.",
  },
  {
    kind: "poin",
    butir: [
      "Faktur ekspor yang sudah ber-PEB tidak diimpor — ia ditarik lewat Prepopulated PEB di Coretax.",
      "Unduh CSV tersedia untuk pemeriksaan di lembar kerja; yang diunggah ke Coretax adalah berkas XML.",
      "Bila sambungan PJAP dipasang, faktur bisa dikirim langsung dan statusnya (antre, menunggu DJP, disetujui, ditolak) terbaca di layar yang sama.",
    ],
  },
  { kind: "lihat-juga", slug: ["alur-penjualan", "membaca-laporan"] },
];

export const DOC_BLOCKS: Record<DocSlug, readonly DocBlock[]> = {
  "masuk-dan-akun": MASUK_DAN_AKUN,
  "panel-akun": PANEL_AKUN,
  "langganan-dan-tagihan": LANGGANAN,
  "mulai-di-perusahaan": MULAI_DI_PERUSAHAAN,
  "alur-pembelian": PEMBELIAN,
  "aset-tetap": ASET_TETAP,
  "master-data": MASTER_DATA,
  "efaktur": EFAKTUR,
  "mesin-akuntansi": MESIN_AKUNTANSI,
  "periode-terkunci": PERIODE,
  "persetujuan": PERSETUJUAN,
  "alur-penjualan": PENJUALAN,
  "stok": STOK,
  "biaya-impor": BIAYA_IMPOR,
  "manufaktur": MANUFAKTUR,
  "modul-usaha": MODUL,
  "alur-per-jenis-usaha": ALUR_USAHA,
  "kas-dan-bank": KAS,
  "saldo-awal": SALDO_AWAL,
  "cocokkan-accurate": COCOK_ACCURATE,
  "peran-dan-izin": PERAN_IZIN,
  "api": API,
  "paket-dan-perusahaan": PAKET,
  "membaca-laporan": LAPORAN,
  "data-anda": DATA_ANDA,
  "apa-yang-baru": APA_YANG_BARU,
};
