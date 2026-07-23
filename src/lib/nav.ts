/**
 * Navigasi berbasis tugas (issue #2).
 *
 * Menu tidak lagi berupa daftar modul yang datar dan sebagian berbahasa Inggris,
 * melainkan dikelompokkan menurut pekerjaan sehari-hari: Penjualan, Pembelian,
 * Kas & Bank, Stok, Laporan, Bantuan & Pengaturan. Labelnya memakai bahasa tugas dari
 * `src/lib/labels.ts` (issue #1), sehingga menu, kamus istilah, dan tooltip
 * memakai kata yang sama persis.
 *
 * Modul ini MURNI: tanpa React/ikon/Prisma. Ikon disebut sebagai NAMA (string)
 * lalu dipetakan ke komponen `lucide-react` di sidebar — pola yang sama dengan
 * `src/lib/report-catalog.ts`. Karena murni, penyaringan peran + Mode Akuntan
 * bisa diuji langsung di `tests/quick-actions.test.ts`.
 *
 * Penyaringan di sini bersifat TAMPILAN. Otorisasi sebenarnya tetap dilakukan
 * server-side oleh `requirePagePermission` (lihat docs/RBAC.md) pada tiap
 * halaman — menyembunyikan menu saja tidak pernah dianggap pengamanan.
 */

import type { Role } from "@/lib/constants";
import { effectiveAccountantMode, type AccountantModeUser } from "@/lib/accountant-mode";
import type { TermKey } from "@/lib/labels";

export interface NavItem {
  href: string;
  /** Label bahasa tugas (bukan nama modul teknis). */
  label: string;
  /** Nama ikon lucide-react; dipetakan ke komponen di sidebar. */
  icon: string;
  roles: Role[];
  /** Permukaan akuntansi yang disembunyikan saat Mode Akuntan OFF (issue #11). */
  accountingOnly?: boolean;
  /** Entri kamus istilah yang menjelaskan menu ini (issue #21). */
  termKey?: TermKey;
}

export interface NavGroup {
  id: string;
  /** Nama area tugas, mis. "Penjualan". */
  label: string;
  items: NavItem[];
}

/** Beranda berdiri sendiri di atas semua kelompok. */
export const NAV_HOME: NavItem = {
  href: "/dashboard",
  label: "Beranda",
  icon: "LayoutDashboard",
  roles: ["bos", "core", "ptg"],
};

export const NAV_GROUPS: NavGroup[] = [
  // ── issue #25 — Persetujuan. Kelompoknya berdiri di atas alur dokumen karena
  // antrean ini menahan pekerjaan orang lain: menunda keputusan berarti jurnal
  // dokumen tertahan. Antreannya terbuka untuk semua peran (penyetuju melihat
  // yang harus ia putuskan, pemohon melihat kabar pengajuannya); aturan ambang
  // & peran bos-only, permukaan kebijakan seperti Kunci Bulan.
  {
    id: "persetujuan",
    label: "Persetujuan",
    items: [
      {
        href: "/approvals",
        label: "Perlu Persetujuan",
        icon: "ClipboardCheck",
        roles: ["bos", "core", "ptg"],
      },
      {
        href: "/approvals/rules",
        label: "Aturan Persetujuan",
        icon: "ShieldCheck",
        roles: ["bos"],
      },
    ],
  },
  {
    id: "penjualan",
    label: "Penjualan",
    items: [
      // Wizard terpandu (issue #5) berdiri paling atas: sebelumnya hanya bisa
      // dijangkau dari Aksi Cepat beranda, sehingga dari halaman lain pengguna
      // awam justru tersasar ke formulir polos. Menu = pintu utama, wizard =
      // jalan utama.
      { href: "/sales/new", label: "Catat Penjualan", icon: "SquarePen", roles: ["bos", "core"], termKey: "faktur" },
      { href: "/contracts", label: "Kontrak", icon: "FileText", roles: ["bos", "core"], termKey: "kontrak" },
      { href: "/invoices", label: "Tagihan Penjualan", icon: "Receipt", roles: ["bos", "core"], termKey: "faktur" },
      // issue #14 — Surat Jalan mengurangi stok saat terbit, tetapi alurnya milik
      // penjualan (barang keluar untuk pembeli), jadi tempatnya di sini.
      { href: "/delivery-orders", label: "Surat Jalan", icon: "PackageCheck", roles: ["bos", "core"], termKey: "surat_jalan" },
      // Arsip dokumen ekspor (B/L, COO, fumigasi) menyertai kontrak & surat
      // jalan — ini pekerjaan penjualan, bukan pengaturan aplikasi.
      { href: "/documents", label: "Dokumen", icon: "Upload", roles: ["bos", "core"] },
      { href: "/receivables", label: "Pelanggan Belum Bayar", icon: "HandCoins", roles: ["bos", "core"], termKey: "piutang" },
      // Retur mencakup retur penjualan & pembelian; ditaruh di satu tempat agar
      // tidak muncul dua kali di menu.
      { href: "/returns", label: "Barang Dikembalikan", icon: "Undo2", roles: ["bos", "core"], termKey: "retur" },
      { href: "/customers", label: "Pelanggan", icon: "Users", roles: ["bos", "core"], termKey: "pelanggan" },
      { href: "/consignees", label: "Penerima Barang", icon: "Ship", roles: ["bos", "core"], termKey: "penerima_barang" },
    ],
  },
  {
    id: "pembelian",
    label: "Pembelian",
    items: [
      // Kembaran "Catat Penjualan" di atas — alasannya sama (issue #5).
      { href: "/purchases/new", label: "Catat Pembelian", icon: "ShoppingCart", roles: ["bos", "core"], termKey: "pembelian" },
      { href: "/suppliers", label: "Pemasok", icon: "Truck", roles: ["bos", "core"], termKey: "pemasok" },
      { href: "/payables", label: "Tagihan Harus Dibayar", icon: "Wallet", roles: ["bos", "core"], termKey: "utang" },
      { href: "/advances", label: "Uang Muka", icon: "Coins", roles: ["bos", "core"], termKey: "uang_muka" },
    ],
  },
  {
    id: "kas",
    label: "Kas & Bank",
    items: [
      // "Buku Kas & Bank", bukan "Kas & Bank": label item tidak boleh kembar
      // dengan label kelompoknya (lihat penjaga di tests/quick-actions.test.ts).
      { href: "/finance", label: "Buku Kas & Bank", icon: "DollarSign", roles: ["bos", "core"], termKey: "kas_bank" },
      { href: "/reconciliation", label: "Cocokkan Rekening Koran", icon: "Scale", roles: ["bos", "core"], termKey: "rekonsiliasi_bank" },
    ],
  },
  {
    id: "stok",
    label: "Stok & Aset",
    items: [
      { href: "/inventory", label: "Stok Barang", icon: "Package", roles: ["bos", "core", "ptg"], termKey: "persediaan" },
      { href: "/inventory/update", label: "Tambah / Kurangi Stok", icon: "PackagePlus", roles: ["bos", "core", "ptg"], termKey: "persediaan" },
      { href: "/inventory/opname", label: "Hitung Ulang Stok", icon: "ClipboardCheck", roles: ["bos", "core", "ptg"], termKey: "stok_opname" },
      { href: "/fixed-assets", label: "Barang Milik Perusahaan", icon: "Building2", roles: ["bos", "core"], termKey: "aset_tetap" },
    ],
  },
  {
    id: "laporan",
    label: "Laporan",
    items: [
      // issue #19 — Pusat Laporan adalah pintu masuk semua laporan.
      { href: "/reports", label: "Pusat Laporan", icon: "BarChart3", roles: ["bos"] },
      { href: "/budget", label: "Rencana & Target", icon: "Target", roles: ["bos"], termKey: "anggaran" },
      { href: "/tax/efaktur", label: "Ekspor e-Faktur", icon: "FileSpreadsheet", roles: ["bos"], termKey: "efaktur" },
      { href: "/journal", label: "Catatan Transaksi", icon: "BookText", roles: ["bos"], accountingOnly: true, termKey: "jurnal" },
      { href: "/ledger", label: "Rincian per Akun", icon: "Library", roles: ["bos"], accountingOnly: true, termKey: "buku_besar" },
      { href: "/accounts", label: "Daftar Akun", icon: "BookOpen", roles: ["bos"], accountingOnly: true, termKey: "akun_perkiraan" },
    ],
  },
  // Label grup ≠ label item mana pun di dalamnya ("Pengaturan" berisi
  // "Pengaturan" membingungkan); "Bantuan & Pengaturan" juga jujur untuk ptg
  // yang di sini hanya melihat Kamus Istilah + Pengaturan.
  {
    id: "pengaturan",
    label: "Bantuan & Pengaturan",
    items: [
      { href: "/glossary", label: "Kamus Istilah", icon: "BookMarked", roles: ["bos", "core", "ptg"] },
      { href: "/periods", label: "Kunci Bulan", icon: "Lock", roles: ["bos"], termKey: "tutup_periode" },
      { href: "/setup", label: "Setup & Saldo Awal", icon: "Wand2", roles: ["bos"], termKey: "saldo_awal" },
      { href: "/users", label: "Pengguna", icon: "UserCog", roles: ["bos"] },
      { href: "/settings", label: "Pengaturan", icon: "Settings", roles: ["bos", "core", "ptg"] },
    ],
  },
];

/** Boleh dilihat? Peran cocok DAN (bukan permukaan akuntansi ATAU Mode Akuntan ON). */
export function isNavItemVisible(item: NavItem, user: AccountantModeUser): boolean {
  if (!item.roles.includes(user.role as Role)) return false;
  if (item.accountingOnly && !effectiveAccountantMode(user)) return false;
  return true;
}

/** Kelompok menu yang boleh dilihat pengguna; kelompok tanpa isi ikut hilang. */
export function visibleNavGroups(user: AccountantModeUser): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item, user)),
  })).filter((group) => group.items.length > 0);
}

/** Semua href yang terlihat (termasuk Beranda) — dipakai untuk menandai menu aktif. */
export function visibleNavHrefs(user: AccountantModeUser): string[] {
  const hrefs = isNavItemVisible(NAV_HOME, user) ? [NAV_HOME.href] : [];
  for (const group of visibleNavGroups(user)) {
    for (const item of group.items) hrefs.push(item.href);
  }
  return hrefs;
}

/**
 * Menu mana yang harus disorot untuk sebuah URL.
 *
 * Kecocokan TERPANJANG yang menang, supaya `/inventory/opname` menyorot
 * "Hitung Ulang Stok" dan bukan juga "Stok Barang" — masalah yang muncul saat
 * satu kelompok berisi menu yang saling berawalan sama.
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}
