/**
 * Alur Kerja (panduan urutan) — menjawab "mulai dari mana?".
 *
 * Sistem punya banyak fitur tapi menu hanya MENDAFTAR-nya, tak menunjukkan
 * URUTAN mengerjakannya. Modul ini memetakan pekerjaan sehari-hari menjadi
 * beberapa alur bernomor (Penjualan, Pembelian, Tutup Buku) yang tiap
 * langkahnya menuju halaman/formulir yang tepat — sehingga pengguna awam tahu
 * "kontrak dulu, baru surat jalan, baru faktur, baru terima uang".
 *
 * MURNI (tanpa React/ikon/Prisma) seperti `nav.ts`/`quick-actions.ts`: ikon
 * disebut sebagai NAMA string, penyaringan izin bisa diuji langsung. Langkah
 * yang izinnya tak dimiliki pengguna DIBUANG lalu sisanya dinomori ulang, dan
 * alur yang tersisa < 2 langkah tidak ditampilkan (bukan "alur" lagi).
 *
 * TAMPILAN saja — tiap halaman tujuan tetap dijaga `requirePagePermission`.
 */
import { can, type Permission } from "@/lib/authz";
import { BUSINESS_MODULES, type BusinessModule } from "@/lib/business-modules";
import type { AllowedPermissions } from "@/lib/nav";
import type { TermKey } from "@/lib/labels";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export type WorkflowTone = "in" | "out" | "neutral";

export interface WorkflowStep {
  /**
   * Perintah bahasa tugas (bahasa SUMBER), mis. "Catat Penjualan". Panelnya
   * menggambar `labelKey`; teks ini tetap ada karena modul ini murni & teruji
   * — pola yang sama dengan `QUICK_ACTIONS` (lihat `quick-actions.ts`).
   */
  label: string;
  /** Satu baris: apa yang terjadi di langkah ini (bahasa sumber). */
  description: string;
  /** Kunci kamus untuk `label`. */
  labelKey: DictionaryKey;
  /** Kunci kamus untuk `description`. */
  descriptionKey: DictionaryKey;
  href: string;
  /** Nama ikon (kunci peta `ICONS` di panelnya); dipetakan ke komponen di sana. */
  icon: string;
  /** Izin halaman tujuan — sama dengan `requirePagePermission` di sana. */
  permission: Permission;
  /** Langkah opsional (mis. Kontrak) — ditandai di UI, tidak wajib dilalui. */
  optional?: boolean;
  termKey?: TermKey;
}

export interface Workflow {
  id: string;
  /** Nama alur dalam bahasa sumber, mis. "Alur Penjualan". */
  label: string;
  /** Satu baris menjelaskan kapan alur ini dipakai (bahasa sumber). */
  description: string;
  /** Kunci kamus untuk `label`. */
  labelKey: DictionaryKey;
  /** Kunci kamus untuk `description`. */
  descriptionKey: DictionaryKey;
  tone: WorkflowTone;
  /**
   * Modul usaha yang dilayani alur ini — dasar penjaga cakupan.
   *
   * Sebuah alur boleh melayani lebih dari satu modul (Tutup Buku menyentuh
   * inti dan kas), dan sebuah modul boleh dilayani lebih dari satu alur. Yang
   * dijaga `tests/panduan-cakupan.test.ts` cuma satu: tidak ada modul yang
   * TIDAK disebut siapa pun tanpa alasan tertulis.
   *
   * Medan ini sengaja TIDAK diturunkan dari izin langkah-langkahnya. Alur
   * Penjualan berlangkah kontrak (`trading`) dan terima uang (`cash_bank`),
   * tetapi ia bukan panduan untuk kedua modul itu — turunan otomatis akan
   * mengaku menutupi modul yang sebenarnya cuma dilewati, dan itu justru
   * membuat penjaganya hijau di saat yang paling salah.
   */
  modules: readonly BusinessModule[];
  steps: WorkflowStep[];
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "penjualan",
    modules: ["sales"],
    label: "Alur Penjualan",
    description: "Dari kesepakatan sampai uang masuk — urutan mencatat penjualan.",
    labelKey: "workflows.penjualan.label",
    descriptionKey: "workflows.penjualan.description",
    tone: "in",
    steps: [
      {
        label: "Buat Kontrak",
        description: "Kesepakatan sebelum barang dikirim.",
        labelKey: "workflows.penjualan.steps.kontrak.label",
        descriptionKey: "workflows.penjualan.steps.kontrak.description",
        href: "/contracts/new",
        icon: "FileText",
        permission: "contract.write",
        optional: true,
        termKey: "kontrak",
      },
      {
        label: "Catat Penjualan",
        description: "Dipandu: pelanggan → barang → surat jalan → faktur.",
        labelKey: "workflows.penjualan.steps.penjualan.label",
        descriptionKey: "workflows.penjualan.steps.penjualan.description",
        href: "/sales/new",
        icon: "Receipt",
        permission: "invoice.write",
        termKey: "faktur",
      },
      {
        label: "Terima Pembayaran",
        description: "Catat uang masuk ke kas / bank.",
        labelKey: "workflows.penjualan.steps.terima.label",
        descriptionKey: "workflows.penjualan.steps.terima.description",
        href: "/finance/new?arah=masuk",
        icon: "ArrowDownLeft",
        permission: "cash.write",
        termKey: "kas_bank",
      },
      {
        label: "Pantau Piutang",
        description: "Lihat pelanggan yang belum bayar.",
        labelKey: "workflows.penjualan.steps.piutang.label",
        descriptionKey: "workflows.penjualan.steps.piutang.description",
        href: "/receivables",
        icon: "HandCoins",
        permission: "receivable.read",
        termKey: "piutang",
      },
    ],
  },
  {
    id: "pembelian",
    modules: ["purchasing"],
    label: "Alur Pembelian",
    description: "Dari beli barang sampai utang lunas.",
    labelKey: "workflows.pembelian.label",
    descriptionKey: "workflows.pembelian.description",
    tone: "out",
    steps: [
      {
        label: "Catat Pembelian",
        description: "Dipandu: pemasok → barang → utang.",
        labelKey: "workflows.pembelian.steps.pembelian.label",
        descriptionKey: "workflows.pembelian.steps.pembelian.description",
        href: "/purchases/new",
        icon: "ShoppingCart",
        permission: "purchase.write",
        termKey: "pembelian",
      },
      {
        label: "Bayar Pemasok",
        description: "Catat uang keluar dari kas / bank.",
        labelKey: "workflows.pembelian.steps.bayar.label",
        descriptionKey: "workflows.pembelian.steps.bayar.description",
        href: "/finance/new?arah=keluar",
        icon: "ArrowUpRight",
        permission: "cash.write",
        termKey: "kas_bank",
      },
      {
        label: "Pantau Utang",
        description: "Lihat tagihan yang harus dibayar.",
        labelKey: "workflows.pembelian.steps.utang.label",
        descriptionKey: "workflows.pembelian.steps.utang.description",
        href: "/payables",
        icon: "Wallet",
        permission: "payable.read",
        termKey: "utang",
      },
    ],
  },
  {
    id: "tutup_buku",
    modules: ["core_accounting"],
    label: "Tutup Buku Bulanan",
    description: "Beres-beres tiap akhir bulan sebelum laporan final.",
    labelKey: "workflows.tutup_buku.label",
    descriptionKey: "workflows.tutup_buku.description",
    tone: "neutral",
    steps: [
      {
        label: "Cocokkan Rekening",
        description: "Samakan catatan dengan rekening koran bank.",
        labelKey: "workflows.tutup_buku.steps.cocokkan.label",
        descriptionKey: "workflows.tutup_buku.steps.cocokkan.description",
        href: "/reconciliation",
        icon: "Scale",
        permission: "reconciliation.read",
        termKey: "rekonsiliasi_bank",
      },
      {
        label: "Kunci Bulan",
        description: "Tutup periode agar angkanya tak berubah lagi.",
        labelKey: "workflows.tutup_buku.steps.kunci.label",
        descriptionKey: "workflows.tutup_buku.steps.kunci.description",
        href: "/periods",
        icon: "Lock",
        permission: "period.manage",
        termKey: "tutup_periode",
      },
      {
        label: "Lihat Laporan",
        description: "Laba/rugi, neraca, arus kas.",
        labelKey: "workflows.tutup_buku.steps.laporan.label",
        descriptionKey: "workflows.tutup_buku.steps.laporan.description",
        href: "/reports",
        icon: "BarChart3",
        permission: "report.read",
      },
    ],
  },
  {
    id: "stok",
    modules: ["inventory"],
    label: "Alur Stok",
    description: "Dari barang masuk gudang sampai nilainya di laporan.",
    labelKey: "workflows.stok.label",
    descriptionKey: "workflows.stok.description",
    tone: "neutral",
    steps: [
      {
        label: "Tambah Stok Masuk",
        description: "Catat barang yang baru diterima beserta harga belinya.",
        labelKey: "workflows.stok.steps.masuk.label",
        descriptionKey: "workflows.stok.steps.masuk.description",
        href: "/inventory/update",
        icon: "Package",
        permission: "inventory.write",
        termKey: "persediaan",
      },
      {
        label: "Buat Surat Jalan",
        description: "Barang keluar gudang — stok turun dan harga pokoknya tercatat.",
        labelKey: "workflows.stok.steps.keluar.label",
        descriptionKey: "workflows.stok.steps.keluar.description",
        href: "/delivery-orders/new",
        icon: "Truck",
        permission: "delivery_order.write",
        termKey: "surat_jalan",
      },
      {
        label: "Hitung Stok Opname",
        description: "Samakan catatan dengan hitungan fisik di gudang.",
        labelKey: "workflows.stok.steps.opname.label",
        descriptionKey: "workflows.stok.steps.opname.description",
        href: "/inventory/opname",
        icon: "ClipboardCheck",
        permission: "inventory.write",
        termKey: "stok_opname",
      },
      {
        label: "Lihat Nilai Persediaan",
        description: "Berapa rupiah yang sedang tertahan di gudang.",
        labelKey: "workflows.stok.steps.nilai.label",
        descriptionKey: "workflows.stok.steps.nilai.description",
        href: "/reports/stock-value",
        icon: "BarChart3",
        permission: "report.read",
        termKey: "hpp",
      },
    ],
  },
  {
    id: "kas",
    modules: ["cash_bank"],
    label: "Alur Kas & Bank",
    description: "Mencatat uang keluar-masuk lalu memastikannya cocok dengan bank.",
    labelKey: "workflows.kas.label",
    descriptionKey: "workflows.kas.description",
    tone: "neutral",
    steps: [
      {
        label: "Catat Transaksi Kas",
        description: "Uang masuk atau keluar, dari kas maupun rekening bank.",
        labelKey: "workflows.kas.steps.catat.label",
        descriptionKey: "workflows.kas.steps.catat.description",
        href: "/finance/new",
        icon: "ArrowDownLeft",
        permission: "cash.write",
        termKey: "kas_bank",
      },
      {
        label: "Periksa Buku Kas",
        description: "Semua transaksi kas dan bank dalam satu daftar.",
        labelKey: "workflows.kas.steps.buku.label",
        descriptionKey: "workflows.kas.steps.buku.description",
        href: "/finance",
        icon: "Wallet",
        permission: "cash.read",
        termKey: "kas_kecil",
      },
      {
        label: "Cocokkan Rekening",
        description: "Samakan catatan Anda dengan rekening koran bank.",
        labelKey: "workflows.kas.steps.cocokkan.label",
        descriptionKey: "workflows.kas.steps.cocokkan.description",
        href: "/reconciliation",
        icon: "Scale",
        permission: "reconciliation.read",
        termKey: "rekonsiliasi_bank",
      },
      {
        label: "Lihat Laporan Kas",
        description: "Ke mana uang pergi selama periode ini.",
        labelKey: "workflows.kas.steps.laporan.label",
        descriptionKey: "workflows.kas.steps.laporan.description",
        href: "/reports/cash-bank",
        icon: "BarChart3",
        permission: "report.read",
        termKey: "arus_kas",
      },
    ],
  },
  {
    id: "produksi",
    modules: ["manufacturing"],
    label: "Alur Produksi",
    description: "Dari resep sampai barang jadi masuk gudang dengan harga pokoknya.",
    labelKey: "workflows.produksi.label",
    descriptionKey: "workflows.produksi.description",
    tone: "neutral",
    steps: [
      {
        label: "Siapkan Stasiun Kerja",
        description: "Tempat kerja beserta tarif upah dan overhead per jamnya.",
        labelKey: "workflows.produksi.steps.stasiun.label",
        descriptionKey: "workflows.produksi.steps.stasiun.description",
        href: "/work-centers",
        icon: "Factory",
        permission: "work_center.manage",
      },
      {
        label: "Susun Resep Produksi",
        description: "Bahan dan tahapan untuk sekian unit keluaran.",
        labelKey: "workflows.produksi.steps.resep.label",
        descriptionKey: "workflows.produksi.steps.resep.description",
        href: "/boms/new",
        icon: "ClipboardList",
        permission: "bill_of_material.write",
        termKey: "resep_produksi",
      },
      {
        label: "Jalankan Perintah Produksi",
        description: "Satu batch: bahan keluar, lalu barang jadi masuk.",
        labelKey: "workflows.produksi.steps.jalankan.label",
        descriptionKey: "workflows.produksi.steps.jalankan.description",
        href: "/production-orders/new",
        icon: "Factory",
        permission: "production_order.write",
        termKey: "perintah_produksi",
      },
      {
        label: "Pantau Barang Dalam Proses",
        description: "Batch yang belum selesai dan berapa biaya yang sudah tertanam.",
        labelKey: "workflows.produksi.steps.pantau.label",
        descriptionKey: "workflows.produksi.steps.pantau.description",
        href: "/production-orders",
        icon: "ClipboardCheck",
        permission: "production_order.read",
        termKey: "barang_dalam_proses",
      },
    ],
  },
  {
    id: "perdagangan",
    modules: ["trading", "documents"],
    label: "Alur Kontrak & Dokumen Ekspor",
    description: "Kesepakatan, tujuan pengiriman, dan berkas yang diminta pembeli.",
    labelKey: "workflows.perdagangan.label",
    descriptionKey: "workflows.perdagangan.description",
    tone: "neutral",
    steps: [
      {
        label: "Daftarkan Penerima Barang",
        description: "Pihak di pelabuhan tujuan yang menerima kiriman.",
        labelKey: "workflows.perdagangan.steps.penerima.label",
        descriptionKey: "workflows.perdagangan.steps.penerima.description",
        href: "/consignees",
        icon: "Users",
        permission: "consignee.write",
        termKey: "penerima_barang",
      },
      {
        label: "Buat Kontrak",
        description: "Kesepakatan jumlah, harga, dan mata uangnya.",
        labelKey: "workflows.perdagangan.steps.kontrak.label",
        descriptionKey: "workflows.perdagangan.steps.kontrak.description",
        href: "/contracts/new",
        icon: "FileText",
        permission: "contract.write",
        termKey: "kontrak",
      },
      {
        label: "Unggah Dokumen Ekspor",
        description: "B/L, COO, sertifikat fumigasi — disimpan menempel pada kontraknya.",
        labelKey: "workflows.perdagangan.steps.unggah.label",
        descriptionKey: "workflows.perdagangan.steps.unggah.description",
        href: "/documents/upload",
        icon: "Upload",
        permission: "document.write",
      },
      {
        label: "Buka Arsip Dokumen",
        description: "Semua berkas ekspor, dicari dari nomor kontraknya.",
        labelKey: "workflows.perdagangan.steps.arsip.label",
        descriptionKey: "workflows.perdagangan.steps.arsip.description",
        href: "/documents",
        icon: "FolderOpen",
        permission: "document.read",
      },
    ],
  },
  {
    id: "aset",
    modules: ["fixed_assets"],
    label: "Alur Aset Tetap",
    description: "Mendaftar barang bernilai besar dan menyusutkannya tiap bulan.",
    labelKey: "workflows.aset.label",
    descriptionKey: "workflows.aset.description",
    tone: "neutral",
    steps: [
      {
        label: "Siapkan Kategori Aset",
        description: "Kelompok aset beserta umur pakainya — dasar hitungan penyusutan.",
        labelKey: "workflows.aset.steps.kategori.label",
        descriptionKey: "workflows.aset.steps.kategori.description",
        href: "/fixed-assets/categories",
        icon: "Settings",
        permission: "fixed_asset.write",
      },
      {
        label: "Daftarkan Aset",
        description: "Kendaraan, mesin, bangunan — beserta tanggal perolehannya.",
        labelKey: "workflows.aset.steps.daftar.label",
        descriptionKey: "workflows.aset.steps.daftar.description",
        href: "/fixed-assets/new",
        icon: "Building",
        permission: "fixed_asset.write",
        termKey: "aset_tetap",
      },
      {
        label: "Pantau Penyusutan",
        description: "Biaya yang muncul tiap bulan tanpa uang yang keluar.",
        labelKey: "workflows.aset.steps.susut.label",
        descriptionKey: "workflows.aset.steps.susut.description",
        href: "/fixed-assets",
        icon: "BarChart3",
        permission: "fixed_asset.read",
        termKey: "penyusutan",
      },
    ],
  },
  {
    id: "persetujuan",
    modules: ["approvals"],
    label: "Alur Persetujuan",
    description: "Menentukan apa yang perlu izin, lalu memutuskannya.",
    labelKey: "workflows.persetujuan.label",
    descriptionKey: "workflows.persetujuan.description",
    tone: "neutral",
    steps: [
      {
        label: "Atur Aturan Persetujuan",
        description: "Batas nominal dan jenis dokumen yang harus disetujui dulu.",
        labelKey: "workflows.persetujuan.steps.aturan.label",
        descriptionKey: "workflows.persetujuan.steps.aturan.description",
        href: "/approvals/rules",
        icon: "Settings",
        permission: "approval_rule.manage",
      },
      {
        label: "Putuskan yang Menunggu",
        description: "Antrean dokumen yang tertahan sampai Anda memutuskannya.",
        labelKey: "workflows.persetujuan.steps.putuskan.label",
        descriptionKey: "workflows.persetujuan.steps.putuskan.description",
        href: "/approvals",
        icon: "CheckCircle",
        permission: "approval.view",
      },
    ],
  },
  {
    id: "pajak",
    modules: ["tax_id"],
    label: "Alur Pajak",
    description: "Dari faktur penjualan sampai berkas yang diunggah ke DJP.",
    labelKey: "workflows.pajak.label",
    descriptionKey: "workflows.pajak.description",
    tone: "neutral",
    steps: [
      {
        label: "Periksa Faktur Penjualan",
        description: "Pastikan PPN dan identitas pembeli sudah benar sebelum diekspor.",
        labelKey: "workflows.pajak.steps.faktur.label",
        descriptionKey: "workflows.pajak.steps.faktur.description",
        href: "/invoices",
        icon: "Receipt",
        permission: "invoice.read",
        termKey: "ppn",
      },
      {
        label: "Ekspor e-Faktur",
        description: "Berkas untuk diunggah ke aplikasi pajak.",
        labelKey: "workflows.pajak.steps.efaktur.label",
        descriptionKey: "workflows.pajak.steps.efaktur.description",
        href: "/tax/efaktur",
        icon: "FileCheck",
        permission: "tax.read",
        termKey: "efaktur",
      },
    ],
  },
];

/**
 * Modul yang SENGAJA tidak punya alur kerja, beserta sebabnya.
 *
 * Bentuk yang sama dengan `NAV_TANPA_DOKUMEN` (#300) dan untuk sebab yang
 * sama: yang dijaga bukan "semua modul punya panduan" — melainkan bahwa modul
 * baru tidak bisa lahir DIAM-DIAM tanpa keputusan. Dijaga DUA ARAH, jadi entri
 * yang sudah tak berlaku ikut merah.
 *
 * Kosong hari ini, dan itu bukan kebetulan: kekosongan inilah alasan penjaganya
 * ditulis. Modul Manufaktur lahir dengan tiga layar, dokumen, dan izin — lalu
 * tidak muncul di panduan mana pun, dan tidak ada satu tes pun yang berubah
 * warna. Peta ini boleh terisi lagi; yang tidak boleh adalah terisi tanpa ada
 * yang menyadarinya.
 */
export const MODUL_TANPA_ALUR: Readonly<Partial<Record<BusinessModule, string>>> = {};

/** Modul yang diklaim setidaknya satu alur. */
export function modulBeralur(): ReadonlySet<BusinessModule> {
  return new Set(WORKFLOWS.flatMap((wf) => wf.modules));
}

/** Modul tanpa alur DAN tanpa alasan tertulis — yang ditolak penjaga. */
export function modulTanpaPanduan(): BusinessModule[] {
  const ada = modulBeralur();
  return BUSINESS_MODULES.filter((m) => !ada.has(m) && !(m in MODUL_TANPA_ALUR));
}

/**
 * Alur yang relevan bagi pengguna: tiap langkah disaring `allowed` (izin
 * EFEKTIF, issue #73) atau `can()` bawaan bila belum termuat. Alur dengan
 * kurang dari dua langkah tersisa dibuang — panduan urutan hanya bermakna bila
 * ada urutan.
 */
export function visibleWorkflows(
  role: string | null | undefined,
  allowed?: AllowedPermissions
): Workflow[] {
  if (!role) return [];
  const holds = (p: Permission) => (allowed ? allowed.has(p) : can({ role }, p));
  return WORKFLOWS.map((wf) => ({
    ...wf,
    steps: wf.steps.filter((s) => holds(s.permission)),
  })).filter((wf) => wf.steps.length >= 2);
}
