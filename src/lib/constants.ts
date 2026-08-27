/**
 * Nama PRODUK (bukan identitas pelanggan). Aman dipakai langsung di UI.
 *
 * "Accounting", bukan "Management": nama lama menyebut kontrak & stok — dua
 * modul dari sekian — sementara yang dijaga aplikasi ini adalah buku besarnya.
 * `design-system/sai-accounting/MASTER.md` sudah menamainya begitu sejak awal;
 * konstanta inilah yang tertinggal.
 */
export const APP_NAME = "SAI Accounting";

/**
 * Versi aplikasi, diambil dari `package.json` saat build (lihat `env` di
 * `next.config.ts`). Aman dipakai di server maupun client.
 *
 * Cadangannya `0.0.0` dan itu disengaja: sebuah nomor yang jelas TIDAK MUNGKIN
 * benar lebih berguna daripada nomor masuk akal yang kebetulan salah. Kalau
 * ini yang muncul di layar, yang rusak adalah injeksinya — bukan rilisnya.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

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
 *  (tabel `roles`, migration 0031) dan dibaca lewat `@/lib/roles`.
 *
 *  Kuncinya adalah nama jabatan baku dalam Bahasa Inggris `snake_case`
 *  (migration 0032) — konvensi nilai enum-like docs/DATABASE.md. Singkatan
 *  internal lama (`bos`, `core`, `ptg`) tidak ada lagi, baik di DB maupun kode. */
export const ROLES = {
  MANAGING_DIRECTOR: "managing_director",
  FINANCE_MANAGER: "finance_manager",
  WAREHOUSE_HEAD: "warehouse_head",
  ADMINISTRATOR: "administrator",
} as const;

/**
 * Peran kini DATA (tabel `roles`), bukan enum tetap — maka tipenya `string`
 * agar peran kustom yang dibuat Direktur Utama tetap valid. `ROLES`/`ROLE_VALUES`
 * adalah peran SISTEM bawaan; `ROLE_LABELS` fallback labelnya.
 */
export type Role = string;

/**
 * Tuple nilai peran SISTEM untuk `z.enum` fallback & seed. Validasi peran user
 * yang mengizinkan peran kustom kini lewat `@/lib/roles` (cek ke DB), bukan
 * hanya tuple ini.
 *
 * URUTANNYA BERMAKNA: `applyOverrides` menyusun matriks efektif dengan
 * `ROLE_VALUES.filter(...)`, jadi urutan di sini = urutan kolom peran yang
 * terlihat di /permissions. Sengaja sama dengan urutan baris tabel `roles`
 * (tiga peran migration 0031, lalu `administrator` migration 0032).
 */
export const ROLE_VALUES = [
  ROLES.MANAGING_DIRECTOR,
  ROLES.FINANCE_MANAGER,
  ROLES.WAREHOUSE_HEAD,
  ROLES.ADMINISTRATOR,
] as const;

/**
 * Peran berakses PENUH — memegang SETIAP izin di `PERMISSION_ROLES`.
 *
 * `administrator` sengaja dibuat kembar dengan `managing_director` (keputusan
 * pemilik sistem, migration 0032): harus selalu ada DUA jalan masuk yang
 * berdiri sendiri untuk mengelola pengguna & hak akses, supaya satu akun yang
 * hilang tak pernah mengunci seluruh perusahaan. Konsekuensinya pemisahan tugas
 * memang ditukar dengan ketahanan; jejaknya tetap terbaca karena catatan audit
 * menyimpan peran aktor.
 *
 * SATU sumber untuk semua tempat yang berarti "peran berakses penuh": matriks
 * izin (`authz.ts`), bawaan Mode Akuntan (`accountant-mode.ts`), dan jalan
 * pintas ajukan-ulang persetujuan.
 */
export const FULL_ACCESS_ROLES = [ROLES.MANAGING_DIRECTOR, ROLES.ADMINISTRATOR] as const;

/** Apakah peran ini salah satu peran berakses penuh? Deny-by-default: peran
 *  kosong/tak dikenal selalu `false`. */
export function isFullAccessRole(role: string | null | undefined): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

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
  managing_director: "Direktur Utama",
  finance_manager: "Manajer Keuangan",
  warehouse_head: "Kepala Gudang",
  administrator: "Administrator Sistem",
};

/**
 * ── Multi-tenant (issue #134, epik #133) ─────────────────────────────────────
 *
 * Status TENANT (pelanggan platform) di `tenants.status` basis data kendali.
 * Enum-like docs/DATABASE.md: `String @db.VarChar` di skema + daftar nilai di
 * SATU tempat (di sini) yang dipakai z.enum, skrip adopsi, dan penjaga.
 */
export const TENANT_STATUSES = [
  "pending_verification",
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/**
 * Peran TINGKAT TENANT (`tenant_memberships.role`) — menjawab "boleh membuat
 * perusahaan? boleh menyentuh penagihan?", pertanyaan yang harus terjawab TANPA
 * perusahaan aktif. BUKAN peran akuntansi: peran per-PT tetap milik
 * `memberships` dan `ROLES` di atas, dan keduanya tidak pernah dicampur.
 *
 * Matriks izinnya di `src/lib/tenant-authz.ts` (issue #135):
 *   owner  — semuanya, termasuk penagihan; minimal satu per tenant,
 *            yang terakhir tidak bisa dihapus (anti-lockout)
 *   admin  — buat perusahaan, undang orang; TANPA penagihan
 *   member — tidak ada izin tenant; aksesnya murni dari keanggotaan per-PT
 */
export const TENANT_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export const TENANT_ROLE_VALUES = [
  TENANT_ROLES.OWNER,
  TENANT_ROLES.ADMIN,
  TENANT_ROLES.MEMBER,
] as const;
export type TenantRole = (typeof TENANT_ROLE_VALUES)[number];

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

/*
 * Urutannya mengikuti ALUR EKSPOR, bukan abjad (issue #511): kontrak lahir
 * lebih dulu, packing list disusun saat memuat, PEB diurus sebelum berangkat,
 * B/L terbit dari pelayaran, COO & fumigasi menyusul, invoice menutupnya.
 * Pengguna memilih sambil menyusun berkasnya — daftar yang urut abjad memaksa
 * ia mencari, daftar yang urut alur cukup diikuti.
 */
export const DOCUMENT_TYPES = [
  "contract",
  "packing_list",
  "peb",
  "bl",
  "coo",
  "fumigation",
  "invoice",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Label jenis dokumen ekspor dalam bahasa tugas (issue #68). Nilai DB tidak
 * berubah — satu sumber untuk pilihan form unggah DAN kolom "Jenis" di daftar
 * dokumen, supaya nilai mentah ("bl", "coo") tak pernah tampil di layar.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  contract: "Kontrak",
  packing_list: "Packing List",
  peb: "Pemberitahuan Ekspor Barang (PEB)",
  bl: "Bill of Lading (B/L)",
  coo: "Surat Keterangan Asal (COO)",
  fumigation: "Sertifikat Fumigasi",
  invoice: "Tagihan (Invoice)",
  other: "Lainnya",
};

/**
 * Nilai `stock_movements.type` yang SAH TERSIMPAN (issue #111).
 *
 * Sengaja BUKAN daftar yang sama dengan yang boleh DIBUAT lewat formulir —
 * `stockUpdateSchema` hanya menerima `in`/`out`. `process` datang dari data
 * legacy: barang yang diserahkan untuk disortir/diolah dan MASIH milik
 * perusahaan (306 baris; kolom penangannya berisi nama orang dan 'DONE
 * PROSES'). Karena barangnya masih ada, ia tidak menambah maupun mengurangi
 * saldo — ia hanya tercatat. Menambahkannya ke formulir adalah keputusan
 * produk yang berbeda, dan bukan bagian dari #111.
 *
 * Gunanya daftar ini: satu sumber kebenaran yang dipakai penjaga impor
 * (`canonicalStockType` di `legacy-values.ts`) dan tampilan, supaya nilai yang
 * tidak dikenal DITOLAK saat masuk alih-alih diam-diam menjadi angka yang
 * salah.
 */
/*
 * `cost_adjust` (issue #495 butir 1) — penyesuaian NILAI tanpa kuantitas.
 *
 * Ia bukan barang masuk dan bukan barang keluar: saldo tidak bergerak sedikit
 * pun. Yang berubah hanya nilai persediaan, ketika biaya impor yang datang
 * belakangan (bea masuk, freight forwarder) menempel pada barang yang masih di
 * gudang. Perlakuannya karena itu SAMA dengan `process`: setiap penjumlah saldo
 * menyebut `in` dan `out` secara eksplisit, dan yang bukan keduanya tidak
 * dihitung — bukan jatuh ke `else` yang mengurangi.
 */
export const STOCK_MOVEMENT_TYPES = ["in", "out", "process", "cost_adjust"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export function isStockMovementType(value: string): value is StockMovementType {
  return (STOCK_MOVEMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Penanda gerakan stok yang lahir dari hitung ulang stok (issue #129).
 *
 * Gerakan opname tidak punya tabel sendiri — ia ditulis sebagai `stock_movement`
 * biasa, dan SATU-SATUNYA yang membedakannya dari penambahan/pengurangan manual
 * adalah catatan ini. Karena itulah ia menjadi konstanta: route yang MENULISnya
 * dan pembaca riwayat yang MENCARInya harus memakai teks yang sama persis, dan
 * dua salinan literal yang menyimpang akan membuat riwayat opname kosong tanpa
 * satu pun galat.
 *
 * NILAINYA TIDAK BOLEH DIUBAH. Baris produksi yang sudah ada membawa teks ini
 * apa adanya; menggantinya akan memutus seluruh riwayat yang sudah tercatat.
 */
export const OPNAME_ADJUSTMENT_NOTE = "Penyesuaian stok opname";

/**
 * Penanda gerakan stok yang lahir dari HASIL PROSES (issue #490).
 *
 * Alasannya sama persis dengan `OPNAME_ADJUSTMENT_NOTE`, dan pola ini memang
 * disalin darinya: susut proses ditulis sebagai gerakan `out` BIASA — sebab
 * stoknya memang berkurang seperti pengeluaran lain — dan satu-satunya yang
 * membedakannya dari pengeluaran manual adalah catatan ini.
 *
 * Kenapa bukan nilai `type` baru: `type` adalah dasar SELURUH aritmetika saldo
 * (`calculateStockTotals`, Kartu Stok, nilai persediaan). Nilai baru di sana
 * berarti setiap penjumlahan harus diajari mengenalnya, dan yang terlewat tidak
 * bersuara — ia hanya menghasilkan saldo yang salah. `out` yang bertanda
 * membuat saldonya benar sejak baris pertama; yang berbeda hanya JURNALnya,
 * dan itu ditentukan `sourceType` saat memposting (pola `stock_adjustment`).
 */
export const PROCESS_SHRINKAGE_NOTE = "Susut hasil proses";

export const CASH_TYPES = ["bank", "kas_besar", "kas_kecil"] as const;
export type CashType = (typeof CASH_TYPES)[number];

export const CASH_TYPE_LABELS: Record<CashType, string> = {
  bank: "Bank",
  kas_besar: "Kas Besar",
  kas_kecil: "Kas Kecil",
};

/**
 * Kunci kamus label kas/bank — DITULIS UTUH, bukan dirangkai `cashType.${v}`.
 *
 * Bentuk yang dirangkai lolos `tsc` tetapi membuat kuncinya tak terlihat oleh
 * pemindai kunci yatim (`tests/i18n-orphan-keys.test.ts`): kunci yang dihapus
 * dari kamus tidak akan ketahuan, dan kunci yang tak terpakai tidak bisa
 * dibersihkan. Satu peta di sini membuat ketiganya terbaca mesin, dan tetap
 * satu sumber untuk semua pemakainya.
 */
export const CASH_TYPE_KEYS = {
  bank: "cashType.bank",
  kas_besar: "cashType.kas_besar",
  kas_kecil: "cashType.kas_kecil",
} as const satisfies Record<CashType, string>;

/** Items at or below this quantity (same unit as stock) are flagged as low stock. */
export const LOW_STOCK_THRESHOLD = 100;
