/**
 * DIBANGKITKAN DARI `contract/accounting.yaml` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit
 * hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
 * berkas ini basi, dan penjaga `tests/contract-accounting.test.ts` memanggilnya.
 *
 * Kontrak akuntansi versi 1.
 *
 * HANYA konstanta yang punya pembaca Go hari ini (09 §3.5) — kecuali mata uang
 * & status dokumen, pengecualian yang disebut (keputusan pemilik 23 Okt 2026).
 * Label dan saldo normal per tipe tetap di `src/lib/accounting.ts`; label &
 * warna status di `@sai/core/constants` dan `status-badge.tsx`.
 */

/** Skala kolom uang `Decimal(15,2)`: satu sen = 10^-MONEY_SCALE rupiah. */
export const MONEY_SCALE = 2;

export type AccountType =
  | "cash_bank"
  | "account_receivable"
  | "inventory"
  | "other_current_asset"
  | "fixed_asset"
  | "accumulated_depreciation"
  | "other_asset"
  | "account_payable"
  | "tax_payable"
  | "other_current_liability"
  | "long_term_liability"
  | "equity"
  | "revenue"
  | "other_income"
  | "cogs"
  | "expense"
  | "other_expense";

/** Urutan kontrak = urutan pilihan formulir; entri pertama bawaannya. */
export const ACCOUNT_TYPE_VALUES = [
  "cash_bank",
  "account_receivable",
  "inventory",
  "other_current_asset",
  "fixed_asset",
  "accumulated_depreciation",
  "other_asset",
  "account_payable",
  "tax_payable",
  "other_current_liability",
  "long_term_liability",
  "equity",
  "revenue",
  "other_income",
  "cogs",
  "expense",
  "other_expense",
] as const satisfies readonly AccountType[];

export const isAccountType = (v: string): v is AccountType =>
  (ACCOUNT_TYPE_VALUES as readonly string[]).includes(v);

// ── Kategori & sisi laporan — dibaca Laba Rugi dan Neraca (TS dan Go) ─────

export type AccountCategory =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export const ACCOUNT_CATEGORY_VALUES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const satisfies readonly AccountCategory[];

/** Kategori setiap tipe akun. Lengkap — generator menolak tipe tanpa kategori. */
export const ACCOUNT_TYPE_CATEGORIES: Readonly<Record<AccountType, AccountCategory>> = {
  cash_bank: "asset",
  account_receivable: "asset",
  inventory: "asset",
  other_current_asset: "asset",
  fixed_asset: "asset",
  accumulated_depreciation: "asset",
  other_asset: "asset",
  account_payable: "liability",
  tax_payable: "liability",
  other_current_liability: "liability",
  long_term_liability: "liability",
  equity: "equity",
  revenue: "revenue",
  other_income: "revenue",
  cogs: "expense",
  expense: "expense",
  other_expense: "expense",
};

export type StatementSide = "debit" | "credit";

/**
 * Sisi yang dilaporkan POSITIF per kategori di Laba Rugi & Neraca:
 * `debit` = debit − kredit, `credit` = kredit − debit.
 */
export const CATEGORY_STATEMENT_SIDE: Readonly<Record<AccountCategory, StatementSide>> = {
  asset: "debit",
  liability: "credit",
  equity: "credit",
  revenue: "credit",
  expense: "debit",
};

// ── Laba Rugi bertingkat (#123) ───────────────────────────────────────────

export type IncomeStatementSectionKey =
  | "sales"
  | "cogs"
  | "operating_expense"
  | "other_income"
  | "other_expense";

/** Urutan band di laporan. */
export const INCOME_STATEMENT_SECTION_KEYS = [
  "sales",
  "cogs",
  "operating_expense",
  "other_income",
  "other_expense",
] as const satisfies readonly IncomeStatementSectionKey[];

/** Tipe yang punya band SENDIRI; tipe laba rugi lainnya ikut bawaan kategorinya. */
export const INCOME_STATEMENT_TYPE_SECTIONS: Readonly<
  Partial<Record<AccountType, IncomeStatementSectionKey>>
> = {
  other_income: "other_income",
  cogs: "cogs",
  other_expense: "other_expense",
};

/** Band bawaan per kategori. Kategori tanpa entri = bukan akun Laba Rugi. */
export const INCOME_STATEMENT_CATEGORY_DEFAULT_SECTIONS: Readonly<
  Partial<Record<AccountCategory, IncomeStatementSectionKey>>
> = {
  revenue: "sales",
  expense: "operating_expense",
};

/** `journals.type` jurnal penutup tahunan (#555) — DIBUANG Laba Rugi saja. */
export const CLOSING_JOURNAL_TYPE = "closing";

// ── Arus Kas (PSAK 2 / IAS 7) — dibaca `getCashFlow` dan Arus Kas Go ─────

/** Tipe akun sisi KAS: arus kas = gerakan yang menyeberangi batas akun ini. */
export const CASH_ACCOUNT_TYPE = "cash_bank" satisfies AccountType;

export type CashFlowCategory =
  | "operating"
  | "investing"
  | "financing"
  | "uncategorised";

/** Urutan kelompok di laporan. */
export const CASH_FLOW_CATEGORY_KEYS = [
  "operating",
  "investing",
  "financing",
  "uncategorised",
] as const satisfies readonly CashFlowCategory[];

/** Kelompok tipe yang TIDAK dipetakan — kelompok yang terlihat, bukan operasi. */
export const CASH_FLOW_FALLBACK_CATEGORY = "uncategorised" satisfies CashFlowCategory;

/** Kelompok arus kas per tipe AKUN LAWAN; tipe lain jatuh ke cadangan. */
export const CASH_FLOW_TYPE_CATEGORIES: Readonly<Partial<Record<AccountType, CashFlowCategory>>> = {
  revenue: "operating",
  other_income: "operating",
  cogs: "operating",
  expense: "operating",
  other_expense: "operating",
  account_receivable: "operating",
  account_payable: "operating",
  inventory: "operating",
  tax_payable: "operating",
  other_current_asset: "operating",
  other_current_liability: "operating",
  fixed_asset: "investing",
  accumulated_depreciation: "investing",
  other_asset: "investing",
  equity: "financing",
  long_term_liability: "financing",
};

// ── Mata uang & status dokumen (23 Okt 2026) ──────────────────────────────
// Dibaca lewat re-ekspor `@sai/core/constants`; label & warna tetap di TS.

export type Currency =
  | "USD"
  | "CNY"
  | "IDR";

/** Mata uang yang ditransaksikan, dalam urutan pilihan formulir. */
export const CURRENCIES = [
  "USD",
  "CNY",
  "IDR",
] as const satisfies readonly Currency[];

/** Mata uang buku besar — satuan setiap `base_amount`. */
export const BASE_CURRENCY = "IDR" satisfies Currency;

export type InvoiceStatus =
  | "signed"
  | "pending"
  | "canceled";

export const INVOICE_STATUSES = [
  "signed",
  "pending",
  "canceled",
] as const satisfies readonly InvoiceStatus[];

export type ContractStatus =
  | "signed"
  | "pending"
  | "canceled"
  | "completed";

/** Diawali `INVOICE_STATUSES` persis (generator menolak selainnya); tambahan di belakang. */
export const CONTRACT_STATUSES = [
  "signed",
  "pending",
  "canceled",
  "completed",
] as const satisfies readonly ContractStatus[];

// ── Umur piutang & utang (#12) — dibaca `receivables.ts` dan Go ─────────

export type AgingBucket =
  | "b0_30"
  | "b31_60"
  | "b61_90"
  | "b90_plus";

/** Ember umur, dari yang termuda. */
export const AGING_BUCKETS = [
  "b0_30",
  "b31_60",
  "b61_90",
  "b90_plus",
] as const satisfies readonly AgingBucket[];

/**
 * Batas atas INKLUSIF tiap ember dalam hari kalender Jakarta; `null` = ember
 * terakhir, tanpa batas. Umur <= 0 mendarat di ember pertama.
 */
export const AGING_BUCKET_MAX_DAYS: Readonly<Record<AgingBucket, number | null>> = {
  b0_30: 30,
  b31_60: 60,
  b61_90: 90,
  b90_plus: null,
};
