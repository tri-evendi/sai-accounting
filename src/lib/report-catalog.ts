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
  pajak: "Ekspor pajak keluaran/masukan (e-Faktur / CTAS).",
};

export type ReportStatus = "available" | "coming_soon";

/** Which parameter form a report asks for — drives the filter UI on its page. */
export type ReportParamKind = "period" | "as_of" | "period_month" | "none";

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
  },
  {
    id: "income-statement",
    title: "Laba / Rugi",
    description: "Pendapatan dikurangi beban untuk suatu periode, plus ringkasan bahasa awam.",
    category: "keuangan",
    status: "available",
    href: "/reports/income-statement",
    paramKind: "period",
    icon: "TrendingUp",
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
  },
  {
    id: "budget-realization",
    title: "Realisasi vs Anggaran",
    description: "Bandingkan anggaran dengan realisasi dari Laba/Rugi, beserta selisihnya.",
    category: "keuangan",
    status: "available",
    href: "/budget",
    paramKind: "period_month",
    icon: "Target",
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
  },
  {
    id: "sales-target",
    title: "Realisasi Target Penjualan",
    description: "Target penjualan dibanding penjualan riil dari buku besar.",
    category: "penjualan",
    status: "available",
    href: "/budget",
    paramKind: "period_month",
    icon: "TrendingUp",
  },
  {
    id: "sales-by-customer",
    title: "Penjualan per Pelanggan",
    description: "Rekap penjualan per pelanggan pada suatu periode.",
    category: "penjualan",
    status: "coming_soon",
    paramKind: "period",
    icon: "Users",
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
  },
  {
    id: "purchases-by-supplier",
    title: "Pembelian per Pemasok",
    description: "Rekap pembelian per pemasok pada suatu periode.",
    category: "pembelian",
    status: "coming_soon",
    paramKind: "period",
    icon: "Truck",
  },
  // ── Stok ──────────────────────────────────────────────────────────────────
  {
    id: "stock-value",
    title: "Nilai Persediaan",
    description: "Kuantitas dan nilai persediaan terkini per komoditas.",
    category: "stok",
    status: "available",
    href: "/inventory",
    paramKind: "none",
    icon: "Package",
  },
  {
    id: "stock-movement",
    title: "Kartu Stok / Mutasi",
    description: "Riwayat masuk-keluar tiap komoditas pada suatu periode.",
    category: "stok",
    status: "coming_soon",
    paramKind: "period",
    icon: "PackageOpen",
  },
  // ── Kas & Bank ────────────────────────────────────────────────────────────
  {
    id: "cash-bank",
    title: "Laporan Kas & Bank",
    description: "Saldo dan mutasi tiap akun kas & bank.",
    category: "kas_bank",
    status: "available",
    href: "/finance",
    paramKind: "none",
    icon: "Landmark",
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
    paramKind: "period_month",
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
