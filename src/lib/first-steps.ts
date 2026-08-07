/**
 * "Langkah Pertama" — daftar tugas untuk perusahaan yang bukunya baru dibuka.
 *
 * ── Kenapa ini bukan Aksi Cepat atau Alur Kerja ─────────────────────────────
 *
 * `quick-actions.ts` menjawab "apa yang paling sering saya kerjakan" dan
 * `workflows.ts` menjawab "urutan mengerjakannya". Keduanya memakai satu asumsi
 * yang belum berlaku pada hari pertama: bahwa DATA POKOKNYA sudah ada. "Catat
 * Penjualan" pada perusahaan tanpa satu pun pelanggan bukan pintasan, melainkan
 * jalan buntu — wizardnya membuka pemilih pelanggan yang kosong.
 *
 * Daftar ini karena itu berumur pendek dengan sengaja: ia menempati beranda
 * hanya selama perusahaan belum punya transaksi, lalu menghilang untuk
 * selamanya. Nilainya bukan sebagai menu permanen, melainkan sebagai jawaban
 * atas satu pertanyaan yang hanya ditanyakan sekali — "saya baru selesai
 * menyiapkan, sekarang apa?" — yang sampai audit ini dijawab oleh dasbor penuh
 * angka nol.
 *
 * MURNI (tanpa React/ikon/Prisma) seperti `nav.ts` / `quick-actions.ts` /
 * `workflows.ts`: ikon disebut sebagai NAMA string, penyaringan izinnya bisa
 * diuji langsung, dan penyusunannya terjadi di SERVER sehingga langkah yang
 * tidak boleh dikerjakan seseorang tidak pernah dikirim ke browsernya.
 *
 * TAMPILAN saja — tiap halaman tujuan tetap dijaga `requirePagePermission`.
 */

import { can, type Permission } from "@/lib/authz";
import type { AllowedPermissions } from "@/lib/nav";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export type FirstStepKey =
  | "pelanggan"
  | "pemasok"
  | "stok_awal"
  | "penjualan"
  | "terima_uang";

export interface FirstStep {
  key: FirstStepKey;
  /**
   * Perintah bahasa tugas (bahasa SUMBER), mis. "Tambah Pelanggan". Panelnya
   * menggambar `labelKey`; teks ini tetap ada karena modul ini murni & teruji
   * — pola yang sama dengan `QUICK_ACTIONS`.
   */
  label: string;
  /** Satu baris: kenapa langkah ini lebih dulu (bahasa sumber). */
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
}

/**
 * Urutannya bukan selera: tiap langkah menyiapkan bahan bagi langkah
 * sesudahnya. Pelanggan & pemasok dulu (keduanya dipilih dari daftar di
 * formulir transaksi), lalu stok awal, baru transaksi pertama, baru uangnya.
 */
export const FIRST_STEPS: FirstStep[] = [
  {
    key: "pelanggan",
    label: "Tambah Pelanggan",
    description: "Siapa yang membeli dari Anda. Dipilih saat mencatat penjualan.",
    labelKey: "firstSteps.items.pelanggan.label",
    descriptionKey: "firstSteps.items.pelanggan.description",
    href: "/customers/new",
    icon: "Users",
    permission: "customer.write",
  },
  {
    key: "pemasok",
    label: "Tambah Pemasok",
    description: "Dari siapa Anda membeli. Dipilih saat mencatat pembelian.",
    labelKey: "firstSteps.items.pemasok.label",
    descriptionKey: "firstSteps.items.pemasok.description",
    href: "/suppliers/new",
    icon: "Truck",
    permission: "supplier.write",
  },
  {
    key: "stok_awal",
    label: "Catat Stok Awal",
    description: "Barang yang sudah ada di gudang sebelum hari ini.",
    labelKey: "firstSteps.items.stok_awal.label",
    descriptionKey: "firstSteps.items.stok_awal.description",
    href: "/inventory/update",
    icon: "PackagePlus",
    permission: "inventory.write",
  },
  {
    key: "penjualan",
    label: "Catat Penjualan Pertama",
    description: "Dipandu: pelanggan → barang → surat jalan → faktur.",
    labelKey: "firstSteps.items.penjualan.label",
    descriptionKey: "firstSteps.items.penjualan.description",
    href: "/sales/new",
    icon: "Receipt",
    permission: "invoice.write",
  },
  {
    key: "terima_uang",
    label: "Terima Pembayaran Pertama",
    description: "Catat uang yang masuk ke kas atau rekening bank.",
    labelKey: "firstSteps.items.terima_uang.label",
    descriptionKey: "firstSteps.items.terima_uang.description",
    href: "/finance/new?arah=masuk",
    icon: "ArrowDownLeft",
    permission: "cash.write",
  },
];

/** Sudah-atau-belum tiap langkah, dihitung dari data perusahaan. */
export type FirstStepProgress = Partial<Record<FirstStepKey, boolean>>;

/**
 * Langkah yang boleh dikerjakan pengguna ini, urut seperti daftar di atas.
 *
 * `allowed` adalah set izin EFEKTIF (bawaan + override DB + modul usaha yang
 * aktif), jadi satu penyaringan menutup ketiganya sekaligus: perusahaan jasa
 * yang mematikan modul gudang tidak pernah diminta "Catat Stok Awal", dan staf
 * yang tak boleh menyentuh kas tidak diminta menerima pembayaran.
 */
export function visibleFirstSteps(
  role: string | null | undefined,
  allowed?: AllowedPermissions
): FirstStep[] {
  if (!role) return [];
  return FIRST_STEPS.filter((step) =>
    allowed ? allowed.has(step.permission) : can({ role }, step.permission)
  );
}

/**
 * Apakah panel Langkah Pertama masih perlu ditampilkan.
 *
 * Ambangnya sengaja "belum ada TRANSAKSI", bukan "belum semua langkah
 * tercentang": daftar ini adalah sambutan, bukan tugas yang harus dituntaskan.
 * Begitu perusahaan mulai bekerja, beranda kembali menjadi beranda — meski
 * masih ada satu langkah yang dilewati karena memang tidak dipakai (mis.
 * pemasok pada perusahaan yang hanya menjual jasa).
 */
export function isFirstRun(progress: FirstStepProgress): boolean {
  return !progress.penjualan && !progress.terima_uang && !progress.stok_awal;
}
