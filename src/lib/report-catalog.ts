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
 * ── Parameter parsing is pure and validated ──────────────────────────────────
 * `resolvePeriod` / `resolveAsOf` turn raw URL params into the exact Date bounds
 * the readers expect, rejecting anything that is not a real calendar date
 * (`2026-02-30`, `garbage`, an empty string) and falling back to a sensible
 * default instead of handing a reader an `Invalid Date` that would poison every
 * figure. They reuse `toISODate` so the ISO⇄Date round-trip matches the dashboard
 * and the report pages byte-for-byte.
 */
import { toISODate } from "@/lib/dashboard-summary";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";

export const REPORT_CATEGORIES = [
  "keuangan",
  "penjualan",
  "pembelian",
  "stok",
  "kas_bank",
  "pajak",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  keuangan: "Keuangan",
  penjualan: "Penjualan",
  pembelian: "Pembelian",
  stok: "Stok",
  kas_bank: "Kas & Bank",
  pajak: "Pajak",
};

export const CATEGORY_DESCRIPTIONS: Record<ReportCategory, string> = {
  keuangan: "Laba/rugi, neraca, arus kas dan realisasi anggaran.",
  penjualan: "Piutang pelanggan dan realisasi target penjualan.",
  pembelian: "Utang ke pemasok dan analisa pembelian.",
  stok: "Nilai dan pergerakan persediaan.",
  kas_bank: "Posisi kas & bank dan rekonsiliasi.",
  // Hanya pajak KELUARAN yang diekspor — menjanjikan PPN Masukan yang tidak
  // ada di modulnya membuat kategori ini berbohong (audit 2026-07).
  pajak: "Ekspor pajak keluaran (e-Faktur / CTAS).",
};

export type ReportStatus = "available" | "coming_soon";

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
 */
export interface ReportColumnSpec {
  /** Id stabil — dipakai di URL (`?cols=`), di layar, dan di berkas ekspor. */
  id: string;
  /** Judul kolom bahasa Indonesia; kamus meng-override lewat `reports.column.<id>`. */
  label: string;
  /** Kolom identitas baris: selalu ikut, tak bisa dimatikan. */
  fixed?: boolean;
  /** Ikut secara bawaan. Tak diisi = ikut. */
  defaultOn?: boolean;
}

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  status: ReportStatus;
  /** Route for an `available` report; undefined for `coming_soon`. */
  href?: string;
  paramKind: ReportParamKind;
  /** Icon name from lucide-react, resolved by the page (keeps this file pure). */
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
    title: "Neraca Saldo",
    description: "Saldo debit/kredit seluruh akun pada satu tanggal — harus seimbang.",
    category: "keuangan",
    status: "available",
    href: "/reports/trial-balance",
    paramKind: "as_of",
    icon: "BookText",
    payloadKind: "trial-balance",
  },
  {
    id: "income-statement",
    title: "Laba / Rugi",
    description:
      "Bertingkat: penjualan − HPP = laba kotor, dikurangi beban jadi laba bersih, plus ringkasan bahasa awam.",
    category: "keuangan",
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
    title: "Neraca",
    description: "Posisi Aset = Liabilitas + Ekuitas pada satu tanggal.",
    category: "keuangan",
    status: "available",
    href: "/reports/balance-sheet",
    paramKind: "as_of",
    icon: "Scale",
    payloadKind: "balance-sheet",
  },
  {
    id: "cash-flow",
    title: "Arus Kas",
    description: "Kas masuk dan keluar per kategori: operasi, investasi, pendanaan.",
    category: "keuangan",
    status: "available",
    href: "/reports/cash-flow",
    paramKind: "period",
    icon: "Waves",
    payloadKind: "cash-flow",
  },
  {
    id: "budget-realization",
    title: "Realisasi vs Anggaran",
    description: "Bandingkan anggaran dengan realisasi dari Laba/Rugi, beserta selisihnya.",
    category: "keuangan",
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
    title: "Piutang & Umur Piutang",
    description: "Tagihan pelanggan yang belum lunas, dikelompokkan per umur.",
    category: "penjualan",
    status: "available",
    href: "/receivables",
    paramKind: "as_of",
    icon: "HandCoins",
    payloadKind: "receivables",
    columns: [
      { id: "party", label: "Pelanggan", fixed: true },
      { id: "documentNo", label: "Dokumen" },
      { id: "date", label: "Tanggal" },
      { id: "dueDate", label: "Jatuh Tempo" },
      { id: "age", label: "Umur" },
      { id: "status", label: "Status" },
      { id: "total", label: "Nilai Dokumen" },
      { id: "outstanding", label: "Sisa (IDR)" },
    ],
  },
  {
    id: "sales-target",
    title: "Realisasi Target Penjualan",
    description: "Target penjualan dibanding penjualan riil dari buku besar.",
    category: "penjualan",
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
    title: "Penjualan per Pelanggan",
    description: "Rekap penjualan per pelanggan pada suatu periode.",
    category: "penjualan",
    status: "available",
    href: "/reports/sales-by-customer",
    paramKind: "period",
    icon: "Users",
    payloadKind: "sales-by-customer",
    columns: [
      { id: "party", label: "Pelanggan", fixed: true },
      { id: "docCount", label: "Jumlah Dokumen" },
      { id: "gross", label: "Penjualan Kotor" },
      { id: "returns", label: "Retur" },
      { id: "net", label: "Bersih" },
    ],
  },
  // ── Pembelian ─────────────────────────────────────────────────────────────
  {
    id: "payables",
    title: "Utang & Umur Utang",
    description: "Tagihan pemasok yang belum Anda bayar, dikelompokkan per umur.",
    category: "pembelian",
    status: "available",
    href: "/payables",
    paramKind: "as_of",
    icon: "Wallet",
    payloadKind: "payables",
    columns: [
      { id: "party", label: "Pemasok", fixed: true },
      { id: "documentNo", label: "Dokumen" },
      { id: "date", label: "Tanggal" },
      { id: "dueDate", label: "Jatuh Tempo" },
      { id: "age", label: "Umur" },
      { id: "status", label: "Status" },
      { id: "total", label: "Nilai Dokumen" },
      { id: "outstanding", label: "Sisa (IDR)" },
    ],
  },
  {
    id: "purchases-by-supplier",
    title: "Pembelian per Pemasok",
    description: "Rekap pembelian per pemasok pada suatu periode.",
    category: "pembelian",
    status: "available",
    href: "/reports/purchases-by-supplier",
    paramKind: "period",
    icon: "Truck",
    payloadKind: "purchases-by-supplier",
    columns: [
      { id: "party", label: "Pemasok", fixed: true },
      { id: "docCount", label: "Jumlah Dokumen" },
      { id: "gross", label: "Pembelian Kotor" },
      { id: "returns", label: "Retur" },
      { id: "net", label: "Bersih" },
    ],
  },
  // ── Stok ──────────────────────────────────────────────────────────────────
  {
    id: "stock-value",
    title: "Nilai Persediaan",
    description: "Kuantitas dan nilai persediaan terkini per komoditas.",
    category: "stok",
    status: "available",
    // Halaman laporannya SENDIRI, bukan `/inventory`. Halaman modul itu adalah
    // tempat bekerja — berkartu, bergrafik, terpaginasi sepuluh baris — dan
    // sepuluh baris pertama bukan laporan nilai persediaan.
    href: "/reports/stock-value",
    paramKind: "none",
    icon: "Package",
    payloadKind: "stock-value",
    columns: [
      { id: "name", label: "Barang", fixed: true },
      { id: "unit", label: "Satuan" },
      { id: "currentStock", label: "Saldo" },
      { id: "unitCost", label: "Biaya/Unit" },
      { id: "stockValue", label: "Nilai Persediaan" },
    ],
  },
  {
    id: "stock-movement",
    // Nama awam di permukaan, istilah bakunya hidup di glosarium & judul
    // cetakan — pola yang sama dengan "Hitung Ulang Stok" (stok opname) dan
    // "Cocokkan Rekening Koran" (rekonsiliasi bank).
    title: "Riwayat Stok",
    description: "Saldo awal, masuk-keluar, dan saldo akhir tiap komoditas — per minggu, bulan atau tahun.",
    category: "stok",
    status: "available",
    href: "/inventory/movement",
    paramKind: "period",
    icon: "PackageOpen",
    payloadKind: "stock-movement",
    // Kolom "Diolah" hanya ada bila periodenya memang punya mutasi olah —
    // centang di sini boleh MENGHILANGKAN kolom, tak pernah memunculkannya
    // (laporannya sendiri yang memutuskan lewat `hasProcess`).
    columns: [
      { id: "name", label: "Barang", fixed: true },
      { id: "unit", label: "Satuan" },
      { id: "opening", label: "Saldo Awal" },
      { id: "movedIn", label: "Masuk" },
      { id: "movedOut", label: "Keluar" },
      { id: "processed", label: "Diolah" },
      { id: "closing", label: "Saldo Akhir" },
    ],
  },
  {
    id: "opname-history",
    // Jalan masuk BACA ke riwayat opname (issue #129): tautan lamanya hanya
    // hidup di halaman hitung ulang yang berizin tulis, sehingga pemegang
    // izin baca-saja tidak pernah bisa sampai ke sana (audit 2026-07).
    title: "Riwayat Hitung Ulang Stok",
    description: "Hasil hitung ulang (stok opname) per periode: lebih, susut, dan selisih bersihnya.",
    category: "stok",
    status: "available",
    href: "/inventory/opname/history",
    paramKind: "period",
    icon: "Package",
    payloadKind: "opname-history",
  },
  // ── Kas & Bank ────────────────────────────────────────────────────────────
  {
    id: "cash-bank",
    title: "Laporan Kas & Bank",
    description: "Saldo dan mutasi tiap akun kas & bank.",
    category: "kas_bank",
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
      { id: "account", label: "Akun Kas & Bank", fixed: true },
      { id: "opening", label: "Saldo Awal" },
      { id: "net", label: "Perubahan" },
      { id: "closing", label: "Saldo Akhir" },
    ],
  },
  {
    id: "bank-reconciliation",
    title: "Rekonsiliasi Bank",
    description: "Cocokkan mutasi buku dengan rekening koran bank.",
    category: "kas_bank",
    status: "available",
    href: "/reconciliation",
    paramKind: "none",
    icon: "Scale",
  },
  // ── Pajak ─────────────────────────────────────────────────────────────────
  {
    id: "efaktur",
    title: "Ekspor e-Faktur (DJP/CTAS)",
    description: "Ekspor faktur pajak keluaran ke format impor DJP.",
    category: "pajak",
    status: "available",
    href: "/tax/efaktur",
    // Halaman e-Faktur menyaring dengan `?from=&to=` — rentang tanggal, bukan
    // bulan tunggal seperti yang dulu tertulis di sini.
    paramKind: "period",
    icon: "FileSpreadsheet",
  },
];

export interface CategoryGroup {
  category: ReportCategory;
  label: string;
  description: string;
  reports: ReportDefinition[];
}

/** The catalogue grouped by category, in the canonical category order. */
export function reportsByCategory(): CategoryGroup[] {
  return REPORT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    description: CATEGORY_DESCRIPTIONS[category],
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
