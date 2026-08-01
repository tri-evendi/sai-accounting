/**
 * Modul per kategori usaha (issue #99) — bagian MURNI.
 *
 * Aplikasi ini punya 33 sumber daya izin, dan sebagian besar hanya masuk akal
 * untuk perdagangan komoditas. Perusahaan jasa atau agensi melihat separuh menu
 * yang tak pernah mereka pakai — dan tiap menu yang tak terpakai adalah beban
 * belajar bagi pengguna yang memang bukan akuntan. Modul menyusutkan permukaan
 * itu: satu kategori usaha dipilih saat penyiapan, modul yang tak relevan tidak
 * pernah muncul lagi.
 *
 * Modul BUKAN sistem otorisasi baru. Ia lapisan KETIGA pada rakitan yang sudah
 * ada (bawaan → override peran → override pengguna → **modul**), dan seperti
 * dua lapisan sebelumnya, logika murninya hidup di sini sementara sambungan
 * Prisma-nya cuma ada di `authz-effective.ts`.
 *
 * ══ TIGA ATURAN YANG TIDAK BOLEH DILANGGAR ═══════════════════════════════════
 *
 * 1. **Modul TIDAK PERNAH menggerbangi buku besar.** Perusahaan yang pernah
 *    memposting jurnal dari kontrak lalu mematikan modul `trading` tetap
 *    memiliki jurnal itu, dan setiap laporan tetap rekonsiliasi. Yang
 *    digerbangi hanya ANTARMUKA dan PEMBUATAN transaksi baru — tak pernah data
 *    historis, tak pernah total laporan. Karena itu tak satu pun modul
 *    pelaporan/posting (`lib/reports.ts`, `lib/ledger.ts`, `lib/posting/*`)
 *    boleh mengimpor berkas ini; penjaganya
 *    `tests/business-modules-ledger.test.ts`.
 *
 * 2. **Izin ≠ modul.** "Anda tidak punya akses" (peran) dan "fitur ini belum
 *    aktif untuk perusahaan Anda" (modul) adalah dua kalimat berbeda untuk dua
 *    keadaan berbeda. Mematikan modul TIDAK menyentuh satu baris pun di
 *    `role_permission_overrides`/`user_permission_overrides`; menyalakannya
 *    kembali karena itu tidak pernah menghadiahkan izin kepada siapa pun — ia
 *    hanya membuat yang sudah dimiliki terjangkau lagi.
 *
 * 3. **Anti-lockout tetap berlaku.** `core_accounting` selalu aktif dan tidak
 *    bisa dimatikan — di dalamnya ada `authz.manage` & `user.manage`, dua pintu
 *    yang tanpanya tak ada lagi yang bisa memperbaiki konfigurasi. Penegakannya
 *    di server (`validateEnabledModules` + `normalizeEnabledModules`), bukan
 *    sekadar checkbox yang di-`disabled` di layar.
 *
 * ══ KASAR, BUKAN HALUS ══════════════════════════════════════════════════════
 * Sepuluh modul untuk 33 sumber daya. Kendali per-peran (#73) dan per-pengguna
 * (#75) sudah ada untuk hal yang lebih rinci; modul yang terlalu halus hanya
 * jadi labirin konfigurasi.
 */

import { PERMISSIONS, type Permission } from "@/lib/authz";
import { EFFECTIVE_MATRIX_TTL_MS } from "@/lib/authz-overrides";
import { permissionResource, type PermissionResource } from "@/lib/authz-labels";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Semua modul. Urutannya adalah urutan tampil di layar DAN urutan penyimpanan
 * (lihat `serializeEnabledModules`), jadi nilai tersimpan selalu deterministik.
 */
export const BUSINESS_MODULES = [
  "core_accounting",
  "sales",
  "purchasing",
  "trading",
  "inventory",
  "cash_bank",
  "fixed_assets",
  "approvals",
  "tax_id",
  "documents",
] as const;

export type BusinessModule = (typeof BUSINESS_MODULES)[number];

/** Modul inti — selalu aktif, tak bisa dimatikan (anti-lockout). */
export const CORE_MODULE: BusinessModule = "core_accounting";

const MODULE_SET: ReadonlySet<string> = new Set(BUSINESS_MODULES);

export const isBusinessModule = (value: string): value is BusinessModule =>
  MODULE_SET.has(value);

/**
 * Sumber daya izin → modul. **Inilah struktur terpenting fitur ini**: `Record`
 * bertipe PENUH atas `PermissionResource` (diturunkan dari `Permission` itu
 * sendiri), jadi sumber daya izin baru yang belum diberi modul ditolak `tsc` —
 * bukan diam-diam lolos ke dalam "modul yang tidak ada" dan hilang dari menu.
 * Pola yang sama dengan `RESOURCE_LABELS` (issue #68/#73).
 *
 * Setiap sumber daya milik TEPAT SATU modul: bentuk `Record` yang menjaminnya.
 */
export const RESOURCE_MODULE: Record<PermissionResource, BusinessModule> = {
  // ── core_accounting — permukaan yang membuat aplikasi ini aplikasi akuntansi.
  // Setiap perusahaan memilikinya, apa pun bidangnya; dan di sinilah dua pintu
  // anti-lockout (`authz`, `user`) tinggal.
  // (`company.create` tidak lagi punya modul: sejak issue #135 ia izin TENANT
  // — modul adalah konfigurasi SEBUAH perusahaan, dan membuat perusahaan baru
  // justru terjadi sebelum ada perusahaan yang konfigurasinya bisa ditanya.)
  account: "core_accounting",
  cost_center: "core_accounting",
  journal: "core_accounting",
  ledger: "core_accounting",
  period: "core_accounting",
  report: "core_accounting",
  budget: "core_accounting",
  audit: "core_accounting",
  settings: "core_accounting",
  setup: "core_accounting",
  company_setting: "core_accounting",
  authz: "core_accounting",
  user: "core_accounting",
  // Kamus istilah menjelaskan istilah akuntansi kepada pengguna awam — bantuan,
  // bukan fitur bisnis. Ia ikut inti supaya tak pernah bisa hilang.
  glossary: "core_accounting",

  // ── sales — menjual ke pelanggan & menagihnya.
  invoice: "sales",
  customer: "sales",
  receivable: "sales",

  // ── purchasing — membeli dari pemasok & membayarnya.
  supplier: "purchasing",
  purchase: "purchasing",
  payable: "purchasing",
  // Uang muka ada DI SINI, bukan di `trading`. Rancangan awal #99 menaruhnya
  // bersama kontrak karena di SAI uang muka memang menyertai kontrak komoditas
  // — tapi membayar di muka ke pemasok adalah praktik PEMBELIAN yang lumrah,
  // bukan ciri perdagangan berjangka. Perusahaan jasa atau distribusi yang
  // mematikan `trading` tetap membayar uang muka; ikut menghilangkannya akan
  // memaksa mereka mencatat pembayaran itu sebagai sesuatu yang bukan dirinya.
  advance: "purchasing",

  // ── trading — lapisan khas perdagangan barang (issue #99 menyebutnya
  // "lapisan khas komoditas"): kontrak jual-beli berjangka, surat jalan,
  // penerima barang di pelabuhan tujuan, dan retur fisik. Perusahaan jasa
  // mematikan ini dan setengah menu hilang.
  contract: "trading",
  delivery_order: "trading",
  consignee: "trading",
  return: "trading",

  // ── inventory — stok barang.
  inventory: "inventory",

  // ── cash_bank — buku kas/bank + pencocokan rekening koran.
  cash: "cash_bank",
  reconciliation: "cash_bank",

  // ── fixed_assets — aset tetap & penyusutannya.
  fixed_asset: "fixed_assets",

  // ── approvals — antrean & aturan persetujuan.
  approval: "approvals",
  approval_rule: "approvals",

  // ── tax_id — kewajiban pajak khas Indonesia (ekspor e-Faktur/CTAS).
  tax: "tax_id",

  // ── documents — arsip dokumen ekspor (B/L, COO, fumigasi).
  document: "documents",
};

/** Modul pemilik sebuah izin. */
export function moduleForPermission(permission: Permission): BusinessModule {
  return RESOURCE_MODULE[permissionResource(permission)];
}

/** Semua modul aktif — nilai bawaan pemasangan yang belum pernah memilih. */
export const ALL_MODULES: ReadonlySet<BusinessModule> = new Set(BUSINESS_MODULES);

/** Modul yang tidak bisa dimatikan. Sengaja fungsi: penjaga, bukan gaya. */
export const isCoreModule = (module: BusinessModule): boolean => module === CORE_MODULE;

/**
 * Teks tiap modul. Sengaja hanya KUNCI kamus (bukan literal Indonesia): modul
 * hanya pernah tampil lewat `t()`, jadi satu tempat untuk penerjemah dan tak
 * ada dua sumber teks yang bisa menyimpang. Kunci bertipe `DictionaryKey`, jadi
 * salah ketik ditolak `tsc` (pola `nav.ts`), dan `Record` penuh berarti modul
 * baru tanpa teks juga ditolak `tsc`.
 */
export interface BusinessModuleMeta {
  labelKey: DictionaryKey;
  descriptionKey: DictionaryKey;
  /**
   * Frasa TUGAS yang sangat pendek — "kontrak berjangka, surat jalan, penerima
   * barang", bukan nama modulnya (issue #103). Dipakai kartu preset kategori
   * untuk menyebut apa yang dinyalakan DAN dimatikan sebuah pilihan, dalam
   * bahasa pekerjaan seperti yang dituntut MASTER.md. Terpisah dari
   * `descriptionKey` karena panjangnya beda peran: deskripsi menjelaskan satu
   * modul, frasa ini harus bisa dirangkai bersama delapan lainnya dalam satu
   * kalimat yang masih terbaca.
   */
  taskKey: DictionaryKey;
}

export const MODULE_META: Record<BusinessModule, BusinessModuleMeta> = {
  core_accounting: {
    labelKey: "modules.name.core_accounting",
    descriptionKey: "modules.description.core_accounting",
    taskKey: "modules.task.core_accounting",
  },
  sales: { labelKey: "modules.name.sales", descriptionKey: "modules.description.sales", taskKey: "modules.task.sales" },
  purchasing: {
    labelKey: "modules.name.purchasing",
    descriptionKey: "modules.description.purchasing",
    taskKey: "modules.task.purchasing",
  },
  trading: { labelKey: "modules.name.trading", descriptionKey: "modules.description.trading", taskKey: "modules.task.trading" },
  inventory: {
    labelKey: "modules.name.inventory",
    descriptionKey: "modules.description.inventory",
    taskKey: "modules.task.inventory",
  },
  cash_bank: {
    labelKey: "modules.name.cash_bank",
    descriptionKey: "modules.description.cash_bank",
    taskKey: "modules.task.cash_bank",
  },
  fixed_assets: {
    labelKey: "modules.name.fixed_assets",
    descriptionKey: "modules.description.fixed_assets",
    taskKey: "modules.task.fixed_assets",
  },
  approvals: {
    labelKey: "modules.name.approvals",
    descriptionKey: "modules.description.approvals",
    taskKey: "modules.task.approvals",
  },
  tax_id: { labelKey: "modules.name.tax_id", descriptionKey: "modules.description.tax_id", taskKey: "modules.task.tax_id" },
  documents: {
    labelKey: "modules.name.documents",
    descriptionKey: "modules.description.documents",
    taskKey: "modules.task.documents",
  },
};

// ─── Kategori usaha (preset) ────────────────────────────────────────────────

/**
 * Kategori usaha yang bisa dipilih di wizard penyiapan. Preset hanyalah NILAI
 * AWAL: setelah setup, tiap modul tetap bisa dinyalakan/dimatikan satu per satu
 * dari Pengaturan. Karena itu kategori TIDAK PERNAH dibaca saat menegakkan
 * otorisasi — yang berlaku selalu himpunan modul, bukan kategorinya.
 */
export const BUSINESS_CATEGORIES = [
  "commodity_trading",
  "distribution",
  "services",
  "custom",
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const isBusinessCategory = (value: string): value is BusinessCategory =>
  (BUSINESS_CATEGORIES as readonly string[]).includes(value);

/** Modul awal per kategori. Inti tidak perlu ditulis — selalu ditambahkan. */
export const CATEGORY_MODULES: Record<BusinessCategory, readonly BusinessModule[]> = {
  // Perdagangan komoditas / ekspor (SAI sendiri): semuanya dipakai.
  commodity_trading: BUSINESS_MODULES,
  // Distributor / grosir: jual-beli barang bergudang, tanpa kontrak berjangka,
  // surat jalan ekspor, maupun arsip dokumen pelabuhan.
  distribution: [
    "sales",
    "purchasing",
    "inventory",
    "cash_bank",
    "fixed_assets",
    "approvals",
    "tax_id",
  ],
  // Jasa / agensi: tak ada barang sama sekali — tanpa stok, tanpa lapisan dagang.
  services: ["sales", "purchasing", "cash_bank", "fixed_assets", "approvals", "tax_id"],
  /*
   * Pilih sendiri: mulai MINIMAL — hanya inti — lalu nyalakan yang dipakai.
   *
   * Dulu ia mulai dari semua menyala. Bedanya bukan sekadar arah: bagan akun
   * kini mengikuti modul yang aktif (`coaTemplateFor`), jadi "semua menyala"
   * berarti perusahaan yang belum tahu bentuk usahanya langsung mendapat
   * SELURUH akun — persediaan, HPP, aset tetap, pajak — lalu harus menghapus
   * yang tak dipakai. Mematikan modul tidak menghapus akun (akun yang pernah
   * dipakai adalah dasar angka yang sudah terbit), jadi arah opt-out
   * meninggalkan sisa yang tidak bisa dibersihkan.
   *
   * Menyalakan modul kemudian AMAN dan lengkap: akunnya ikut lahir saat itu
   * juga (lihat `api/company-settings/modules`).
   */
  custom: [],
};

export const CATEGORY_META: Record<
  BusinessCategory,
  { labelKey: DictionaryKey; descriptionKey: DictionaryKey }
> = {
  commodity_trading: {
    labelKey: "modules.category.commodity_trading",
    descriptionKey: "modules.categoryDesc.commodity_trading",
  },
  distribution: {
    labelKey: "modules.category.distribution",
    descriptionKey: "modules.categoryDesc.distribution",
  },
  services: {
    labelKey: "modules.category.services",
    descriptionKey: "modules.categoryDesc.services",
  },
  custom: { labelKey: "modules.category.custom", descriptionKey: "modules.categoryDesc.custom" },
};

/** Modul awal sebuah kategori (inti selalu ikut). */
export function modulesForCategory(category: BusinessCategory): BusinessModule[] {
  return normalizeEnabledModules(CATEGORY_MODULES[category]);
}

// ─── Penyimpanan: satu kolom, "kosong = semua aktif" ────────────────────────

/**
 * Baca nilai kolom `company_settings.enabled_modules`.
 *
 * **NULL / kosong berarti SEMUA modul aktif** — bukan "tidak ada modul". Itulah
 * yang membuat fitur ini mendarat tanpa backfill dan tanpa satu pun perubahan
 * perilaku pada pemasangan yang sudah berjalan: kolom baru yang NULL = aplikasi
 * persis seperti kemarin.
 *
 * Token yang tak dikenal kode DIABAIKAN (sisa data setelah sebuah modul dihapus
 * dari kode tidak boleh menghidupkan apa pun). Bila setelah penyaringan tak ada
 * satu pun token yang dikenal, jawabannya SEMUA aktif, bukan "hanya inti":
 * nilai rusak tidak boleh menyembunyikan seluruh aplikasi.
 *
 * Inti selalu ditambahkan, apa pun isi kolomnya.
 */
export function parseEnabledModules(raw: string | null | undefined): ReadonlySet<BusinessModule> {
  if (raw == null || raw.trim() === "") return ALL_MODULES;
  const known = raw
    .split(",")
    .map((token) => token.trim())
    .filter(isBusinessModule);
  if (known.length === 0) return ALL_MODULES;
  return new Set<BusinessModule>([CORE_MODULE, ...known]);
}

/**
 * Nilai yang disimpan untuk sebuah himpunan modul. Himpunan yang berisi SEMUA
 * modul disimpan sebagai NULL, bukan daftar lengkap: "kosong = semua" tetap
 * jujur, dan modul yang ditambahkan ke kode di kemudian hari ikut menyala
 * sendiri untuk perusahaan yang memang tidak pernah mematikan apa pun.
 */
export function serializeEnabledModules(
  modules: Iterable<BusinessModule>
): string | null {
  const normalized = normalizeEnabledModules(modules);
  if (normalized.length === BUSINESS_MODULES.length) return null;
  return normalized.join(",");
}

/** Urut deklarasi, tanpa kembar, inti selalu ikut. */
export function normalizeEnabledModules(modules: Iterable<BusinessModule>): BusinessModule[] {
  const set = new Set<BusinessModule>(modules);
  set.add(CORE_MODULE);
  return BUSINESS_MODULES.filter((module) => set.has(module));
}

// ─── Keputusan ─────────────────────────────────────────────────────────────

/** Modul ini aktif? Inti selalu aktif, apa pun isi himpunannya. */
export function isModuleEnabled(
  module: BusinessModule,
  enabled: ReadonlySet<BusinessModule>
): boolean {
  return isCoreModule(module) || enabled.has(module);
}

/**
 * Izin ini terjangkau untuk perusahaan ini? Dipakai `canEffective` SEBELUM
 * lapisan peran: izin di modul non-aktif ditolak untuk semua orang, termasuk
 * peran berakses penuh. Aman karena `authz.manage`/`user.manage` ada di modul
 * inti yang tak pernah bisa dimatikan.
 */
export function isPermissionEnabled(
  permission: Permission,
  enabled: ReadonlySet<BusinessModule>
): boolean {
  return isModuleEnabled(moduleForPermission(permission), enabled);
}

/** Izin yang tersisa setelah modul non-aktif disingkirkan (urut `PERMISSIONS`). */
export function filterPermissionsByModules(
  permissions: readonly Permission[],
  enabled: ReadonlySet<BusinessModule>
): Permission[] {
  return permissions.filter((permission) => isPermissionEnabled(permission, enabled));
}

/** Semua izin milik sebuah modul — dipakai tes & penjelasan di layar. */
export function permissionsForModule(module: BusinessModule): Permission[] {
  return PERMISSIONS.filter((permission) => moduleForPermission(permission) === module);
}

// ─── Validasi saat MENULIS ─────────────────────────────────────────────────

/**
 * Validasi usulan himpunan modul SEBELUM disimpan. Mengembalikan daftar pesan
 * kesalahan (Indonesia, siap tampil); kosong = sah. Dipakai server (route PUT —
 * penjaga terakhir) dan client (umpan balik sebelum menyimpan), persis pola
 * `validateOverrides` (#73).
 */
export function validateEnabledModules(modules: readonly string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const candidate of modules) {
    if (!isBusinessModule(candidate)) {
      errors.push(`Modul "${candidate}" tidak dikenal.`);
      continue;
    }
    if (seen.has(candidate)) errors.push(`Modul "${candidate}" disebut dua kali.`);
    seen.add(candidate);
  }
  if (errors.length > 0) return errors;

  // Anti-lockout: inti tak boleh dimatikan. Diperiksa di SERVER, bukan hanya
  // sebagai checkbox yang dinonaktifkan di layar — di dalamnya ada pintu
  // /permissions & /users, dan tanpa keduanya tak ada lagi yang bisa
  // memperbaiki keadaan.
  if (!seen.has(CORE_MODULE)) {
    errors.push(
      "Modul inti (akuntansi, laporan, pengguna, hak akses) tidak bisa dimatikan — " +
        "tanpa modul itu tidak ada lagi yang bisa mengelola aplikasi."
    );
  }

  return errors;
}

// ─── Pemuat + cache ────────────────────────────────────────────────────────

/**
 * TTL cache himpunan modul — SENGAJA konstanta yang sama dengan matriks izin
 * efektif. Perubahan modul dan perubahan izin karena itu terasa dalam jendela
 * yang sama (≤ ±1 menit lintas proses, seketika di proses yang menulis berkat
 * invalidasi eksplisit).
 */
export const ENABLED_MODULES_TTL_MS = EFFECTIVE_MATRIX_TTL_MS;

/**
 * Pabrik pemuat himpunan modul dengan cache ber-TTL + invalidasi eksplisit.
 * Sumber datanya di-inject (pembaca kolom `enabled_modules`) supaya logika
 * cache bisa diuji tanpa Prisma; `authz-effective.ts` yang menyambungkan DB.
 *
 * **Gagal baca DB = SEMUA modul aktif** (dicatat, tidak disembunyikan). Arah
 * fail-open-nya disengaja dan berlawanan dengan otorisasi: modul menyusutkan
 * permukaan, jadi gagal-tertutup berarti seluruh aplikasi di luar inti lenyap
 * saat basis data sedang bermasalah — persis kepanikan yang tidak ada
 * hubungannya dengan penyebab aslinya. Otorisasinya sendiri TIDAK ikut
 * melonggar: lapisan peran/pengguna tetap dievaluasi seperti biasa.
 */
export function createEnabledModulesLoader(
  fetchRaw: () => Promise<string | null>,
  now: () => number = Date.now
) {
  let cached: { modules: ReadonlySet<BusinessModule>; at: number } | null = null;

  return {
    async get(): Promise<ReadonlySet<BusinessModule>> {
      if (cached && now() - cached.at < ENABLED_MODULES_TTL_MS) return cached.modules;
      try {
        const raw = await fetchRaw();
        cached = { modules: parseEnabledModules(raw), at: now() };
        return cached.modules;
      } catch (err) {
        console.error(
          "[modules] gagal membaca company_settings.enabled_modules — menganggap semua modul aktif:",
          err
        );
        return ALL_MODULES;
      }
    },
    /** WAJIB dipanggil setiap kali himpunan modul BERUBAH. */
    invalidate() {
      cached = null;
    },
  };
}
