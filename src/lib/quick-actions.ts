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

/**
 * Arah uang untuk aksi tersebut — dipakai untuk ikon + LABEL teks
 * ("Uang masuk" / "Uang keluar"), tidak pernah warna saja.
 */
export type QuickActionTone = "in" | "out" | "stock" | "neutral";

export interface QuickAction {
  key: string;
  /** Kalimat perintah dalam bahasa tugas, mis. "Catat Penjualan". */
  label: string;
  /** Satu baris penjelas: kapan tombol ini dipakai. */
  description: string;
  href: string;
  /** Nama ikon lucide-react; dipetakan ke komponen di panelnya. */
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
