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
 *
 * ── Tur vs modul usaha (issue #103) ────────────────────────────────────────
 * Turnya sendiri TIDAK rusak oleh modul: `tourForPath` mencocokkan path persis,
 * jadi halaman yang tak terjangkau tak pernah memicu turnya, dan sasaran
 * `data-tour` yang hilang jatuh ke kartu di tengah (lihat paragraf di atas).
 *
 * Yang sempat menyesatkan adalah ISI-nya: dua langkah tur Beranda MENYEBUT SATU
 * PER SATU pekerjaan dan kelompok menu yang belum tentu ada — "tambah stok, buat
 * kontrak" pada perusahaan jasa menjanjikan tombol yang memang tidak dirender.
 * Perbaikannya di kalimat, bukan di mesin: kedua langkah itu kini menjelaskan
 * ATURANNYA ("yang tampil hanya yang boleh Anda kerjakan dan yang dipakai
 * perusahaan ini") alih-alih membacakan daftar isinya.
 *
 * SENGAJA belum ada `permission` per langkah. Rancangan awal #103 mengusulkannya,
 * tapi setelah ditelusuri tak satu pun langkah yang ada berpasangan satu-lawan-
 * satu dengan sebuah modul: keempat sasaran tur Beranda (Aksi Cepat, Ringkasan,
 * menu samping, menu Bantuan) selalu dirender, dan tur lain hidup di halaman yang
 * seluruhnya milik satu modul — mati modulnya, halamannya pun tak terbuka.
 * Menambah medan izin yang tak dipakai siapa pun berarti menambah mesin (plus
 * pembacaan izin di sisi client) untuk penyaringan yang tak pernah terjadi. Saat
 * kelak ada langkah yang memang milik satu modul, medan itu ditambahkan
 * bersamanya.
 */

import type { DictionaryKey } from "@/lib/i18n/dictionary";

export interface TourStep {
  /** Judul langkah dalam bahasa SUMBER (dipakai tes; layar memakai kuncinya). */
  title: string;
  /** Isi langkah dalam bahasa sumber. */
  body: string;
  /** Kunci kamus untuk `title`. */
  titleKey: DictionaryKey;
  /** Kunci kamus untuk `body`. */
  bodyKey: DictionaryKey;
  /** Nilai `data-tour` elemen yang disorot. Kosong = kartu di tengah layar. */
  target?: string;
}

export interface TourDef {
  id: string;
  /** Path halaman tempat tur ini berjalan (cocok persis). */
  path: string;
  /** Judul tur dalam bahasa sumber. */
  title: string;
  /** Kunci kamus untuk `title`. */
  titleKey: DictionaryKey;
  steps: TourStep[];
}

export const TOURS: TourDef[] = [
  {
    id: "beranda",
    path: "/dashboard",
    title: "Kenalan dengan Beranda",
    titleKey: "tours.beranda.title",
    steps: [
      {
        title: "Selamat datang",
        titleKey: "tours.beranda.s1.title",
        body:
          "Tur singkat ini menunjukkan tiga hal: cara mencatat pekerjaan sehari-hari, cara membaca ringkasan angka, dan tempat mencari arti istilah. Bisa dilewati kapan saja dan diulang lewat menu Bantuan.",
        bodyKey: "tours.beranda.s1.body",
      },
      {
        title: "Aksi Cepat",
        titleKey: "tours.beranda.s2.title",
        body:
          "Pekerjaan yang paling sering Anda lakukan ada di sini — mencatat penjualan, menerima uang, dan seterusnya. Yang tampil hanya yang boleh Anda kerjakan dan yang dipakai perusahaan ini, jadi daftarnya bisa berbeda antar pengguna. Satu klik langsung ke formulirnya.",
        bodyKey: "tours.beranda.s2.body",
        target: "aksi-cepat",
      },
      {
        title: "Ringkasan bahasa sehari-hari",
        titleKey: "tours.beranda.s3.title",
        body:
          "Angka utama bulan ini tanpa istilah akuntansi. Setiap kartu punya tautan ke laporan sumbernya, jadi angkanya selalu bisa dicek.",
        bodyKey: "tours.beranda.s3.body",
        target: "ringkasan",
      },
      {
        title: "Menu per jenis pekerjaan",
        titleKey: "tours.beranda.s4.title",
        body:
          "Menu kiri dikelompokkan menurut pekerjaan — penjualan, pembelian, kas & bank, laporan, dan seterusnya. Kelompok untuk fitur yang tidak dipakai perusahaan ini tidak ditampilkan, jadi menu Anda mungkin lebih pendek daripada milik orang lain.",
        bodyKey: "tours.beranda.s4.body",
        target: "menu-tugas",
      },
      {
        title: "Bantuan & Kamus Istilah",
        titleKey: "tours.beranda.s5.title",
        body:
          "Tidak paham sebuah istilah? Buka menu Bantuan untuk Kamus Istilah, atau ulangi tur halaman ini kapan saja.",
        bodyKey: "tours.beranda.s5.body",
        target: "bantuan",
      },
    ],
  },
  {
    id: "persetujuan",
    path: "/approvals",
    title: "Cara kerja persetujuan",
    titleKey: "tours.persetujuan.title",
    steps: [
      {
        title: "Kenapa ada halaman ini",
        titleKey: "tours.persetujuan.s1.title",
        body:
          "Transaksi yang nilainya besar tidak langsung masuk pembukuan — ia menunggu keputusan di sini dulu. Dokumennya sudah tersimpan aman; yang tertunda hanya pencatatan jurnalnya.",
        bodyKey: "tours.persetujuan.s1.body",
      },
      {
        title: "Menunggu Keputusan Anda",
        titleKey: "tours.persetujuan.s2.title",
        body:
          "Antrean yang harus Anda putuskan. Buka dokumennya lewat tautan, lalu Setujui (jurnal langsung terbit) atau Tolak dengan catatan alasan supaya pemohon tahu apa yang perlu diperbaiki.",
        bodyKey: "tours.persetujuan.s2.body",
        target: "persetujuan-antrean",
      },
      {
        title: "Pengajuan Saya",
        titleKey: "tours.persetujuan.s3.title",
        body:
          "Kabar untuk dokumen yang Anda ajukan: masih menunggu, disetujui, atau ditolak beserta alasannya. Dokumen yang ditolak bisa diperbaiki lalu diajukan ulang dari sini.",
        bodyKey: "tours.persetujuan.s3.body",
        target: "persetujuan-pengajuan",
      },
      {
        title: "Riwayat Keputusan",
        titleKey: "tours.persetujuan.s4.title",
        body:
          "Semua keputusan yang pernah dibuat peran Anda tercatat di sini — bisa diurutkan, jadi mudah menjawab pertanyaan seperti “keputusan terbesar bulan ini”.",
        bodyKey: "tours.persetujuan.s4.body",
        target: "persetujuan-riwayat",
      },
    ],
  },
  {
    id: "buat_penjualan",
    path: "/invoices/new",
    title: "Cara membuat tagihan",
    titleKey: "tours.buat_penjualan.title",
    steps: [
      {
        title: "Membuat tagihan",
        titleKey: "tours.buat_penjualan.s1.title",
        body:
          "Halaman ini membuat tagihan penjualan (faktur) untuk pelanggan. Isi identitas tagihan, lalu daftar barangnya. Kalau lebih suka dipandu langkah demi langkah, pakai “Catat Penjualan” di menu Penjualan.",
        bodyKey: "tours.buat_penjualan.s1.body",
      },
      {
        title: "Identitas tagihan",
        titleKey: "tours.buat_penjualan.s2.title",
        body:
          "Nomor tagihan, tanggal, batas waktu bayar, pelanggan, dan mata uang. Untuk mata uang asing, kurs wajib diisi agar nilainya tercatat dalam Rupiah.",
        bodyKey: "tours.buat_penjualan.s2.body",
        target: "faktur-identitas",
      },
      {
        title: "Barang yang dijual",
        titleKey: "tours.buat_penjualan.s3.title",
        body:
          "Tambahkan barang, jumlah, dan harga satuannya. Totalnya dihitung otomatis, termasuk pajak penjualan bila dikenakan.",
        bodyKey: "tours.buat_penjualan.s3.body",
        target: "faktur-barang",
      },
      {
        title: "Simpan",
        titleKey: "tours.buat_penjualan.s4.title",
        body:
          "Setelah disimpan, tagihan langsung muncul di daftar dan sisanya masuk ke \"Pelanggan Belum Bayar\" sampai dilunasi.",
        bodyKey: "tours.buat_penjualan.s4.body",
        target: "faktur-simpan",
      },
    ],
  },
  {
    id: "laporan",
    path: "/reports",
    title: "Cara membaca laporan",
    titleKey: "tours.laporan.title",
    steps: [
      {
        title: "Pusat Laporan",
        titleKey: "tours.laporan.s1.title",
        body:
          "Semua laporan ada di satu halaman ini, dikelompokkan per kategori. Pilih laporan, atur periodenya, lalu ekspor ke PDF atau Excel.",
        bodyKey: "tours.laporan.s1.body",
        target: "pusat-laporan",
      },
      {
        title: "Mulai dari yang paling sering dipakai",
        titleKey: "tours.laporan.s2.title",
        body:
          "\"Untung atau Rugi\" menjawab apakah bulan ini untung; \"Posisi Kekayaan & Utang\" menunjukkan kondisi pada satu tanggal; \"Uang Masuk & Keluar\" menelusuri kas yang benar-benar bergerak.",
        bodyKey: "tours.laporan.s2.body",
        target: "laporan-kategori-pertama",
      },
      {
        title: "Arti tiap istilah",
        titleKey: "tours.laporan.s3.title",
        body:
          "Nama laporan memakai bahasa sehari-hari; istilah bakunya bisa dibuka lewat ikon \"?\" atau di Kamus Istilah dari menu Bantuan.",
        bodyKey: "tours.laporan.s3.body",
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
