/**
 * Label bahasa tugas untuk matriks izin (issue #73) — TAMPILAN SAJA.
 *
 * Halaman /permissions tidak boleh menampilkan kunci izin mentah
 * (`invoice.write`) sebagai satu-satunya teks (anti-pattern MASTER.md:
 * "nilai enum DB tampil mentah di UI"). Kedua `Record` di bawah bertipe
 * PENUH: izin atau resource baru tanpa label ditolak `tsc` — pola yang sama
 * dengan `CONTRACT_STATUS_LABELS` (issue #68).
 *
 * Modul MURNI (tanpa React/Prisma) — dipakai server & client.
 */

import { PERMISSIONS, type Permission } from "@/lib/authz";

/** `"invoice.write"` → `"invoice"`, diketik dari `Permission` itu sendiri. */
export type PermissionResource = Permission extends `${infer R}.${string}` ? R : never;

export function permissionResource(permission: Permission): PermissionResource {
  return permission.split(".")[0] as PermissionResource;
}

/** Nama kelompok baris di matriks — bahasa menu samping, bukan nama teknis. */
export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  approval: "Persetujuan",
  approval_rule: "Aturan Persetujuan",
  contract: "Kontrak",
  invoice: "Tagihan Penjualan",
  delivery_order: "Surat Jalan",
  receivable: "Pelanggan Belum Bayar (Piutang)",
  return: "Barang Dikembalikan (Retur)",
  customer: "Pelanggan",
  consignee: "Penerima Barang",
  document: "Dokumen Ekspor",
  supplier: "Pemasok",
  payable: "Tagihan Harus Dibayar (Utang)",
  advance: "Uang Muka",
  purchase: "Pencatatan Pembelian",
  cash: "Buku Kas & Bank",
  reconciliation: "Cocokkan Rekening Koran",
  inventory: "Stok Barang",
  fixed_asset: "Barang Milik Perusahaan (Aset Tetap)",
  report: "Laporan",
  budget: "Rencana & Target (Anggaran)",
  tax: "Ekspor e-Faktur",
  account: "Daftar Akun",
  journal: "Catatan Transaksi (Jurnal)",
  ledger: "Rincian per Akun (Buku Besar)",
  period: "Kunci Bulan",
  setup: "Setup & Saldo Awal",
  user: "Pengguna",
  audit: "Jejak Audit",
  company_setting: "Profil Perusahaan",
  authz: "Hak Akses",
  glossary: "Kamus Istilah",
  settings: "Pengaturan",
};

/** Satu kalimat per izin: apa yang BOLEH dilakukan pemegangnya. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "approval.view": "Melihat antrean persetujuan",
  "approval.decide": "Memutus pengajuan (menyetujui / menolak)",
  "approval_rule.manage": "Mengelola aturan ambang & peran penyetuju",

  "contract.read": "Melihat kontrak",
  "contract.write": "Membuat & mengubah kontrak",
  "contract.delete": "Menghapus kontrak",
  "invoice.read": "Melihat tagihan penjualan",
  "invoice.write": "Membuat & mengubah tagihan (termasuk wizard penjualan)",
  "invoice.delete": "Menghapus tagihan penjualan",
  "delivery_order.read": "Melihat surat jalan",
  "delivery_order.write": "Menerbitkan surat jalan",
  "receivable.read": "Melihat daftar pelanggan belum bayar",
  "return.read": "Melihat barang dikembalikan",
  "return.write": "Mencatat retur penjualan / pembelian",
  "customer.read": "Melihat pelanggan",
  "customer.write": "Menambah & mengubah pelanggan",
  "customer.delete": "Menghapus pelanggan",
  "consignee.read": "Melihat penerima barang",
  "consignee.write": "Menambah & mengubah penerima barang",
  "consignee.delete": "Menghapus penerima barang",
  "document.read": "Melihat arsip dokumen ekspor",
  "document.write": "Mengunggah & mengubah dokumen ekspor",

  "supplier.read": "Melihat pemasok",
  "supplier.write": "Menambah & mengubah pemasok",
  "supplier.delete": "Menghapus pemasok",
  "payable.read": "Melihat tagihan harus dibayar",
  "advance.read": "Melihat uang muka",
  "advance.write": "Mencatat & mengalokasikan uang muka",
  "advance.delete": "Membatalkan uang muka",
  "purchase.write": "Mencatat pembelian & transaksi pemasok (termasuk wizard)",
  "purchase.delete": "Menghapus transaksi pemasok",

  "cash.read": "Melihat buku kas & bank",
  "cash.write": "Mencatat uang masuk / keluar",
  "reconciliation.read": "Melihat rekonsiliasi rekening koran",
  "reconciliation.write": "Mengerjakan rekonsiliasi rekening koran",

  "inventory.read": "Melihat stok barang",
  "inventory.write": "Menambah / mengurangi stok & hitung ulang",
  "fixed_asset.read": "Melihat barang milik perusahaan",
  "fixed_asset.write": "Mengelola barang milik perusahaan",

  "report.read": "Membuka Pusat Laporan",
  "report.export": "Mengekspor laporan (PDF / Excel)",
  "budget.manage": "Mengelola rencana & target",
  "tax.read": "Membuka ekspor e-Faktur",

  "account.read": "Melihat daftar akun (pemilih akun di form kas)",
  "account.manage": "Mengelola daftar akun",
  "journal.read": "Melihat catatan transaksi",
  "journal.write": "Menulis jurnal manual",
  "ledger.read": "Melihat rincian per akun",

  "period.manage": "Mengunci & membuka bulan",
  "setup.manage": "Menjalankan setup & saldo awal",
  "user.manage": "Mengelola pengguna & perannya",
  "audit.read": "Melihat jejak audit",
  "company_setting.manage": "Mengubah profil perusahaan",
  "authz.manage": "Mengatur hak akses (halaman ini)",

  "glossary.read": "Membuka kamus istilah",
  "settings.view": "Membuka halaman pengaturan",
};

export interface PermissionGroup {
  resource: PermissionResource;
  label: string;
  permissions: Permission[];
}

/**
 * Kelompok baris matriks, urut sesuai urutan deklarasi `PERMISSION_ROLES` —
 * urutan yang sama dengan seksi berkomentar di authz.ts, jadi halamannya
 * membaca seperti matriksnya.
 */
export function permissionGroups(): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const permission of PERMISSIONS) {
    const resource = permissionResource(permission);
    const last = groups[groups.length - 1];
    if (last && last.resource === resource) {
      last.permissions.push(permission);
    } else {
      groups.push({ resource, label: RESOURCE_LABELS[resource], permissions: [permission] });
    }
  }
  return groups;
}
