/**
 * Panel "Aksi Cepat" (issue #2) — enam pekerjaan yang paling sering dilakukan,
 * masing-masing satu klik dari beranda ke formulirnya.
 *
 * Modul ini MURNI (tanpa React/ikon/Prisma) sehingga penyaringannya bisa
 * diuji langsung (`tests/quick-actions.test.ts`) dan dipanggil dari SERVER
 * component beranda: daftar aksi disusun di server dari `session.user.role`,
 * jadi tombol yang tidak boleh dipakai peran tersebut memang tidak pernah
 * dikirim ke browser — bukan sekadar disembunyikan dengan CSS.
 *
 * Sejak issue #73 tiap aksi mendeklarasikan IZIN halaman tujuannya (bukan
 * daftar peran — dilarang di luar matriks, AGENTS.md), dan beranda meneruskan
 * set izin EFEKTIF (bawaan + override DB) supaya panel mengikuti konfigurasi.
 *
 * Penyaringan ini tetap TAMPILAN saja; setiap halaman tujuan punya penjaga
 * server-nya sendiri (`requirePagePermission`), jadi peran yang mengetik URL
 * langsung tetap ditolak di sana.
 */

import { can, type Permission } from "@/lib/authz";
import type { TermKey } from "@/lib/labels";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Arah uang untuk aksi tersebut — dipakai untuk ikon + LABEL teks
 * ("Uang masuk" / "Uang keluar"), tidak pernah warna saja.
 */
export type QuickActionTone = "in" | "out" | "stock" | "neutral";

export interface QuickAction {
  key: string;
  /**
   * Kalimat perintah dalam bahasa tugas (bahasa SUMBER), mis. "Catat Penjualan".
   * Panelnya menggambar `labelKey`; teks ini tetap ada karena modul ini murni &
   * teruji — penjaga di `tests/quick-actions.test.ts` memeriksa teksnya.
   */
  label: string;
  /** Satu baris penjelas dalam bahasa sumber: kapan tombol ini dipakai. */
  description: string;
  /** Kunci kamus untuk `label` (`quickActions.items.*.label`). */
  labelKey: DictionaryKey;
  /** Kunci kamus untuk `description` (`quickActions.items.*.description`). */
  descriptionKey: DictionaryKey;
  href: string;
  /** Nama ikon (kunci peta `ICONS` di panelnya); dipetakan ke komponen di sana. */
  icon: string;
  /** Izin halaman tujuannya — sama dengan `requirePagePermission` di sana. */
  permission: Permission;
  tone: QuickActionTone;
  /** Entri kamus istilah yang menjelaskan pekerjaan ini (issue #21). */
  termKey?: TermKey;
}

export const QUICK_ACTIONS: QuickAction[] = [
  // Sejak issue #5 kedua aksi ini menuju WIZARD terpandu, bukan formulir polos.
  // Wizard-nya memandu pelanggan/pemasok → barang → pengiriman → tagihan dalam
  // satu alur, dan tidak menyimpan apa pun sampai langkah terakhir — jadi
  // pengguna baru tidak bisa tersesat di tengah dan meninggalkan dokumen
  // setengah jadi. Formulir per dokumen tetap ada bagi yang sudah hafal alurnya.
  {
    key: "catat_penjualan",
    label: "Catat Penjualan",
    description: "Dipandu: pilih pelanggan, isi barang, lalu buat tagihannya.",
    labelKey: "quickActions.items.catat_penjualan.label",
    descriptionKey: "quickActions.items.catat_penjualan.description",
    href: "/sales/new",
    icon: "Receipt",
    permission: "invoice.write",
    tone: "in",
    termKey: "faktur",
  },
  {
    key: "catat_pembelian",
    label: "Catat Pembelian",
    description: "Dipandu: pilih pemasok, isi barang yang dibeli, lalu catat utangnya.",
    labelKey: "quickActions.items.catat_pembelian.label",
    descriptionKey: "quickActions.items.catat_pembelian.description",
    href: "/purchases/new",
    icon: "ShoppingCart",
    permission: "purchase.write",
    tone: "out",
    termKey: "pembelian",
  },
  {
    key: "terima_uang",
    label: "Terima Uang",
    description: "Catat uang yang masuk ke kas atau rekening bank.",
    labelKey: "quickActions.items.terima_uang.label",
    descriptionKey: "quickActions.items.terima_uang.description",
    href: "/finance/new?arah=masuk",
    icon: "ArrowDownLeft",
    permission: "cash.write",
    tone: "in",
    termKey: "kas_bank",
  },
  {
    key: "bayar",
    label: "Bayar",
    description: "Catat uang yang keluar dari kas atau rekening bank.",
    labelKey: "quickActions.items.bayar.label",
    descriptionKey: "quickActions.items.bayar.description",
    href: "/finance/new?arah=keluar",
    icon: "ArrowUpRight",
    permission: "cash.write",
    tone: "out",
    termKey: "kas_bank",
  },
  {
    key: "tambah_stok",
    label: "Tambah Stok",
    description: "Catat barang masuk atau keluar gudang.",
    labelKey: "quickActions.items.tambah_stok.label",
    descriptionKey: "quickActions.items.tambah_stok.description",
    href: "/inventory/update",
    icon: "PackagePlus",
    permission: "inventory.write",
    tone: "stock",
    termKey: "persediaan",
  },
  {
    key: "buat_kontrak",
    label: "Buat Kontrak",
    description: "Catat kesepakatan penjualan sebelum barang dikirim.",
    labelKey: "quickActions.items.buat_kontrak.label",
    descriptionKey: "quickActions.items.buat_kontrak.description",
    href: "/contracts/new",
    icon: "FileText",
    permission: "contract.write",
    tone: "neutral",
    termKey: "kontrak",
  },
];

/**
 * Aksi cepat yang boleh dipakai sebuah peran, urut seperti daftar di atas.
 * Peran tak dikenal (atau kosong) tidak mendapat aksi apa pun. `allowed`
 * (set izin EFEKTIF, issue #73) menang bila diberikan; tanpa itu jatuh ke
 * `can()` matriks bawaan.
 */
export function quickActionsForRole(
  role: string | null | undefined,
  allowed?: ReadonlySet<string>
): QuickAction[] {
  if (!role) return [];
  return QUICK_ACTIONS.filter((action) =>
    allowed ? allowed.has(action.permission) : can({ role }, action.permission)
  );
}
