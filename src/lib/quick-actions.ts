/**
 * Panel "Aksi Cepat" (issue #2) — enam pekerjaan yang paling sering dilakukan,
 * masing-masing satu klik dari beranda ke formulirnya.
 *
 * Modul ini MURNI (tanpa React/ikon/Prisma) sehingga penyaringan peran bisa
 * diuji langsung (`tests/quick-actions.test.ts`) dan dipanggil dari SERVER
 * component beranda: daftar aksi disusun di server dari `session.user.role`,
 * jadi tombol yang tidak boleh dipakai peran tersebut memang tidak pernah
 * dikirim ke browser — bukan sekadar disembunyikan dengan CSS.
 *
 * Penyaringan ini tetap TAMPILAN saja; setiap halaman tujuan punya penjaga
 * server-nya sendiri (`requirePageSession`), jadi peran yang mengetik URL
 * langsung tetap ditolak di sana.
 */

import type { Role } from "@/lib/constants";
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
  roles: Role[];
  tone: QuickActionTone;
  /** Entri kamus istilah yang menjelaskan pekerjaan ini (issue #21). */
  termKey?: TermKey;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "catat_penjualan",
    label: "Catat Penjualan",
    description: "Buat tagihan untuk pelanggan atas barang yang dijual.",
    href: "/invoices/new",
    icon: "Receipt",
    roles: ["bos", "core"],
    tone: "in",
    termKey: "faktur",
  },
  {
    key: "catat_pembelian",
    label: "Catat Pembelian",
    description: "Pilih pemasok, lalu catat barang yang dibeli beserta nilainya.",
    href: "/suppliers",
    icon: "ShoppingCart",
    roles: ["bos", "core"],
    tone: "out",
    termKey: "pembelian",
  },
  {
    key: "terima_uang",
    label: "Terima Uang",
    description: "Catat uang yang masuk ke kas atau rekening bank.",
    href: "/finance/new?arah=masuk",
    icon: "ArrowDownLeft",
    roles: ["bos", "core"],
    tone: "in",
    termKey: "kas_bank",
  },
  {
    key: "bayar",
    label: "Bayar",
    description: "Catat uang yang keluar dari kas atau rekening bank.",
    href: "/finance/new?arah=keluar",
    icon: "ArrowUpRight",
    roles: ["bos", "core"],
    tone: "out",
    termKey: "kas_bank",
  },
  {
    key: "tambah_stok",
    label: "Tambah Stok",
    description: "Catat barang masuk atau keluar gudang.",
    href: "/inventory/update",
    icon: "PackagePlus",
    roles: ["bos", "core", "ptg"],
    tone: "stock",
    termKey: "persediaan",
  },
  {
    key: "buat_kontrak",
    label: "Buat Kontrak",
    description: "Catat kesepakatan penjualan sebelum barang dikirim.",
    href: "/contracts/new",
    icon: "FileText",
    roles: ["bos", "core"],
    tone: "neutral",
    termKey: "kontrak",
  },
];

/**
 * Aksi cepat yang boleh dipakai sebuah peran, urut seperti daftar di atas.
 * Peran tak dikenal (atau kosong) tidak mendapat aksi apa pun.
 */
export function quickActionsForRole(role: string | null | undefined): QuickAction[] {
  if (!role) return [];
  return QUICK_ACTIONS.filter((action) => action.roles.includes(role as Role));
}
