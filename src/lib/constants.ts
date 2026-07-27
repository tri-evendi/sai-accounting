/** Nama PRODUK (bukan identitas pelanggan). Aman dipakai langsung di UI. */
export const APP_NAME = "SAI Management";

/**
 * ⚠️ NILAI CADANGAN — JANGAN dipakai langsung untuk menampilkan/mencetak.
 *
 * Identitas perusahaan yang benar tinggal di tabel `CompanySetting` (diisi
 * wizard setup, issue #20). Dua konstanta di bawah hanya dipakai saat:
 *   • wizard belum dijalankan (baris `CompanySetting` belum ada), atau
 *   • basis data tak terjangkau, atau
 *   • sebagai nilai awal yang mengisi form wizard.
 *
 * Untuk menampilkan atau mencetak, ambil dari:
 *   • server  → `getCompanyIdentity()`  (`@/lib/company-identity`)
 *   • client  → `useCompanyIdentity()`  (`@/lib/company-identity-client`)
 *
 * Memakainya langsung berarti dokumen yang dikirim ke pelanggan mencetak nama
 * pemasang pertama, bukan nama perusahaan pemakainya. Penjaga
 * `tests/company-identity.test.ts` menolak impor baru di luar daftar yang sah.
 */
export const COMPANY_NAME = "PT Subur Anugerah Indonesia";
export const COMPANY_ADDRESS = "Komplek Pergudangan Kapuk Ecopark, Jakarta";

/** Kunci peran SISTEM bawaan (tak bisa dihapus/dinonaktifkan). Dipakai guard
 *  di kode: anti-lockout, default Mode Akuntan, dsb. Peran lain kini DATA
 *  (tabel `roles`, migration 0031) dan dibaca lewat `@/lib/roles`. */
export const ROLES = {
  BOS: "bos",
  CORE: "core",
  PTG: "ptg",
} as const;

/**
 * Peran kini DATA (tabel `roles`), bukan enum tetap — maka tipenya `string`
 * agar peran kustom yang dibuat Pimpinan tetap valid. `ROLES`/`ROLE_VALUES`
 * adalah peran SISTEM bawaan; `ROLE_LABELS` fallback labelnya.
 */
export type Role = string;

/**
 * Tuple nilai peran SISTEM untuk `z.enum` fallback & seed. Validasi peran user
 * yang mengizinkan peran kustom kini lewat `@/lib/roles` (cek ke DB), bukan
 * hanya tuple ini.
 */
export const ROLE_VALUES = [ROLES.BOS, ROLES.CORE, ROLES.PTG] as const;

/** Peran SISTEM bawaan sebagai tipe union — dipakai peta label bertipe penuh. */
export type SystemRole = (typeof ROLE_VALUES)[number];

/**
 * Label peran SISTEM (fallback tampilan). Peran kustom ambil label dari DB.
 *
 * Peta di berkas ini adalah label BAHASA INDONESIA — bahasa sumber aplikasi.
 * Versi yang mengikuti pilihan bahasa pengguna ada di `src/lib/i18n/labels.ts`
 * (`roleLabels`, `contractStatusLabels`, …) dan membaca teksnya dari kamus;
 * `tests/i18n.test.ts` menjaga agar isi kamus `id` PERSIS sama dengan peta di
 * sini, jadi keduanya tak bisa menyimpang diam-diam.
 *
 * Tetap `Record<string, string>` (bukan `Record<SystemRole, string>`): peran
 * kini DATA, dan titik pakainya mencari label untuk peran kustom juga.
 */
export const ROLE_LABELS: Record<string, string> = {
  bos: "Pimpinan",
  core: "Staf Kantor",
  ptg: "Bagian Gudang (PTG)",
};

export const CURRENCIES = ["USD", "CNY", "IDR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CONTRACT_STATUSES = ["signed", "pending", "canceled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/**
 * Label status dokumen dalam bahasa tugas (issue #1). Nilai yang disimpan di
 * database TIDAK berubah (`signed` / `pending` / `canceled`) — ini murni lapisan
 * tampilan untuk badge dan tombol saringan.
 */
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  signed: "Sah",
  pending: "Menunggu",
  canceled: "Dibatalkan",
};

/** Label untuk tombol saringan, termasuk pilihan "semua". */
export const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "Semua",
  ...CONTRACT_STATUS_LABELS,
};

export const DOCUMENT_TYPES = ["bl", "invoice", "coo", "fumigation", "contract", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Label jenis dokumen ekspor dalam bahasa tugas (issue #68). Nilai DB tidak
 * berubah — satu sumber untuk pilihan form unggah DAN kolom "Jenis" di daftar
 * dokumen, supaya nilai mentah ("bl", "coo") tak pernah tampil di layar.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  bl: "Bill of Lading (B/L)",
  invoice: "Tagihan (Invoice)",
  coo: "Surat Keterangan Asal (COO)",
  fumigation: "Sertifikat Fumigasi",
  contract: "Kontrak",
  other: "Lainnya",
};

export const CASH_TYPES = ["bank", "kas_besar", "kas_kecil"] as const;
export type CashType = (typeof CASH_TYPES)[number];

export const CASH_TYPE_LABELS: Record<CashType, string> = {
  bank: "Bank",
  kas_besar: "Kas Besar",
  kas_kecil: "Kas Kecil",
};

/** Items at or below this quantity (same unit as stock) are flagged as low stock. */
export const LOW_STOCK_THRESHOLD = 100;
