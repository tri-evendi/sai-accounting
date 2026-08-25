/**
 * Report centre catalogue + parameter parsing (issue #19).
 *
 * ── One catalogue, honest about status ───────────────────────────────────────
 * The Pusat Laporan groups every report the app can produce into the six
 * categories the issue names (Keuangan, Penjualan, Pembelian, Stok, Kas & Bank,
 * Pajak). Each entry is either `available` — it links to a report that really
 * exists and reads real ledger data — or `coming_soon`, shown greyed with no
 * link. A category with nothing built yet still appears (so the shape of the
 * product is visible) but never fakes a number: `coming_soon` is the truthful
 * alternative to a broken link or an empty page dressed up as a report.
 *
 * ── Bahasanya hidup di KAMUS, bukan di sini (issue #316) ─────────────────────
 * Berkas ini tidak memuat satu pun kalimat yang dibaca pengguna. Judul &
 * penjelasan tiap laporan ada di `reports.catalogReport.<id>`, judul & penjelasan
 * kategori di `reports.catalogCategory.<kategori>`, dan judul kolom yang boleh
 * dipilih adalah KUNCI kamus (`ReportColumnSpec.labelKey`). Yang tinggal di sini
 * adalah struktur: id, kategori, status, alamat, bentuk parameter, daftar kolom.
 *
 * Sebelumnya ketiganya ditulis dua kali — kalimat Indonesia di sini sebagai
 * "cadangan" dan kalimat sungguhan di kamus. Cadangan itu tidak pernah menyala
 * (keenam belas laporan dan keenam kategori sudah punya entri), jadi yang
 * sesungguhnya ada hanyalah 44 kalimat yang bisa disunting orang tanpa satu
 * piksel pun berubah — dan satu daftar kolom yang memancarkan bahasa Indonesia
 * mati ke dialog trilingual. Keduanya kini mustahil: id dan kategori BERTIPE
 * kunci kamus.
 *
 * Catatan yang ikut pindah bersama kalimatnya, karena JSON tak bisa memuat
 * komentar: penjelasan kategori Pajak sengaja menyebut pajak KELUARAN saja —
 * menjanjikan PPN Masukan yang tidak ada di modulnya membuat kategori itu
 * berbohong (audit 2026-07).
 *
 * ── Parameter parsing is pure and validated ──────────────────────────────────
 * `resolvePeriod` / `resolveAsOf` turn raw URL params into the exact Date bounds
 * the readers expect, rejecting anything that is not a real calendar date
 * (`2026-02-30`, `garbage`, an empty string) and falling back to a sensible
 * default instead of handing a reader an `Invalid Date` that would poison every
 * figure. They reuse `toISODate` so the ISO⇄Date round-trip matches the dashboard
 * and the report pages byte-for-byte.
 */
import type { Permission } from "@/lib/authz";
import { toISODate } from "@/lib/dashboard-summary";
import type { Dictionary, DictionaryKey } from "@/lib/i18n/dictionary";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

/**
 * Kategori — TERIKAT pada kamus (issue #316).
 *
 * `satisfies` di sini bukan hiasan: kartu katalog membaca judul & penjelasan
 * kategorinya dari `reports.catalogCategory`, jadi kategori yang lahir tanpa
 * entri kamus adalah judul yang hilang di layar. Sekarang ia galat `tsc`.
 * Arah sebaliknya — entri kamus tanpa kategori — dijaga
 * `tests/report-catalog-column-labels.test.ts`.
 */
export const REPORT_CATEGORIES = [
  "keuangan",
  "penjualan",
  "pembelian",
  "stok",
  "kas_bank",
  "pajak",
] as const satisfies readonly (keyof Dictionary["reports"]["catalogCategory"])[];

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type ReportStatus = "available" | "coming_soon";

/**
 * Kunci entri kamus judul & penjelasan sebuah laporan (`reports.catalogReport.*`).
 */
export type ReportTextKey = keyof Dictionary["reports"]["catalogReport"];

type UnderscoreToDash<S extends string> = S extends `${infer A}_${infer B}`
  ? `${A}-${UnderscoreToDash<B>}`
  : S;

/**
 * Id laporan — TERIKAT pada kamus (issue #316).
 *
 * Katalog dulu menyimpan `title` & `description` bahasa Indonesia sendiri, dan
 * halaman katalog memakainya sebagai CADANGAN bila kamus tak punya entrinya.
 * Cadangan itu tak pernah menyala — keenam belas laporan sudah punya entri —
 * sehingga yang tersisa hanyalah 32 kalimat yang bisa disunting orang tanpa
 * satu piksel pun berubah di layar: "penjaga palsu berbentuk konstanta" yang
 * persis sama dengan temuan #310. Sekarang tidak ada cadangan: kamus adalah
 * satu-satunya sumber, dan id yang belum punya entri ditolak `tsc`.
 */
export type ReportId = UnderscoreToDash<ReportTextKey & string>;

/**
 * Id laporan → kunci kamusnya ("trial-balance" → "trial_balance").
 *
 * Penggantinya di tingkat TIPE-lah yang menjaga: `ReportId` diturunkan dari
 * kunci kamus, jadi `replace` di sini tidak pernah bisa menghasilkan kunci yang
 * tidak ada — pengecekannya sudah terjadi di `tsc` saat entri katalog ditulis.
 */
export function reportTextKey(id: ReportId): ReportTextKey {
  return id.replace(/-/g, "_") as ReportTextKey;
}

/**
 * Which parameter form a report asks for — drives the filter UI on its page.
 *
 * Menyatakan parameter yang BENAR-BENAR dibaca halaman tujuan, bukan bentuk
 * periode yang secara konsep cocok untuk laporan itu. Bedanya baru terasa
 * setelah dialog parameter ada: dialog merender kendalinya dari sini, jadi
 * nilai yang terlalu murah hati menghasilkan isian yang diabaikan diam-diam.
 * `period_month` = `?year=&month=`, dengan `month=0` berarti SETAHUN PENUH —
 * bentuk yang dibaca `/budget/report`, satu-satunya halaman yang memakainya.
 */
export type ReportParamKind = "period" | "as_of" | "period_month" | "none";

/**
 * Saringan tambahan di luar tanggal, dinyatakan per laporan.
 *
 * Sengaja daftar tertutup, bukan `string`: dialog parameter merender kendali
 * dari daftar ini, jadi nama yang salah ketik harus ditolak `tsc` — bukan
 * muncul sebagai kendali yang diam-diam hilang di layar.
 */
export type ReportFilterId = "costCenter";

/**
 * Satu kolom yang boleh dipilih pengguna sebelum melihat/mengekspor laporan.
 *
 * Dinyatakan di katalog, BUKAN di halamannya, karena tiga tempat harus
 * menyepakati daftar yang sama: layar, PDF, dan lembar sebar. Katalog adalah
 * satu-satunya tempat yang sudah dibaca ketiganya.
 *
 * `fixed` menandai kolom identitas baris (kode akun, nama barang) — ia tetap
 * dirender di daftar sebagai tercentang-mati, sebab laporan tanpa kolom
 * identitas hanya berisi angka tanpa keterangan.
 *
 * ── Judulnya KUNCI KAMUS, bukan kalimat (issue #316) ────────────────────────
 * Ia dulu string bahasa Indonesia, dan komentarnya menjanjikan kamus
 * "meng-override lewat `reports.column.<id>`" — mekanisme yang tidak pernah
 * ada. Akibatnya dua: kedelapan judul kolom Umur Piutang/Utang tertulis untuk
 * KETIGA kalinya di berkas ini, dan dialog pilih-kolom memancarkan bahasa
 * Indonesia mati kepada pembaca `en`/`zh` sementara setiap kalimat lain di
 * dialog yang sama sudah lewat kamus.
 *
 * Kuncinya adalah kunci yang SAMA dengan yang dipakai tabel layar laporan itu
 * (mis. `payables/page.tsx` menamai kolom pihaknya `payables.colSupplier`) —
 * jadi dialognya menyebut kolom dengan nama yang benar-benar akan dibaca
 * penggunanya setelah menekan Pratinjau. Ia sengaja BUKAN judul kertas: kertas
 * menyebut satuannya ("Saldo Awal (IDR)") karena selnya menyimpan angka
 * telanjang, layar tidak perlu karena `Money` selalu membawa "Rp" — aturan
 * `kamus+IDR` milik #298. `tests/report-catalog-column-labels.test.ts` memaku
 * hubungan itu kolom demi kolom.
 */
export interface ReportColumnSpec {
  /** Id stabil — dipakai di URL (`?cols=`), di layar, dan di berkas ekspor. */
  id: string;
  /** Kunci kamus judul kolom — kunci yang sama dengan tabel layar laporan ini. */
  labelKey: DictionaryKey;
  /** Kolom identitas baris: selalu ikut, tak bisa dimatikan. */
  fixed?: boolean;
  /** Ikut secara bawaan. Tak diisi = ikut. */
  defaultOn?: boolean;
}

export interface ReportDefinition {
  /**
   * Id laporan; judul & penjelasannya hidup di `reports.catalogReport.<id>`
   * dengan `-` menjadi `_`. Lihat `ReportId` — kamusnya yang menentukan id mana
   * yang sah, jadi laporan tanpa entri kamus ditolak `tsc`.
   */
  id: ReportId;
  category: ReportCategory;
  status: ReportStatus;
  /**
   * Izin yang DIJAGA oleh halaman tujuan laporan ini — bukan izin karangan
   * (issue #355).
   *
   * Sebelum ini katalognya tidak tahu apa-apa soal izin, jadi Pusat Laporan
   * menawarkan keenam belas kartu kepada semua orang. Untuk perusahaan yang
   * mematikan modul Stok, tiga kartu "Stok" tetap terpampang lengkap dengan
   * ajakan "Buka laporan" — dan menekannya mendarat di layar modul-tidak-aktif.
   * Kartu yang menjanjikan sesuatu lalu menolak membukanya lebih buruk daripada
   * kartu yang memang tidak ada.
   *
   * Nilainya WAJIB sama persis dengan `requirePagePermission()` di halaman
   * `href`-nya; kesamaan itu dijaga `tests/report-catalog-permissions.test.ts`,
   * yang membaca kedua sisi dari berkasnya sendiri. Dengan satu medan ini,
   * gerbang modul (`canEffective` memeriksa modul lebih dulu) ikut berlaku
   * untuk katalog tanpa Pusat Laporan perlu tahu apa itu modul.
   */
  permission: Permission;
  /**
   * Laporan yang hanya masuk akal bagi pembaca ber-Mode Akuntan (issue #355).
   *
   * Cerminan `NavItem.accountingOnly` di `lib/nav.ts`, dan disaring dengan
   * fungsi yang sama (`effectiveAccountantMode`) supaya menu dan Pusat Laporan
   * tidak pernah berbeda pendapat.
   *
   * KENAPA PERLU MEDAN SENDIRI, bukan `ACCOUNTING_PERMISSIONS`: gerbang Mode
   * Akuntan di `page-auth.ts` bekerja per-IZIN, sedangkan enam laporan berbagi
   * satu izin `report.read`. Laba/Rugi, Neraca, dan Arus Kas adalah laporan
   * yang justru paling perlu dibaca pemilik usaha; Neraca Saldo tidak. Menandai
   * `report.read` sebagai izin akuntansi akan menyembunyikan keenam-enamnya —
   * jadi penandanya harus per-LAPORAN.
   *
   * Sejauh ini isinya satu: Neraca Saldo. Dialog Mode Akuntan berjanji
   * menyembunyikan "label debit/kredit", dan penjelasan laporan ini berbunyi
   * persis "Saldo debit/kredit seluruh akun pada satu tanggal — harus
   * seimbang". Sebelum ini janji itu ditepati di menu (Jurnal, Buku Besar,
   * Daftar Akun hilang) tapi tidak di Pusat Laporan, sehingga artefak PALING
   * akuntan di pembukuan berpasangan justru satu-satunya yang bertahan.
   */
  accountingOnly?: boolean;
  /** Route for an `available` report; undefined for `coming_soon`. */
  href?: string;
  paramKind: ReportParamKind;
  /** Icon name (key of the page's `ICONS` map), resolved by the page (keeps this file pure). */
  icon: string;
  /**
   * Jenis payload cetak laporan ini — ADA hanya bila laporannya benar-benar
   * bisa menghasilkan berkas. Tanpa ini dialog parameter tidak menawarkan PDF
   * maupun Excel, dan itulah yang jujur: 10 dari 16 entri katalog masih
   * menunjuk halaman modul yang interaktif, bukan laporan yang bisa dicetak.
   *
   * Bertipe `StatementPayload["kind"]`, jadi jenis payload yang dihapus atau
   * diganti nama di `lib/pdf/statement-pdf` menjatuhkan `tsc` di sini alih-alih
   * menghasilkan tombol unduh yang gagal saat ditekan.
   */
  payloadKind?: StatementPayload["kind"];
  /** Saringan tambahan yang ditawarkan dialog parameter. */
  filters?: ReportFilterId[];
  /** Kolom yang boleh dipilih. Tak diisi = susunan kolomnya baku (laporan keuangan). */
  columns?: ReportColumnSpec[];
  /**
   * Laporan yang ekspornya HIDUP DI HALAMANNYA sendiri dalam format khusus —
   * e-Faktur menghasilkan berkas impor DJP, bukan dokumen cetak.
   *
   * Membedakannya dari "belum punya ekspor" penting: dialog yang mengatakan
   * belum ada, padahal ada satu klik jauhnya, mengirim orang mencari fitur yang
   * sudah dimilikinya.
   */
  exportOnPage?: boolean;
}

export type ReportExportFormat = "pdf" | "xlsx";

/** Laporan yang bisa menghasilkan berkas — yaitu yang punya payload cetak. */
export function isExportable(
  report: ReportDefinition
): report is ReportDefinition & { payloadKind: StatementPayload["kind"] } {
  return report.payloadKind !== undefined;
}

export function reportById(id: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.id === id);
}

/**
 * Kolom yang aktif untuk satu laporan, dari daftar `?cols=` yang mungkin kotor.
 *
 * Aturannya: kolom `fixed` selalu ikut; id asing diabaikan; daftar KOSONG atau
 * tak ada artinya "bawaan", bukan "tidak ada kolom" — sebuah laporan tanpa satu
 * kolom pun adalah halaman kosong, dan itu tak pernah yang dimaksud pengguna
 * yang baru saja menekan Pratinjau.
 */
export function resolveColumns(report: ReportDefinition, raw: string | undefined): string[] {
  const specs = report.columns ?? [];
  if (specs.length === 0) return [];
  const asked = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const wanted = new Set(asked.filter((id) => specs.some((c) => c.id === id)));
  if (wanted.size === 0) {
    return specs.filter((c) => c.fixed || c.defaultOn !== false).map((c) => c.id);
  }
  return specs.filter((c) => c.fixed || wanted.has(c.id)).map((c) => c.id);
}

export const REPORTS: ReportDefinition[] = [
  // ── Keuangan ──────────────────────────────────────────────────────────────
  {
    id: "trial-balance",
    category: "keuangan",
    permission: "report.read",
    accountingOnly: true,
    status: "available",
    href: "/reports/trial-balance",
    paramKind: "as_of",
    icon: "BookText",
    payloadKind: "trial-balance",
  },
  {
    id: "income-statement",
    category: "keuangan",
    permission: "report.read",
    status: "available",
    href: "/reports/income-statement",
    paramKind: "period",
    icon: "TrendingUp",
    payloadKind: "income-statement",
    // Laba/Rugi SAJA yang boleh dipilah per pusat biaya — tanpa akun antar-unit
    // neraca yang disaring tak lagi seimbang (issue #91).
    filters: ["costCenter"],
  },
  {
    id: "balance-sheet",
    category: "keuangan",
    permission: "report.read",
    status: "available",
    href: "/reports/balance-sheet",
    paramKind: "as_of",
    icon: "Scale",
    payloadKind: "balance-sheet",
  },
  {
    id: "cash-flow",
    category: "keuangan",
    permission: "report.read",
    status: "available",
    href: "/reports/cash-flow",
    paramKind: "period",
    icon: "Waves",
    payloadKind: "cash-flow",
  },
  {
    id: "budget-realization",
    category: "keuangan",
    permission: "budget.manage",
    status: "available",
    // `/budget` hanyalah HUB berisi tiga tautan; laporannya ada satu klik lebih
    // dalam. Kartu yang menjanjikan "Realisasi vs Anggaran" lalu mendaratkan
    // orang di persimpangan adalah janji yang belum ditepati — dan halaman
    // itulah yang benar-benar membaca `?year=&month=`.
    href: "/budget/report",
    paramKind: "period_month",
    icon: "Target",
    payloadKind: "budget-realization",
    // Tanpa pilihan kolom: tabel variansi di layar belum dirender dari daftar
    // kolom, dan centang yang hanya berlaku di berkas melanggar aturan yang
    // dipegang seluruh Pusat Laporan — layar, PDF, dan lembar sebar sepakat.
  },
  // ── Penjualan ─────────────────────────────────────────────────────────────
  {
    id: "receivables",
    category: "penjualan",
    permission: "receivable.read",
    status: "available",
    href: "/receivables",
    paramKind: "as_of",
    icon: "HandCoins",
    payloadKind: "receivables",
    columns: [
      { id: "party", labelKey: "common.customer", fixed: true },
      { id: "documentNo", labelKey: "common.document" },
      { id: "date", labelKey: "common.date" },
      { id: "dueDate", labelKey: "common.dueDate" },
      { id: "age", labelKey: "common.age" },
      { id: "status", labelKey: "common.status" },
      { id: "total", labelKey: "receivables.colDocumentValue" },
      { id: "outstanding", labelKey: "common.remainingIdr" },
    ],
  },
  {
    id: "sales-target",
    category: "penjualan",
    permission: "budget.manage",
    status: "available",
    // Realisasi target penjualan hidup di halaman yang SAMA dengan realisasi
    // anggaran — satu periode, dua bagian. Dua kartu katalog yang menunjuk satu
    // halaman itu jujur: keduanya memang pertanyaan tentang rencana vs kenyataan.
    href: "/budget/report",
    paramKind: "period_month",
    icon: "TrendingUp",
  },
  {
    id: "sales-by-customer",
    category: "penjualan",
    permission: "report.read",
    status: "available",
    href: "/reports/sales-by-customer",
    paramKind: "period",
    icon: "Users",
    payloadKind: "sales-by-customer",
    columns: [
      { id: "party", labelKey: "reports.colCustomer", fixed: true },
      { id: "docCount", labelKey: "reports.colDocuments" },
      { id: "gross", labelKey: "reports.colGrossSales" },
      { id: "returns", labelKey: "reports.colReturns" },
      { id: "net", labelKey: "reports.colNet" },
    ],
  },
  // ── Pembelian ─────────────────────────────────────────────────────────────
  {
    id: "payables",
    category: "pembelian",
    permission: "payable.read",
    status: "available",
    href: "/payables",
    paramKind: "as_of",
    icon: "Wallet",
    payloadKind: "payables",
    columns: [
      { id: "party", labelKey: "payables.colSupplier", fixed: true },
      { id: "documentNo", labelKey: "common.document" },
      { id: "date", labelKey: "common.date" },
      { id: "dueDate", labelKey: "common.dueDate" },
      { id: "age", labelKey: "common.age" },
      { id: "status", labelKey: "common.status" },
      { id: "total", labelKey: "payables.colPurchaseValue" },
      { id: "outstanding", labelKey: "common.remainingIdr" },
    ],
  },
  {
    id: "purchases-by-supplier",
    category: "pembelian",
    permission: "report.read",
    status: "available",
    href: "/reports/purchases-by-supplier",
    paramKind: "period",
    icon: "Truck",
    payloadKind: "purchases-by-supplier",
    columns: [
      { id: "party", labelKey: "reports.colSupplier", fixed: true },
      { id: "docCount", labelKey: "reports.colDocuments" },
      { id: "gross", labelKey: "reports.colGrossPurchases" },
      { id: "returns", labelKey: "reports.colReturns" },
      { id: "net", labelKey: "reports.colNet" },
    ],
  },
  // ── Stok ──────────────────────────────────────────────────────────────────
  {
    id: "stock-value",
    category: "stok",
    permission: "inventory.read",
    status: "available",
    // Halaman laporannya SENDIRI, bukan `/inventory`. Halaman modul itu adalah
    // tempat bekerja — berkartu, bergrafik, terpaginasi sepuluh baris — dan
    // sepuluh baris pertama bukan laporan nilai persediaan.
    href: "/reports/stock-value",
    /*
     * BERPERIODE sejak #492. Sebelumnya `"none"` — laporan hanya bisa menjawab
     * "per hari ini", sehingga pertanyaan yang paling sering ditanyakan akuntan
     * ("berapa nilai persediaan per 31 Desember?") tak punya jawaban, dan
     * angkanya berubah setiap kali tanggal berganti.
     */
    paramKind: "period",
    icon: "Package",
    payloadKind: "stock-value",
    columns: [
      { id: "code", labelKey: "common.itemCode" },
      { id: "name", labelKey: "common.item", fixed: true },
      { id: "unit", labelKey: "common.unit" },
      { id: "openingQty", labelKey: "inventory.colOpeningQty" },
      { id: "openingValue", labelKey: "inventory.colOpeningValue" },
      { id: "inQty", labelKey: "inventory.colInQty" },
      { id: "inValue", labelKey: "inventory.colInValue" },
      { id: "outQty", labelKey: "inventory.colOutQty" },
      { id: "outValue", labelKey: "inventory.colOutValue" },
      { id: "closingQty", labelKey: "inventory.colClosingQty" },
      { id: "closingValue", labelKey: "inventory.colClosingValue" },
    ],
  },
  {
    id: "stock-movement",
    // Judulnya ("Riwayat Stok", di kamus) sengaja awam; istilah bakunya hidup
    // di glosarium & judul cetakan — pola yang sama dengan "Hitung Ulang Stok"
    // (stok opname) dan "Cocokkan Rekening Koran" (rekonsiliasi bank).
    category: "stok",
    permission: "inventory.read",
    status: "available",
    href: "/inventory/movement",
    paramKind: "period",
    icon: "PackageOpen",
    payloadKind: "stock-movement",
    // Kolom "Diolah" hanya ada bila periodenya memang punya mutasi olah —
    // centang di sini boleh MENGHILANGKAN kolom, tak pernah memunculkannya
    // (laporannya sendiri yang memutuskan lewat `hasProcess`).
    columns: [
      { id: "name", labelKey: "common.item", fixed: true },
      { id: "unit", labelKey: "common.unit" },
      { id: "opening", labelKey: "stockMovement.colOpening" },
      { id: "movedIn", labelKey: "stockMovement.colIn" },
      { id: "movedOut", labelKey: "stockMovement.colOut" },
      { id: "processed", labelKey: "stockMovement.colProcessed" },
      { id: "closing", labelKey: "stockMovement.colClosing" },
    ],
  },
  {
    id: "opname-history",
    // Jalan masuk BACA ke riwayat opname (issue #129): tautan lamanya hanya
    // hidup di halaman hitung ulang yang berizin tulis, sehingga pemegang
    // izin baca-saja tidak pernah bisa sampai ke sana (audit 2026-07).
    category: "stok",
    permission: "inventory.read",
    status: "available",
    href: "/inventory/opname/history",
    paramKind: "period",
    icon: "Package",
    payloadKind: "opname-history",
  },
  // ── Kas & Bank ────────────────────────────────────────────────────────────
  {
    id: "cash-bank",
    category: "kas_bank",
    permission: "cash.read",
    status: "available",
    // Halaman laporannya sendiri, dengan alasan yang sama seperti Nilai
    // Persediaan: `/finance` adalah tempat MENCATAT kas masuk & keluar, dan
    // daftar transaksinya terpaginasi. Laporan ini menjawab pertanyaan lain —
    // berapa saldo tiap akun kas & bank bergerak sepanjang satu periode.
    href: "/reports/cash-bank",
    paramKind: "period",
    icon: "Landmark",
    payloadKind: "cash-bank",
    columns: [
      { id: "account", labelKey: "reports.colCashBankAccount", fixed: true },
      { id: "opening", labelKey: "reports.colOpeningBalance" },
      { id: "net", labelKey: "reports.colChange" },
      { id: "closing", labelKey: "reports.colClosingBalance" },
    ],
  },
  {
    id: "bank-reconciliation",
    category: "kas_bank",
    permission: "reconciliation.read",
    status: "available",
    href: "/reconciliation",
    paramKind: "none",
    icon: "Scale",
  },
  // ── Pajak ─────────────────────────────────────────────────────────────────
  {
    id: "efaktur",
    category: "pajak",
    permission: "tax.read",
    status: "available",
    href: "/tax/efaktur",
    // Halaman e-Faktur menyaring dengan `?from=&to=` — rentang tanggal, bukan
    // bulan tunggal seperti yang dulu tertulis di sini.
    paramKind: "period",
    icon: "FileSpreadsheet",
    // Ekspornya berkas impor DJP, dihasilkan di halamannya sendiri — bukan PDF
    // atau lembar sebar, jadi ia sengaja tidak lewat jalur payload cetak.
    exportOnPage: true,
  },
];

export interface CategoryGroup {
  category: ReportCategory;
  reports: ReportDefinition[];
}

/**
 * The catalogue grouped by category, in the canonical category order.
 *
 * Tanpa `label`/`description`: keduanya dulu kalimat bahasa Indonesia yang
 * halaman katalog pakai sebagai CADANGAN kamus, dan cadangan yang tak pernah
 * menyala hanyalah kalimat yang bisa berbeda diam-diam (#316). Judulnya kini
 * dibaca langsung dari `reports.catalogCategory[category]`, yang `tsc` pastikan
 * ada untuk keenam kategori.
 */
export function reportsByCategory(): CategoryGroup[] {
  return REPORT_CATEGORIES.map((category) => ({
    category,
    reports: REPORTS.filter((r) => r.category === category),
  }));
}

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}

// ─── Parameter parsing / validation ──────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in `YYYY-MM-DD` form. Rejects `2026-13-01`,
 * `2026-02-30` and `garbage` — the round-trip through `toISODate` catches
 * overflow dates the `Date` constructor would silently roll forward.
 */
export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toISODate(d) === value;
}

export interface PeriodParams {
  from: Date;
  to: Date;
  fromISO: string;
  toISO: string;
}

/**
 * Resolve `?from=&to=` into inclusive Date bounds. Defaults to year-to-date
 * (Jan 1 → today), matching the report pages. Invalid inputs fall back to the
 * default rather than producing an `Invalid Date`.
 */
export function resolvePeriod(
  fromStr: string | undefined,
  toStr: string | undefined,
  now: Date = new Date()
): PeriodParams {
  const defFrom = toISODate(new Date(now.getFullYear(), 0, 1));
  const defTo = toISODate(now);
  const fromISO = fromStr && isValidISODate(fromStr) ? fromStr : defFrom;
  const toISO = toStr && isValidISODate(toStr) ? toStr : defTo;
  return {
    fromISO,
    toISO,
    from: new Date(`${fromISO}T00:00:00`),
    to: new Date(`${toISO}T23:59:59.999`),
  };
}

export interface AsOfParams {
  asOf: Date;
  asOfISO: string;
}

/** Resolve `?asOf=` into an inclusive end-of-day bound. Defaults to today. */
export function resolveAsOf(asOfStr: string | undefined, now: Date = new Date()): AsOfParams {
  const asOfISO = asOfStr && isValidISODate(asOfStr) ? asOfStr : toISODate(now);
  return { asOfISO, asOf: new Date(`${asOfISO}T23:59:59.999`) };
}
