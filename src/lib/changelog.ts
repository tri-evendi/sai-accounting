/**
 * Riwayat rilis — SUMBER TUNGGAL, data bertipe.
 *
 * ══ Kenapa di sini dan bukan di CHANGELOG.md ═══════════════════════════════
 * Ada DUA pembaca riwayat ini: orang yang membuka repo, dan pengguna yang
 * membuka halaman "Apa yang Baru" di dalam aplikasi. Kalau markdown-nya yang
 * menjadi sumber, halaman itu harus menyalinnya — dan salinan adalah cara
 * sebuah dokumen lahir sudah salah. Sesi yang membangun modul manufaktur
 * menemukan persis itu dua kali dalam satu hari (`docs/MODUL-USAHA.md` yang
 * menyangkal fitur yang sudah dibangun, dan klaim resep bertingkat yang hanya
 * benar untuk biaya standar).
 *
 * Jadi arahnya dibalik: berkas INI sumbernya, `CHANGELOG.md` DIBANGKITKAN
 * darinya (`bun run changelog:build`), dan `tests/changelog.test.ts` menolak
 * keduanya menyimpang. Markdown-nya tetap ada — GitHub, `git log`, dan orang
 * yang belum menjalankan aplikasinya membacanya di sana.
 *
 * ══ Ditulis untuk PENGGUNA, bukan untuk pengembang ═════════════════════════
 * Isinya muncul di layar orang yang memakai aplikasi ini untuk membukukan
 * penjualan lada, bukan di catatan rilis pustaka. Karena itu: tak ada nama
 * berkas, tak ada nomor PR, tak ada istilah yang hanya berarti bagi yang
 * membaca kodenya. Refactor, penjaga, dan pekerjaan dalam yang tidak mengubah
 * apa pun di layar TIDAK ditulis di sini — bukan karena tidak penting,
 * melainkan karena catatan yang memuat segalanya berhenti dibaca.
 *
 * Bahasa Indonesia saja, mengikuti kebijakan `/docs` (keputusan 3 issue #300):
 * kerangkanya trilingual, prosanya tidak.
 */

/** Satu butir perubahan yang dilihat pengguna. */
export interface ButirRilis {
  /** Satu kalimat: apa yang berubah, dari sudut pandang yang memakainya. */
  teks: string;
  /**
   * `baru` fitur yang sebelumnya tidak ada · `ubah` yang berubah perilakunya ·
   * `perbaikan` yang sebelumnya salah.
   *
   * Dibedakan supaya pembaca bisa melompat ke yang dicarinya, dan karena
   * ketiganya menuntut reaksi berbeda: yang `baru` boleh diabaikan, yang
   * `ubah` mungkin mengubah kebiasaan kerja, yang `perbaikan` menjelaskan
   * kenapa sesuatu dulu terasa aneh.
   */
  jenis: "baru" | "ubah" | "perbaikan";
}

export interface Rilis {
  /** Nomor versi, sama dengan `package.json`. */
  versi: string;
  /** ISO `YYYY-MM-DD`, tanggal ia benar-benar melayani pengguna. */
  tanggal: string;
  /**
   * Commit `main` yang digelar — jangkar bagi yang perlu menelusurinya.
   *
   * OPSIONAL, dan itu bukan kelonggaran melainkan urutan: entri sebuah rilis
   * ditulis SEBELUM ia digelar (penjaga menuntut catatannya ada saat versi
   * dinaikkan), sedangkan sha-nya baru lahir ketika PR promosi digabungkan.
   * Menuntutnya terisi lebih dulu berarti menuntut nomor yang belum ada.
   *
   * Tidak pernah tampil ke pengguna — halaman "Apa yang Baru" merender versi,
   * tanggal, ringkasan, dan butirnya saja. Ia untuk pembaca `CHANGELOG.md`
   * yang perlu menelusuri sampai ke commit.
   */
  sha?: string;
  /** Satu kalimat: kenapa rilis ini ada. Muncul sebagai ringkasan. */
  ringkas: string;
  butir: readonly ButirRilis[];
}

/**
 * Rilis, TERBARU DI ATAS. Urutan itu dijaga tes — daftar riwayat yang harus
 * digulir sampai bawah untuk menemukan yang terbaru adalah daftar yang salah
 * arah bagi satu-satunya pertanyaan yang paling sering dibawa pembacanya.
 */
export const RILIS: readonly Rilis[] = [
  {
    versi: "0.22.2",
    tanggal: "2026-10-24",
    ringkas: "Pembaruan keamanan pada layanan latar; tidak ada perubahan pada tampilan.",
    butir: [
      {
        jenis: "perbaikan",
        teks: "Layanan latar diperbarui untuk menutup celah keamanan pada pengolahan data terkompresi (CVE-2026-111497).",
      },
    ],
  },
  {
    versi: "0.22.1",
    tanggal: "2026-10-24",
    sha: "6bed782",
    ringkas: "Layanan latar memakai memori jauh lebih sedikit, dan lisensi on-premise kini bisa diterbitkan; tidak ada perubahan pada tampilan.",
    butir: [
      {
        jenis: "perbaikan",
        teks: "Layanan pengirim peristiwa di latar tidak lagi membuka ulang koneksi ke setiap buku perusahaan berulang kali, sehingga memakai memori jauh lebih sedikit.",
      },
      {
        jenis: "baru",
        teks: "Pemasangan on-premise kini menerima berkas lisensi resmi SAI.",
      },
    ],
  },
  {
    versi: "0.22.0",
    tanggal: "2026-10-24",
    sha: "66115c8",
    ringkas: "PDF laporan stok, lembar opname, dan laporan keuangan kini disusun di server dari angka terbaru, dan PDF laporan keuangan dari dialog laporan kembali bisa diunduh.",
    butir: [
      {
        jenis: "ubah",
        teks: "PDF laporan stok, lembar opname, dan laporan keuangan memakai angka terbaru saat tombol cetak ditekan, bukan angka yang dimuat saat halaman dibuka.",
      },
      {
        jenis: "ubah",
        teks: "PDF laporan yang sangat besar disiapkan di latar; tombolnya menunggu lalu mengunduh berkasnya saat siap.",
      },
      {
        jenis: "perbaikan",
        teks: "Unduh PDF laporan keuangan dari dialog laporan kembali berfungsi.",
      },
    ],
  },
  {
    versi: "0.21.1",
    tanggal: "2026-10-24",
    sha: "da2b198",
    ringkas: "Unduhan data perusahaan kini disiapkan di latar, jadi data besar tidak lagi membuat halaman menunggu.",
    butir: [
      {
        jenis: "ubah",
        teks: "Unduhan data perusahaan di halaman Privasi disiapkan di latar: tombolnya menampilkan kemajuan, lalu tautan unduh saat berkasnya siap.",
      },
    ],
  },
  {
    versi: "0.21.0",
    tanggal: "2026-10-24",
    sha: "2608ec9",
    ringkas: "Faktur yang baru diposting bisa dikirim otomatis ke surel pelanggan, dan unduhan data perusahaan diperbaiki.",
    butir: [
      {
        jenis: "baru",
        teks: "Pengaturan pengingat punya pilihan baru: kirim faktur ke surel pelanggan saat diposting, sebagai lampiran PDF dan sekali per faktur. Pilihan ini mati sampai dinyalakan untuk tiap perusahaan.",
      },
      {
        jenis: "perbaikan",
        teks: "Unduhan data perusahaan di halaman Privasi tidak lagi gagal saat menyiapkan berkas zip, dan logo perusahaan di dalamnya kini tersimpan utuh.",
      },
    ],
  },
  {
    versi: "0.20.0",
    tanggal: "2026-10-24",
    sha: "5bfe19a",
    ringkas: "Konsol operator kini menilai antrean tiap jalur dengan ambangnya sendiri; tidak ada perubahan pada tampilan aplikasi.",
    butir: [
      {
        jenis: "ubah",
        teks: "Konsol operator: halaman Penjadwal menampilkan ambang peringatan tiap jalur antrean beserta batas durasinya, dan menandai jalur yang melambat.",
      },
    ],
  },
  {
    versi: "0.19.1",
    tanggal: "2026-10-23",
    sha: "882d801",
    ringkas: "Ekspor Rekap Penjualan, Rekap Pembelian, Kas & Bank, dan Realisasi Anggaran kini disiapkan di latar.",
    butir: [
      {
        jenis: "ubah",
        teks: "Ekspor Excel Rekap Penjualan per Pelanggan, Rekap Pembelian per Pemasok, Kas & Bank, dan Realisasi Anggaran disiapkan di latar.",
      },
    ],
  },
  {
    versi: "0.19.0",
    tanggal: "2026-10-23",
    sha: "b7cf615",
    ringkas: "Faktur pajak keluaran bisa diekspor sebagai XML Coretax, dan ekspor laporan stok kini disiapkan di latar.",
    butir: [
      {
        jenis: "baru",
        teks: "Halaman e-Faktur kini menyiapkan berkas XML untuk diimpor ke Coretax DJP, lengkap dengan daftar faktur yang datanya belum lengkap.",
      },
      {
        jenis: "baru",
        teks: "Data pelanggan kini menyimpan NIK, NITKU, dan jenis pemungut PPN; data perusahaan menyimpan NITKU.",
      },
      {
        jenis: "ubah",
        teks: "Ekspor Excel Nilai Persediaan, Riwayat Stok, dan Riwayat Hitung Ulang Stok disiapkan di latar.",
      },
    ],
  },
  {
    versi: "0.18.1",
    tanggal: "2026-10-23",
    sha: "e17a56c",
    ringkas: "Perubahan pengaturan situs, logo, pengumuman, dan teks halaman depan dari konsol kini tampil dalam 5 detik.",
    butir: [
      {
        jenis: "perbaikan",
        teks: "Pengaturan pendaftaran, PPN, kontak, logo, pengumuman status, dan teks halaman depan yang diubah dari konsol tampil di situs dalam 5 detik.",
      },
    ],
  },
  {
    versi: "0.18.0",
    tanggal: "2026-10-23",
    sha: "47f497a",
    ringkas: "Teks halaman depan kini disunting sebagai draf, dipratinjau, lalu diterbitkan dengan riwayat yang bisa dikembalikan.",
    butir: [
      {
        jenis: "ubah",
        teks: "Perubahan teks halaman depan tampil di situs dalam 30 detik setelah diterbitkan.",
      },
    ],
  },
  {
    versi: "0.17.0",
    tanggal: "2026-10-23",
    sha: "42c3b1a",
    ringkas: "Konsol operator kini mewajibkan aplikasi authenticator saat masuk.",
    butir: [
      {
        jenis: "baru",
        teks: "Operator yang belum memasang authenticator dipandu memindai kode QR saat masuk; sesudahnya setiap login memakai kode 6 digit.",
      },
    ],
  },
  {
    versi: "0.16.3",
    tanggal: "2026-10-23",
    sha: "e7ea52d",
    ringkas: "Perusahaan baru yang berhasil dibuat tidak lagi dilaporkan gagal, dan pekerjaan latar yang gagal kini menunggu sebelum dicoba ulang.",
    butir: [
      {
        jenis: "perbaikan",
        teks: "Halaman pembuatan perusahaan kini langsung menampilkan perusahaan yang sudah siap, bukan pesan gagal.",
      },
      {
        jenis: "perbaikan",
        teks: "Pekerjaan latar yang gagal dicoba ulang dengan jeda, bukan seketika berulang-ulang.",
      },
    ],
  },
  {
    versi: "0.16.2",
    tanggal: "2026-10-23",
    sha: "af720db",
    ringkas: "Penjadwalan dokumen berulang kini dijalankan layanan latar yang baru; tidak ada perubahan pada tampilan.",
    butir: [
      {
        jenis: "ubah",
        teks: "Dokumen berulang dijadwalkan oleh layanan latar yang baru, sama seperti cadangan harian.",
      },
    ],
  },
  {
    versi: "0.16.1",
    tanggal: "2026-10-23",
    sha: "9bb3d81",
    ringkas: "Ekspor Laporan Perubahan Ekuitas kini disiapkan di latar.",
    butir: [
      {
        jenis: "ubah",
        teks: "Ekspor Excel Laporan Perubahan Ekuitas disiapkan di latar seperti laporan keuangan lain.",
      },
    ],
  },
  {
    versi: "0.16.0",
    tanggal: "2026-10-23",
    sha: "b13b14e",
    ringkas: "Laporan Perubahan Ekuitas bisa diunduh, dan pencocokan barang kontrak di Umur Piutang kini sama dengan halaman kontrak.",
    butir: [
      {
        jenis: "baru",
        teks: "Laporan Perubahan Ekuitas kini bisa diunduh sebagai Excel dan PDF.",
      },
      {
        jenis: "perbaikan",
        teks: "Umur Piutang, halaman detail kontrak, dan batas penagihan faktur kini mencocokkan barang kontrak berdasarkan barangnya, bukan hanya namanya — dua barang bernama sama tidak lagi tertukar.",
      },
    ],
  },
  {
    versi: "0.15.2",
    tanggal: "2026-10-23",
    sha: "ef6b7b7",
    ringkas: "Penjadwalan cadangan harian kini dijalankan layanan latar yang baru; tidak ada perubahan pada tampilan.",
    butir: [
      {
        jenis: "ubah",
        teks: "Cadangan harian dijadwalkan oleh layanan latar yang baru, dengan pemantauan denyut tersendiri.",
      },
    ],
  },
  {
    versi: "0.15.1",
    tanggal: "2026-10-23",
    sha: "5c7af90",
    ringkas: "Ekspor Excel Arus Kas, Umur Piutang, dan Umur Utang kini disiapkan di latar.",
    butir: [
      {
        jenis: "ubah",
        teks: "Ekspor Excel Arus Kas, Umur Piutang, dan Umur Utang disiapkan di latar seperti laporan keuangan lain — halaman tetap bisa dipakai selama berkasnya dibuat.",
      },
    ],
  },
  {
    versi: "0.15.0",
    tanggal: "2026-10-23",
    sha: "d769335",
    ringkas:
      "Pembaruan basis data tidak lagi menghentikan seluruh layanan, dan pembuatan perusahaan baru lebih terjaga.",
    butir: [
      {
        jenis: "ubah",
        teks: "Saat aplikasi diperbarui, buku satu perusahaan yang belum selesai diperbarui ditutup sementara dengan layar penjelasan, sementara perusahaan lain tetap bisa dipakai.",
      },
      {
        jenis: "perbaikan",
        teks: "Batas jumlah perusahaan diperiksa ulang tepat sebelum perusahaan baru dibuat, sehingga dua permintaan bersamaan tidak bisa melewatinya.",
      },
      {
        jenis: "perbaikan",
        teks: "Ekspor Excel Umur Piutang dan Umur Utang dari halaman yang disaring \"jatuh tempo saja\" kini hanya memuat dokumen jatuh tempo.",
      },
    ],
  },
  {
    versi: "0.14.0",
    tanggal: "2026-10-23",
    sha: "96d110d",
    ringkas:
      "Kontrak bisa ditandai selesai, MFA konsol bisa dipasang dengan aplikasi authenticator, dan tanggal periode tidak lagi bergantung pada zona waktu server.",
    butir: [
      {
        jenis: "baru",
        teks: "Kontrak punya status keempat, Selesai, untuk kontrak yang sudah ditandatangani dan pekerjaannya rampung — terpisah dari status pembayarannya.",
      },
      {
        jenis: "perbaikan",
        teks: "Batas periode, tahun buku, dan penomoran dokumen selalu mengikuti kalender WIB, apa pun zona waktu servernya.",
      },
      {
        jenis: "perbaikan",
        teks: "Kurs penyelesaian uang muka valas kini diambil dari tanggal yang tepat.",
      },
      {
        jenis: "ubah",
        teks: "Perusahaan baru disiapkan di latar; halaman pembuatan menampilkan kemajuannya sampai selesai.",
      },
    ],
  },
  {
    versi: "0.13.1",
    tanggal: "2026-10-22",
    sha: "827e5a9",
    ringkas: "Pengerasan keamanan di sisi server; tidak ada perubahan pada tampilan maupun data.",
    butir: [
      {
        jenis: "ubah",
        teks: "Setiap layanan di server kini hanya menerima pengaturan yang memang dibutuhkannya, dan layanan latar berjalan tanpa hak administrator.",
      },
    ],
  },
  {
    versi: "0.13.0",
    tanggal: "2026-10-22",
    sha: "17462f3",
    ringkas:
      "Ekspor Laba Rugi dan Neraca kini memuat kolom pembanding, tanggal pagi hari tidak lagi mundur sehari, dan pembaruan keamanan.",
    butir: [
      {
        jenis: "perbaikan",
        teks: "Ekspor Excel dan PDF Laba Rugi serta Neraca dengan mode pembanding kini benar-benar memuat kolom periode pembanding dan persentase perubahannya.",
      },
      {
        jenis: "ubah",
        teks: "Ekspor Excel Laba Rugi dan Neraca disiapkan di latar, seperti Neraca Saldo — halaman tetap bisa dipakai selama berkasnya dibuat.",
      },
      {
        jenis: "perbaikan",
        teks: "Ekspor Laba Rugi yang disaring per pusat biaya tidak lagi gagal saat disiapkan di latar.",
      },
      {
        jenis: "perbaikan",
        teks: "Antara pukul 00.00 dan 07.00 WIB, tanggal bawaan di formulir kas/bank, rekonsiliasi, stok opname, dan dialog laporan kini hari ini, bukan kemarin; pengingat faktur dan transaksi berulang tidak lagi terlambat sehari.",
      },
      {
        jenis: "perbaikan",
        teks: "Faktur yang dibuat dini hari tanggal 1 kini masuk masa pajak e-Faktur bulan itu.",
      },
      {
        jenis: "perbaikan",
        teks: "Pembaruan keamanan pada komponen aplikasi dan login.",
      },
    ],
  },
  {
    versi: "0.12.1",
    tanggal: "2026-10-22",
    sha: "806ce68",
    ringkas: "Ekspor data perusahaan kembali berfungsi, dan mesin basis data lama dipensiunkan.",
    butir: [
      {
        jenis: "perbaikan",
        teks: "Ekspor seluruh data perusahaan (hak portabilitas data) kembali menghasilkan berkas; sejak pindah mesin basis data 15 Oktober ia gagal di tabel pertama.",
      },
      {
        jenis: "perbaikan",
        teks: "Ketika server menolak pembuatan buku perusahaan baru karena hak akses, pesannya kini menjelaskan sebabnya, bukan pesan umum.",
      },
    ],
  },
  {
    versi: "0.12.0",
    tanggal: "2026-10-22",
    sha: "c9b5d9c",
    ringkas:
      "Perusahaan bisa dipindahkan dari langganan ke server sendiri dengan data utuh, dan layanan latar dirampingkan.",
    butir: [
      {
        jenis: "baru",
        teks: "Langganan yang pindah ke server sendiri (Enterprise on-premise) kini membawa seluruh buku, pengguna beserta sandinya, hak akses, dan dokumen — tanpa input ulang.",
      },
      {
        jenis: "baru",
        teks: "Selama pemindahan berlangsung, buku tetap bisa dibuka dan diekspor, tetapi perubahan ditolak dengan pesan yang menjelaskan alasannya.",
      },
      {
        jenis: "ubah",
        teks: "Akun yang sudah pindah ke server sendiri melihat pesan khusus saat mencoba masuk ke versi langganan, bukan pesan sandi salah.",
      },
    ],
  },
  {
    versi: "0.11.0",
    tanggal: "2026-10-22",
    sha: "3a6d1d3",
    ringkas:
      "Ekspor Neraca Saldo disiapkan di latar, unduhan ekspor besar kembali bisa dibuka, dan tanggal mengikuti jam Jakarta.",
    butir: [
      {
        jenis: "ubah",
        teks:
          "Ekspor Excel Neraca Saldo kini selalu disiapkan di latar. Setelah menekan tombol ekspor, tunggu beberapa detik sampai tautan unduhannya muncul.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Ekspor laporan berukuran besar yang disiapkan di latar sebelumnya gagal diunduh. Kini berkasnya bisa dibuka.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Tanggal bawaan di formulir penjualan, pembelian, dan perubahan stok kini mengikuti jam Jakarta. Sebelumnya transaksi yang dicatat pukul 00.00\u201307.00 WIB terisi tanggal kemarin.",
      },
      {
        jenis: "ubah",
        teks:
          "Batas \u201cper tanggal\u201d dan periode laporan, beserta tanggal yang tertulis di laporan, kini selalu mengikuti jam Jakarta.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Pencarian cepat (Ctrl+K / \u2318K) tidak lagi membuka halaman yang tidak dicari. Misalnya mengetik \u201cneraca\u201d lalu Enter dulu bisa membuka Ekspor e-Faktur.",
      },
    ],
  },
  {
    versi: "0.10.3",
    tanggal: "2026-10-22",
    sha: "46d2190",
    ringkas: "Laporan kini bisa dicari langsung dari pencarian cepat (Ctrl+K).",
    butir: [
      {
        jenis: "baru",
        teks:
          "Ketik nama laporan di pencarian cepat (Ctrl+K / \u2318K), misalnya \u201cneraca\u201d atau \u201carus kas\u201d, untuk langsung membukanya. Hanya laporan yang boleh Anda buka yang ditampilkan.",
      },
    ],
  },
  {
    versi: "0.10.2",
    tanggal: "2026-10-22",
    sha: "b76a90f",
    ringkas:
      "Pencarian cepat (Ctrl+K) langsung bisa diketik, angka di grafik terbaca di tema gelap, dan sumbu grafik Arus Kas memakai format rupiah.",
    butir: [
      {
        jenis: "perbaikan",
        teks:
          "Pencarian cepat halaman (Ctrl+K / \u2318K) kini langsung siap diketik saat dibuka. Sebelumnya ketikan dan tombol panah tidak berbuat apa-apa sampai kolom pencariannya diklik lebih dulu.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Di tema gelap, nominal pada keterangan grafik Laba/Rugi dan Umur Piutang tertulis hitam di atas latar gelap sehingga tidak terbaca. Kini warnanya mengikuti tema.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Sumbu grafik di laporan Arus Kas kini memakai format rupiah (\u201c10 jt\u201d) seperti grafik lain, bukan \u201c10.0M\u201d.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Kolom kata sandi yang wajib diisi kini ikut bertanda bintang, sama seperti kolom wajib lainnya.",
      },
    ],
  },
  {
    versi: "0.10.1",
    tanggal: "2026-10-21",
    sha: "f79b76c",
    ringkas:
      "Pratinjau Kas & Bank di beranda kembali bekerja, tombol di ponsel tidak lagi terpotong di tepi layar, dan beberapa panel kembali berwarna sebagaimana mestinya.",
    butir: [
      {
        jenis: "perbaikan",
        teks:
          "Tombol \u201cPratinjau Kas & Bank\u201d di beranda sejak rilis sebelumnya selalu berakhir dengan \u201cGagal membuat dokumen.\u201d Kini kembali menghasilkan laporannya. Tombol yang sama di halaman Kas & Bank tidak terdampak.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Di layar ponsel, tombol di kepala beberapa halaman \u2014 stok barang, rincian tagihan, aset tetap \u2014 berjajar melewati tepi layar, sehingga \u201cHapus Tagihan\u201d dan \u201cKembali\u201d tidak terjangkau. Kini tombolnya turun ke baris berikutnya. Isian tanggal di Neraca juga tidak lagi terjepit.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Panel \u201cRingkasan Bahasa Sehari-hari\u201d di laporan dan beberapa sorotan lain berlatar abu-abu tua di tema terang; kini kembali biru muda dan teksnya lebih mudah dibaca. Pilihan yang sedang terpilih di daftar pilihan ikut membaik.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Pesan peringatan berwarna merah \u2014 misalnya periode yang sudah ditutup \u2014 kini lebih kontras dan lebih mudah dibaca di kedua tema.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Pengguna papan ketik kini bisa langsung melompat ke isi halaman tanpa menyusuri seluruh menu samping lebih dulu, dan judul pratinjau laporan ikut berganti bahasa.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Halaman depan, Harga, dan Status tidak lagi bisa digeser ke samping di layar tablet, dan tombol Daftar tidak lagi terpotong.",
      },
    ],
  },
  {
    versi: "0.10.0",
    tanggal: "2026-10-21",
    sha: "a8d2749",
    ringkas:
      "Logo perusahaan Anda kini tercetak di dokumen, gangguan dan pemeliharaan diumumkan langsung di dalam aplikasi, dan setiap dokumen serta laporan PDF kini dibuat dari data yang tersimpan \u2014 bukan dari apa yang kebetulan tampil di layar.",
    butir: [
      {
        jenis: "baru",
        teks:
          "Logo perusahaan bisa diunggah di Pengaturan. Faktur, kontrak, surat jalan, dan nota retur berikutnya dicetak dengan logo itu; dokumen yang sudah dikirim tidak berubah, dan menghapus logo hanya berlaku untuk dokumen sesudahnya.",
      },
      {
        jenis: "baru",
        teks:
          "Jadwal pemeliharaan dan gangguan layanan kini diumumkan sebagai pita di bagian atas aplikasi dan di halaman Status. Pemeliharaan sudah tampil hingga tiga hari sebelum dimulai, dan gangguan yang sudah pulih masih tercantum sehari penuh sesudahnya.",
      },
      {
        jenis: "ubah",
        teks:
          "Faktur, kontrak, surat jalan, dan nota retur kini dicetak oleh server dari data yang tersimpan di buku, sama persis dengan lampiran yang dikirim lewat surel. Sebelumnya PDF digambar di peramban dari isi halaman yang sedang terbuka, sehingga hasilnya bisa bergantung pada perangkat yang dipakai.",
      },
      {
        jenis: "ubah",
        teks:
          "PDF laporan \u2014 laporan keuangan, kas, stok, dan lembar opname \u2014 juga dibuat di server. Halaman laporan jadi lebih ringan dibuka, terutama di ponsel, dan isi kertasnya tetap sama.",
      },
      {
        jenis: "ubah",
        teks:
          "Ekspor laporan yang sangat besar tidak lagi ditolak. Ekspor yang melewati batas baris kini dikerjakan di latar dan berkasnya terunduh begitu siap; ekspor berukuran biasa tetap seketika seperti sebelumnya.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Grafik status di halaman kontrak dulu hanya menghitung tiga status, sehingga kontrak berstatus lain \u2014 seperti yang sudah selesai \u2014 tidak muncul di grafik walau tercantum di tabel di bawahnya. Kini setiap kontrak terhitung, dan warna tiga status utama tidak berpindah.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Alamat yang salah ketik dan halaman yang gagal dimuat kini menampilkan layar berbahasa Anda dengan jalan kembali, bukan layar polos berbahasa Inggris. Tombol \u201cCoba lagi\u201d kini benar-benar memuat ulang datanya.",
      },
    ],
  },
  {
    versi: "0.9.0",
    tanggal: "2026-10-11",
    sha: "400698c",
    ringkas:
      "Lambang produk dirapikan dan dipakai di semua tempat \u2014 ikon tab, ikon layar depan, dan gambar pratinjau kini gambar yang sama dengan yang ada di dalam aplikasi.",
    butir: [
      {
        jenis: "ubah",
        teks:
          "Ikon aplikasi berganti. Sebelumnya ikon di tab peramban dan di layar depan ponsel menampilkan diagram batang biru \u2014 gambar lama yang tidak pernah ikut berubah ketika lambang produk berganti menjadi buku besar. Keduanya kini memakai lambang yang sama dengan yang Anda lihat di pojok kiri atas aplikasi, dalam warna yang sama. Kalau aplikasi ini sudah dipasang ke layar depan, ikonnya ikut berganti setelah ponsel menyegarkannya.",
      },
      {
        jenis: "ubah",
        teks:
          "Gambar yang muncul saat alamat aplikasi ditempel ke WhatsApp atau LinkedIn kini menampilkan lambang produk, bukan huruf awal namanya.",
      },
    ],
  },
  {
    versi: "0.8.0",
    tanggal: "2026-10-10",
    sha: "45fcb23",
    ringkas:
      "Halaman harga menghitung sendiri apakah lebih murah naik paket atau menumpuk paket kecil, dan halaman depan dibuat lebih tenang \u2014 satu warna, perpindahan antar-bagian yang melembut.",
    butir: [
      {
        jenis: "baru",
        teks:
          "Halaman harga menyebutkan hitungannya: untuk jumlah PT yang sama, menumpuk beberapa paket kecil dibandingkan dengan satu paket yang lebih besar, beserta selisihnya per bulan. Angkanya dihitung dari katalog paket yang sedang berlaku \u2014 bukan ditulis di kalimatnya \u2014 jadi ia ikut berubah sendiri bila harga berubah, dan baris yang kebetulan TIDAK lebih hemat tidak ditampilkan.",
      },
      {
        jenis: "ubah",
        teks:
          "Halaman depan dibuat lebih tenang: seluruh bidang berwarnanya kini satu warna alih-alih empat, dan warnanya melembut di batas antar-bagian alih-alih berhenti di satu garis. Isi, urutan, dan angkanya tidak berubah sedikit pun.",
      },
      {
        jenis: "ubah",
        teks:
          "Halaman yang muncul setelah menekan \u201cMinta penawaran\u201d kini berjudul sama dengan tombolnya dan menyebutkan tiga langkah prosesnya \u2014 apa yang Anda kirim, apa yang Anda terima, dan apa yang terjadi setelah disetujui. Sebelumnya ia berjudul \u201cpendaftaran mandiri sedang ditutup\u201d, yang benar tetapi terbaca sebagai penolakan.",
      },
    ],
  },
  {
    versi: "0.7.0",
    tanggal: "2026-10-10",
    sha: "7198187",
    ringkas:
      "Akun baru dibuka lewat penawaran, bukan pendaftaran mandiri \u2014 dan penagihan otomatis berhenti menyentuh akun yang tidak pernah setuju membeli apa pun.",
    butir: [
      {
        jenis: "ubah",
        teks:
          "Pendaftaran mandiri di halaman pendaratan ditutup sementara. Tombolnya kini berbunyi \u201cMinta penawaran\u201d, dan halaman pendaftaran menjelaskan jalannya beserta kanal kontak \u2014 kuota PT, migrasi data, dan cara pembayaran disepakati lebih dulu. Harga di halaman harga tetap dipajang sebagai titik mulainya.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Tagihan langganan tidak lagi terbit untuk akun yang tidak punya perjanjian komersial. Akun uji coba dan internal sebelumnya ikut ditagih, ditagih ulang lewat surel pengingat, lalu bukunya ditangguhkan menjadi hanya-baca; buku yang tertutup karena itu sudah dibuka kembali dan tagihannya dibatalkan.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Tagihan yang digratiskan penyedia berhenti muncul sebagai \u201cLunas\u201d di riwayat tagihan. Ia kini bertanda \u201cKompensasi\u201d \u2014 nilainya memang nol, dan menampilkannya sebagai lunas membuat riwayat pembayaran terbaca seperti ada uang yang pernah masuk.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Perpanjangan langganan yang berganti siklus (bulanan ke tahunan, atau sebaliknya) kini mengambil harga dari siklus yang baru. Sebelumnya harganya tertinggal di siklus lama, sehingga langganan tahunan bisa membawa harga bulanan.",
      },
    ],
  },
  {
    versi: "0.6.0",
    tanggal: "2026-10-04",
    sha: "260f208",
    ringkas:
      "Tahun buku bisa ditutup, saldo mata uang asing dinilai ulang pada kurs penutup, laporan bisa menyandingkan dua periode, dan ada halaman status yang bisa dibuka tanpa masuk.",
    butir: [
      {
        jenis: "baru",
        teks:
          "Laba Rugi dan Neraca bisa menampilkan kolom pembanding: pilih \u201cPeriode sebelumnya\u201d atau \u201cTahun lalu\u201d di penyaring laporan, atau \u201cTanpa pembanding\u201d seperti sebelumnya. Selisih dan persen perubahannya ikut dihitung per baris. Pembanding yang bernilai nol menampilkan tanda pisah, bukan persentase \u2014 dari nol, kenaikan berapa pun tidak punya persen. Kolomnya ikut terbawa ke PDF dan ke lembar sebar.",
      },
      {
        jenis: "baru",
        teks:
          "Tahun buku kini bisa ditutup dari halaman Tutup Periode. Penutupan memindahkan laba tahun itu ke ekuitas lewat jurnal penutup, dan bisa dibatalkan. Laba Rugi mengecualikan jurnal penutup supaya tahun yang sudah ditutup tidak terbaca nol, dan Neraca memisahkan Laba Tahun Berjalan dari laba tahun lalu yang belum ditutup.",
      },
      {
        jenis: "baru",
        teks:
          "Ada laporan Perubahan Ekuitas: saldo awal, laba tahun berjalan, penutupan, lalu saldo akhir \u2014 beserta rekonsiliasinya terhadap Neraca.",
      },
      {
        jenis: "baru",
        teks:
          "Saldo piutang, utang, dan kas bermata uang asing bisa dinilai ulang pada kurs akhir bulan, dengan pratinjau sebelum diposting. Tutup Periode menyebutkan bila masih ada saldo valas yang belum dinilai ulang, jadi bulan tidak tertutup di atas kurs yang sudah usang.",
      },
      {
        jenis: "baru",
        teks:
          "Halaman Status Layanan di alamat /status menyebutkan keadaan pembukuan, langganan & tagihan, serta pengiriman surel pada saat Anda membukanya. Ia sengaja bisa dibuka tanpa masuk \u2014 yang paling membutuhkannya adalah orang yang sedang tidak bisa masuk \u2014 dan tertaut dari kaki setiap halaman. Pemeliharaan yang dijadwalkan diumumkan di sana sebelum berlangsung, beserta jamnya.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Tahun buku yang belum berakhir tidak bisa lagi ditutup. Sebelumnya penutupan menerima tahun yang masih berjalan, dan jurnal penutupnya memindahkan laba yang belum lengkap ke ekuitas.",
      },
      {
        jenis: "ubah",
        teks:
          "Halaman bantuan di /docs ditulis ulang dengan kalimat yang lebih pendek. Isinya tidak berubah \u2014 angka, contoh, dan aturannya sama persis \u2014 hanya lebih enak dibaca.",
      },
    ],
  },
  {
    versi: "0.5.0",
    tanggal: "2026-09-05",
    sha: "f86e86b",
    ringkas:
      "Daftar yang gagal dimuat berhenti tampil sebagai daftar kosong, stok masuk bisa langsung memotong kas, dan kontrak menyebut sendiri apakah ia kena PPN.",
    butir: [
      {
        jenis: "perbaikan",
        teks:
          "Pemilih pemasok, pelanggan, akun, dan pusat biaya sempat menampilkan \u201ctidak ada pilihan\u201d padahal datanya ada — yang gagal dimuat terbaca sama persis dengan yang memang kosong. Kini kegagalan dikatakan sebagai kegagalan, dan daftar kosong hanya muncul kalau memang tidak ada isinya.",
      },
      {
        jenis: "baru",
        teks:
          "Saat menambah stok masuk, Anda bisa memilih kas atau bank yang uangnya keluar untuk barang itu. Nilainya dihitung dari jumlah kali harga pokok dan tampil sebelum disimpan. Bawaannya tetap tidak memotong apa pun — barang yang masuk lewat layar Pembelian sudah punya hutang dan pelunasannya sendiri.",
      },
      {
        jenis: "baru",
        teks:
          "Kontrak kini menyebut sendiri apakah ia kena PPN, dan faktur yang ditarik darinya mewarisi jawaban itu. Sebelumnya PPN baru muncul di faktur dengan bawaan yang disimpulkan dari mata uang dan pelanggan, sehingga kontrak rupiah tanpa PPN harus dibetulkan dengan tangan pada setiap fakturnya.",
      },
      {
        jenis: "ubah",
        teks:
          "Kontrak lama tidak berubah perilakunya: selama PPN-nya belum dinyatakan, fakturnya tetap memakai bawaan yang sama seperti sebelumnya. Tarifnya tetap mengikuti profil pajak perusahaan pada tanggal faktur — perusahaan non-PKP tetap tidak memungut.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Jawaban \u201ctidak\u201d pada beberapa isian ya/tidak bisa tersimpan terbalik menjadi \u201cya\u201d bila dikirim dari luar aplikasi. Menyangkut status PKP serta penonaktifan resep produksi dan stasiun kerja. Nilai yang tidak dikenali kini ditolak, bukan ditebak.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Beberapa tugas terjadwal di latar bisa macet dan menahan seluruh tugas berikutnya tanpa tanda apa pun. Kini tugas yang macet dihentikan sendiri dan yang berikutnya tetap berjalan.",
      },
    ],
  },
  {
    versi: "0.4.0",
    tanggal: "2026-08-30",
    sha: "f990c44",
    ringkas:
      "Halaman bantuan baru yang memperlihatkan alur kerja lengkap untuk tiap jenis usaha, lengkap dengan gambarnya.",
    butir: [
      {
        jenis: "baru",
        teks:
          "Halaman bantuan \u201cAlur kerja untuk jenis usaha Anda\u201d — urutan ujung-ke-ujung untuk perdagangan ekspor, distribusi, jasa, dan manufaktur, masing-masing dengan gambar tahapannya dan modul yang mengerjakan tiap tahap.",
      },
      {
        jenis: "baru",
        teks:
          "Empat gambar alur baru menjelaskan perbedaan tiap jenis usaha secara langsung: mana yang mulai dari kontrak, mana yang tak punya surat jalan sama sekali, dan di mana tahap produksi menyisip.",
      },
    ],
  },
  {
    versi: "0.3.0",
    tanggal: "2026-08-30",
    sha: "978687f",
    ringkas:
      "Riwayat perubahan kini bisa dibaca dari dalam aplikasi — halaman yang sedang Anda buka ini.",
    butir: [
      {
        jenis: "baru",
        teks:
          "Halaman \u201cApa yang Baru\u201d — halaman ini sendiri. Sebelumnya catatan perubahan hanya ada di tempat yang dibaca pengembang, jadi menu yang tiba-tiba muncul tidak pernah punya penjelasan yang bisa Anda buka sendiri.",
      },
      {
        jenis: "ubah",
        teks:
          "Nomor versi di kaki menu samping kini bisa diklik dan membawa Anda ke halaman ini. Sebelumnya ia hanya angka yang tidak menuju ke mana-mana.",
      },
    ],
  },
  {
    versi: "0.2.0",
    tanggal: "2026-08-30",
    sha: "8ac0d9c",
    ringkas:
      "Modul Manufaktur, dan panduan untuk setiap modul — termasuk delapan yang selama ini tidak punya.",
    butir: [
      {
        jenis: "baru",
        teks:
          "Modul Manufaktur: resep produksi, stasiun kerja, dan perintah produksi. Ia tidak menyala sendiri — dinyalakan per perusahaan di halaman Modul Usaha, atau dengan memilih kategori usaha Manufaktur saat setup.",
      },
      {
        jenis: "baru",
        teks:
          "Perintah produksi menghitung harga pokok barang jadi dari biaya yang sungguhan terpakai: bahan, upah, dan overhead pabrik. Selisih rencana lawan kenyataan ditampilkan sebagai informasi, dan tidak pernah menjadi jurnal.",
      },
      {
        jenis: "baru",
        teks:
          "Panduan Alur Kerja di Beranda bertambah tujuh: Stok, Kas & Bank, Produksi, Kontrak & Dokumen Ekspor, Aset Tetap, Persetujuan, dan Pajak. Sebelumnya hanya ada tiga, sehingga delapan dari sebelas modul tidak punya panduan urutan sama sekali.",
      },
      {
        jenis: "baru",
        teks:
          "Halaman bantuan baru tentang manufaktur, dan tur berpandu di layar Perintah Produksi.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Retur Penjualan dan Surat Jalan sebelumnya ikut menghilang ketika modul yang salah dimatikan. Keduanya kini berada di modul yang benar-benar memilikinya.",
      },
      {
        jenis: "perbaikan",
        teks:
          "Transaksi Berulang tidak lagi menuntut izin faktur; ia memakai izinnya sendiri.",
      },
      {
        jenis: "ubah",
        teks:
          "Nomor versi di kaki menu samping kini benar-benar berganti tiap rilis. Sebelumnya ia menampilkan angka yang sama untuk setiap rilis yang pernah ada, sehingga tidak berguna ketika Anda menyebutnya dalam laporan masalah.",
      },
    ],
  },
];

/** Rilis yang sedang berjalan — yang nomornya tampil di kaki menu samping. */
export const RILIS_TERKINI: Rilis | undefined = RILIS[0];
