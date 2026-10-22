/**
 * DIBANGKITKAN DARI `contract/accounting.yaml` — JANGAN DISUNTING TANGAN.
 *
 * Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit
 * hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
 * berkas ini basi, dan penjaga `tests/contract-accounting.test.ts` memanggilnya.
 *
 * Kontrak akuntansi versi 1.
 *
 * HANYA konstanta yang punya pembaca Go hari ini (09 §3.5). Label, kategori,
 * dan saldo normal per tipe tetap di `src/lib/accounting.ts`.
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
