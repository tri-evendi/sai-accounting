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
 * `src/lib/report-catalog.ts`. Karena murni, penyaringan izin + Mode Akuntan
 * bisa diuji langsung di `tests/quick-actions.test.ts`.
 *
 * Sejak issue #73 tiap item mendeklarasikan IZIN halamannya (izin yang sama
 * dengan `requirePagePermission` halaman itu), bukan daftar peran — daftar
 * peran di luar matriks dilarang AGENTS.md. Penyaringan memakai `can()`
 * (matriks bawaan) sebagai fallback, dan menerima set izin EFEKTIF milik
 * pengguna (dari `/api/user/permissions`) supaya menu mengikuti override.
 *
 * Penyaringan di sini bersifat TAMPILAN. Otorisasi sebenarnya tetap dilakukan
 * server-side oleh `requirePagePermission` (lihat docs/RBAC.md) pada tiap
 * halaman — menyembunyikan menu saja tidak pernah dianggap pengamanan.
 */

import { can, type Permission } from "@/lib/authz";
import { effectiveAccountantMode, type AccountantModeUser } from "@/lib/accountant-mode";
import type { TermKey } from "@/lib/labels";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export interface NavItem {
  href: string;
  /**
   * Label bahasa tugas (bukan nama modul teknis) dalam bahasa SUMBER
   * (Indonesia). Yang digambar sidebar adalah `labelKey`; `label` tetap ada
   * karena modul ini murni & teruji — penjaga menu (mis. "label kelompok tidak
   * boleh kembar dengan label itemnya") membaca teks, bukan kunci.
   */
  label: string;
  /**
   * Kunci kamus untuk label yang sama (`nav.items.*`). Kunci bertipe
   * `DictionaryKey`, jadi salah ketik ditolak `tsc`; `tests/i18n.test.ts`
   * memastikan nilai kamus `id` PERSIS sama dengan `label` di atas.
   */
  labelKey: DictionaryKey;
  /** Nama ikon lucide-react; dipetakan ke komponen di sidebar. */
  icon: string;
  /**
   * Izin halaman tujuannya — SAMA dengan yang dideklarasikan
   * `requirePagePermission` di halaman itu. Tanpa izin (hanya Beranda) =
   * tampil untuk semua pengguna terautentikasi.
   */
  permission?: Permission;
  /** Permukaan akuntansi yang disembunyikan saat Mode Akuntan OFF (issue #11). */
  accountingOnly?: boolean;
  /** Entri kamus istilah yang menjelaskan menu ini (issue #21). */
  termKey?: TermKey;
}

export interface NavGroup {
  id: string;
  /** Nama area tugas dalam bahasa sumber, mis. "Penjualan". */
  label: string;
  /** Kunci kamus untuk nama area tugas (`nav.groups.*`). */
  labelKey: DictionaryKey;
  items: NavItem[];
}

/**
 * Set izin EFEKTIF milik pengguna (issue #73). Bila tersedia, penyaringan
 * memakainya; bila tidak (belum termuat), jatuh ke `can()` matriks bawaan.
 */
export type AllowedPermissions = ReadonlySet<string>;

/** Beranda berdiri sendiri di atas semua kelompok. */
export const NAV_HOME: NavItem = {
  href: "/dashboard",
  label: "Beranda",
  labelKey: "nav.items.dashboard",
  icon: "LayoutDashboard",
};

export const NAV_GROUPS: NavGroup[] = [
  // ── issue #25 — Persetujuan. Kelompoknya berdiri di atas alur dokumen karena
  // antrean ini menahan pekerjaan orang lain: menunda keputusan berarti jurnal
  // dokumen tertahan. Antreannya terbuka untuk semua peran (penyetuju melihat
  // yang harus ia putuskan, pemohon melihat kabar pengajuannya); aturan ambang
  // & peran khusus akses penuh, permukaan kebijakan seperti Kunci Bulan.
  {
    id: "persetujuan",
    label: "Persetujuan",
    labelKey: "nav.groups.approvals",
    items: [
      {
        href: "/approvals",
        label: "Perlu Persetujuan",
        labelKey: "nav.items.approvals",
        icon: "ClipboardCheck",
        permission: "approval.view",
      },
      {
        href: "/approvals/rules",
        label: "Aturan Persetujuan",
        labelKey: "nav.items.approvalRules",
        icon: "ShieldCheck",
        permission: "approval_rule.manage",
      },
    ],
  },
  {
    id: "penjualan",
    label: "Penjualan",
    labelKey: "nav.groups.sales",
    items: [
      // Wizard terpandu (issue #5) berdiri paling atas: sebelumnya hanya bisa
      // dijangkau dari Aksi Cepat beranda, sehingga dari halaman lain pengguna
      // awam justru tersasar ke formulir polos. Menu = pintu utama, wizard =
      // jalan utama.
      { href: "/sales/new", label: "Catat Penjualan", labelKey: "nav.items.recordSale", icon: "SquarePen", permission: "invoice.write", termKey: "faktur" },
      { href: "/contracts", label: "Kontrak", labelKey: "nav.items.contracts", icon: "FileText", permission: "contract.read", termKey: "kontrak" },
      { href: "/invoices", label: "Tagihan Penjualan", labelKey: "nav.items.invoices", icon: "Receipt", permission: "invoice.read", termKey: "faktur" },
      // issue #14 — Surat Jalan mengurangi stok saat terbit, tetapi alurnya milik
      // penjualan (barang keluar untuk pembeli), jadi tempatnya di sini.
      { href: "/delivery-orders", label: "Surat Jalan", labelKey: "nav.items.deliveryOrders", icon: "PackageCheck", permission: "delivery_order.read", termKey: "surat_jalan" },
      // Arsip dokumen ekspor (B/L, COO, fumigasi) menyertai kontrak & surat
      // jalan — ini pekerjaan penjualan, bukan pengaturan aplikasi.
      { href: "/documents", label: "Dokumen", labelKey: "nav.items.documents", icon: "Upload", permission: "document.read" },
      { href: "/receivables", label: "Pelanggan Belum Bayar", labelKey: "nav.items.receivables", icon: "HandCoins", permission: "receivable.read", termKey: "piutang" },
      // Retur mencakup retur penjualan & pembelian; ditaruh di satu tempat agar
      // tidak muncul dua kali di menu.
      { href: "/returns", label: "Barang Dikembalikan", labelKey: "nav.items.returns", icon: "Undo2", permission: "return.read", termKey: "retur" },
      { href: "/customers", label: "Pelanggan", labelKey: "nav.items.customers", icon: "Users", permission: "customer.read", termKey: "pelanggan" },
      { href: "/consignees", label: "Penerima Barang", labelKey: "nav.items.consignees", icon: "Ship", permission: "consignee.read", termKey: "penerima_barang" },
    ],
  },
  {
    id: "pembelian",
    label: "Pembelian",
    labelKey: "nav.groups.purchasing",
    items: [
      // Kembaran "Catat Penjualan" di atas — alasannya sama (issue #5).
      { href: "/purchases/new", label: "Catat Pembelian", labelKey: "nav.items.recordPurchase", icon: "ShoppingCart", permission: "purchase.write", termKey: "pembelian" },
      { href: "/suppliers", label: "Pemasok", labelKey: "nav.items.suppliers", icon: "Truck", permission: "supplier.read", termKey: "pemasok" },
      { href: "/payables", label: "Tagihan Harus Dibayar", labelKey: "nav.items.payables", icon: "Wallet", permission: "payable.read", termKey: "utang" },
      { href: "/advances", label: "Uang Muka", labelKey: "nav.items.advances", icon: "Coins", permission: "advance.read", termKey: "uang_muka" },
    ],
  },
  {
    id: "kas",
    label: "Kas & Bank",
    labelKey: "nav.groups.cash",
    items: [
      // "Buku Kas & Bank", bukan "Kas & Bank": label item tidak boleh kembar
      // dengan label kelompoknya (lihat penjaga di tests/quick-actions.test.ts).
      { href: "/finance", label: "Buku Kas & Bank", labelKey: "nav.items.cashBook", icon: "DollarSign", permission: "cash.read", termKey: "kas_bank" },
      { href: "/reconciliation", label: "Cocokkan Rekening Koran", labelKey: "nav.items.reconciliation", icon: "Scale", permission: "reconciliation.read", termKey: "rekonsiliasi_bank" },
    ],
  },
  {
    id: "stok",
    label: "Stok & Aset",
    labelKey: "nav.groups.inventory",
    items: [
      { href: "/inventory", label: "Stok Barang", labelKey: "nav.items.inventory", icon: "Package", permission: "inventory.read", termKey: "persediaan" },
      { href: "/inventory/update", label: "Tambah / Kurangi Stok", labelKey: "nav.items.inventoryUpdate", icon: "PackagePlus", permission: "inventory.write", termKey: "persediaan" },
      { href: "/inventory/opname", label: "Hitung Ulang Stok", labelKey: "nav.items.inventoryOpname", icon: "ClipboardCheck", permission: "inventory.write", termKey: "stok_opname" },
      { href: "/fixed-assets", label: "Barang Milik Perusahaan", labelKey: "nav.items.fixedAssets", icon: "Building2", permission: "fixed_asset.read", termKey: "aset_tetap" },
    ],
  },
  {
    id: "laporan",
    label: "Laporan",
    labelKey: "nav.groups.reports",
    items: [
      // issue #19 — Pusat Laporan adalah pintu masuk semua laporan.
      { href: "/reports", label: "Pusat Laporan", labelKey: "nav.items.reports", icon: "BarChart3", permission: "report.read" },
      { href: "/budget", label: "Rencana & Target", labelKey: "nav.items.budget", icon: "Target", permission: "budget.manage", termKey: "anggaran" },
      { href: "/tax/efaktur", label: "Ekspor e-Faktur", labelKey: "nav.items.efaktur", icon: "FileSpreadsheet", permission: "tax.read", termKey: "efaktur" },
      { href: "/journal", label: "Catatan Transaksi", labelKey: "nav.items.journal", icon: "BookText", permission: "journal.read", accountingOnly: true, termKey: "jurnal" },
      { href: "/ledger", label: "Rincian per Akun", labelKey: "nav.items.ledger", icon: "Library", permission: "ledger.read", accountingOnly: true, termKey: "buku_besar" },
      { href: "/accounts", label: "Daftar Akun", labelKey: "nav.items.accounts", icon: "BookOpen", permission: "account.manage", accountingOnly: true, termKey: "akun_perkiraan" },
      // issue #91 — master dimensi pusat biaya. SENGAJA tanpa `accountingOnly`:
      // pusat biaya ditetapkan pada dokumen sehari-hari (faktur, kas,
      // pembelian), bukan hanya dibaca akuntan, jadi menyembunyikannya saat
      // Mode Akuntan mati berarti menyembunyikan satu-satunya pintu untuk
      // menyusun daftar yang dipakai form-form itu.
      { href: "/cost-centers", label: "Pusat Biaya", labelKey: "nav.items.costCenters", icon: "Split", permission: "cost_center.manage" },
    ],
  },
  // Label grup ≠ label item mana pun di dalamnya ("Pengaturan" berisi
  // "Pengaturan" membingungkan); "Bantuan & Pengaturan" juga jujur untuk
  // Kepala Gudang
  // yang di sini hanya melihat Kamus Istilah + Pengaturan.
  {
    id: "pengaturan",
    label: "Bantuan & Pengaturan",
    labelKey: "nav.groups.settings",
    items: [
      { href: "/glossary", label: "Kamus Istilah", labelKey: "nav.items.glossary", icon: "BookMarked", permission: "glossary.read" },
      { href: "/periods", label: "Kunci Bulan", labelKey: "nav.items.periods", icon: "Lock", permission: "period.manage", termKey: "tutup_periode" },
      { href: "/setup", label: "Setup & Saldo Awal", labelKey: "nav.items.setup", icon: "Wand2", permission: "setup.manage", termKey: "saldo_awal" },
      { href: "/users", label: "Pengguna", labelKey: "nav.items.users", icon: "UserCog", permission: "user.manage" },
      // issue #73 — matriks izin dikonfigurasi dari sini; anti-lockout menjamin
      // peran berakses penuh tidak pernah kehilangan pintunya sendiri.
      { href: "/permissions", label: "Hak Akses", labelKey: "nav.items.permissions", icon: "KeyRound", permission: "authz.manage" },
      // issue #104 — menambah PT baru dulu menuntut akses SSH ke server; kini
      // ia berdiri di tempat orang yang berwenang memang sudah berada.
      { href: "/companies/new", label: "Tambah Perusahaan", labelKey: "nav.items.companyNew", icon: "Building2", permission: "company.create" },
      { href: "/settings", label: "Pengaturan", labelKey: "nav.items.settings", icon: "Settings", permission: "settings.view" },
    ],
  },
];

/**
 * Pemegang keputusan "boleh lihat menu ini?": set izin efektif bila sudah
 * termuat (issue #73), selainnya `can()` matriks bawaan. Item tanpa izin
 * (Beranda) tampil untuk siapa pun yang punya peran.
 */
function holdsPermission(
  user: AccountantModeUser,
  permission: Permission | undefined,
  allowed?: AllowedPermissions
): boolean {
  if (!user.role) return false;
  if (!permission) return true;
  if (allowed) return allowed.has(permission);
  return can({ role: user.role }, permission);
}

/** Boleh dilihat? Izin cocok DAN (bukan permukaan akuntansi ATAU Mode Akuntan ON). */
export function isNavItemVisible(
  item: NavItem,
  user: AccountantModeUser,
  allowed?: AllowedPermissions
): boolean {
  if (!holdsPermission(user, item.permission, allowed)) return false;
  if (item.accountingOnly && !effectiveAccountantMode(user)) return false;
  return true;
}

/** Kelompok menu yang boleh dilihat pengguna; kelompok tanpa isi ikut hilang. */
export function visibleNavGroups(
  user: AccountantModeUser,
  allowed?: AllowedPermissions
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item, user, allowed)),
  })).filter((group) => group.items.length > 0);
}

/** Semua href yang terlihat (termasuk Beranda) — dipakai untuk menandai menu aktif. */
export function visibleNavHrefs(
  user: AccountantModeUser,
  allowed?: AllowedPermissions
): string[] {
  const hrefs = isNavItemVisible(NAV_HOME, user, allowed) ? [NAV_HOME.href] : [];
  for (const group of visibleNavGroups(user, allowed)) {
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
