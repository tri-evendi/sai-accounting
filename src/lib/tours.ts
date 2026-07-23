/**
 * Tur panduan in-app (issue #21) — definisi langkahnya, murni data.
 *
 * Tidak ada React, DOM, atau localStorage di sini supaya isi tur bisa diuji
 * dan dirawat terpisah dari mesin penampilnya (`src/components/help/guided-tour.tsx`).
 *
 * `target` menunjuk atribut `data-tour="..."` pada elemen halaman. Bila elemen
 * itu tidak ditemukan (mis. panel disembunyikan untuk peran tertentu), langkahnya
 * tetap tampil sebagai kartu di tengah layar — tur tidak boleh macet hanya karena
 * satu sasaran tidak ada.
 */

export interface TourStep {
  title: string;
  body: string;
  /** Nilai `data-tour` elemen yang disorot. Kosong = kartu di tengah layar. */
  target?: string;
}

export interface TourDef {
  id: string;
  /** Path halaman tempat tur ini berjalan (cocok persis). */
  path: string;
  title: string;
  steps: TourStep[];
}

export const TOURS: TourDef[] = [
  {
    id: "beranda",
    path: "/dashboard",
    title: "Kenalan dengan Beranda",
    steps: [
      {
        title: "Selamat datang",
        body:
          "Tur singkat ini menunjukkan tiga hal: cara mencatat pekerjaan sehari-hari, cara membaca ringkasan angka, dan tempat mencari arti istilah. Bisa dilewati kapan saja dan diulang lewat menu Bantuan.",
      },
      {
        title: "Aksi Cepat",
        body:
          "Enam pekerjaan tersering ada di sini — catat penjualan, catat pembelian, terima uang, bayar, tambah stok, buat kontrak. Satu klik langsung ke formulirnya.",
        target: "aksi-cepat",
      },
      {
        title: "Ringkasan bahasa sehari-hari",
        body:
          "Angka utama bulan ini tanpa istilah akuntansi. Setiap kartu punya tautan ke laporan sumbernya, jadi angkanya selalu bisa dicek.",
        target: "ringkasan",
      },
      {
        title: "Menu per jenis pekerjaan",
        body:
          "Menu kiri dikelompokkan menurut pekerjaan: Penjualan, Pembelian, Kas & Bank, Stok & Aset, Laporan, Bantuan & Pengaturan.",
        target: "menu-tugas",
      },
      {
        title: "Bantuan & Kamus Istilah",
        body:
          "Tidak paham sebuah istilah? Buka menu Bantuan untuk Kamus Istilah, atau ulangi tur halaman ini kapan saja.",
        target: "bantuan",
      },
    ],
  },
  {
    id: "persetujuan",
    path: "/approvals",
    title: "Cara kerja persetujuan",
    steps: [
      {
        title: "Kenapa ada halaman ini",
        body:
          "Transaksi yang nilainya besar tidak langsung masuk pembukuan — ia menunggu keputusan di sini dulu. Dokumennya sudah tersimpan aman; yang tertunda hanya pencatatan jurnalnya.",
      },
      {
        title: "Menunggu Keputusan Anda",
        body:
          "Antrean yang harus Anda putuskan. Buka dokumennya lewat tautan, lalu Setujui (jurnal langsung terbit) atau Tolak dengan catatan alasan supaya pemohon tahu apa yang perlu diperbaiki.",
        target: "persetujuan-antrean",
      },
      {
        title: "Pengajuan Saya",
        body:
          "Kabar untuk dokumen yang Anda ajukan: masih menunggu, disetujui, atau ditolak beserta alasannya. Dokumen yang ditolak bisa diperbaiki lalu diajukan ulang dari sini.",
        target: "persetujuan-pengajuan",
      },
      {
        title: "Riwayat Keputusan",
        body:
          "Semua keputusan yang pernah dibuat peran Anda tercatat di sini — bisa diurutkan, jadi mudah menjawab pertanyaan seperti “keputusan terbesar bulan ini”.",
        target: "persetujuan-riwayat",
      },
    ],
  },
  {
    id: "buat_penjualan",
    path: "/invoices/new",
    title: "Cara membuat tagihan",
    steps: [
      {
        title: "Membuat tagihan",
        body:
          "Halaman ini membuat tagihan penjualan (faktur) untuk pelanggan. Isi identitas tagihan, lalu daftar barangnya. Kalau lebih suka dipandu langkah demi langkah, pakai “Catat Penjualan” di menu Penjualan.",
      },
      {
        title: "Identitas tagihan",
        body:
          "Nomor tagihan, tanggal, batas waktu bayar, pelanggan, dan mata uang. Untuk mata uang asing, kurs wajib diisi agar nilainya tercatat dalam Rupiah.",
        target: "faktur-identitas",
      },
      {
        title: "Barang yang dijual",
        body:
          "Tambahkan barang, jumlah, dan harga satuannya. Totalnya dihitung otomatis, termasuk pajak penjualan bila dikenakan.",
        target: "faktur-barang",
      },
      {
        title: "Simpan",
        body:
          "Setelah disimpan, tagihan langsung muncul di daftar dan sisanya masuk ke \"Pelanggan Belum Bayar\" sampai dilunasi.",
        target: "faktur-simpan",
      },
    ],
  },
  {
    id: "laporan",
    path: "/reports",
    title: "Cara membaca laporan",
    steps: [
      {
        title: "Pusat Laporan",
        body:
          "Semua laporan ada di satu halaman ini, dikelompokkan per kategori. Pilih laporan, atur periodenya, lalu ekspor ke PDF atau Excel.",
        target: "pusat-laporan",
      },
      {
        title: "Mulai dari yang paling sering dipakai",
        body:
          "\"Untung atau Rugi\" menjawab apakah bulan ini untung; \"Posisi Kekayaan & Utang\" menunjukkan kondisi pada satu tanggal; \"Uang Masuk & Keluar\" menelusuri kas yang benar-benar bergerak.",
        target: "laporan-kategori-pertama",
      },
      {
        title: "Arti tiap istilah",
        body:
          "Nama laporan memakai bahasa sehari-hari; istilah bakunya bisa dibuka lewat ikon \"?\" atau di Kamus Istilah dari menu Bantuan.",
        target: "bantuan",
      },
    ],
  },
];

/** Tur untuk sebuah path, atau `null` bila halaman itu belum punya tur. */
export function tourForPath(pathname: string): TourDef | null {
  return TOURS.find((tour) => tour.path === pathname) ?? null;
}

/**
 * Kunci localStorage penanda "tur sudah pernah dilihat" (issue #21).
 * Sengaja localStorage, bukan tabel baru: preferensi tampilan per-perangkat,
 * tanpa menyentuh skema database.
 */
export function tourStorageKey(tourId: string): string {
  return `sai:tour-seen:${tourId}`;
}
