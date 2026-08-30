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
