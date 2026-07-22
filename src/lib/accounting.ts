// Chart of Accounts taxonomy + default template for a trading/export business (Indonesia).
// Enum-like values follow docs/DATABASE.md: lowercase snake_case, validated with z.enum.

export type NormalBalance = "debit" | "credit";
export type AccountCategory = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface AccountTypeDef {
  value: string;
  label: string; // Indonesian label shown in UI
  category: AccountCategory;
  normalBalance: NormalBalance;
}

/** Master list of account types. `normalBalance` is derived from the type (not user-editable). */
export const ACCOUNT_TYPES: AccountTypeDef[] = [
  // Assets (normal debit)
  { value: "cash_bank", label: "Kas & Bank", category: "asset", normalBalance: "debit" },
  { value: "account_receivable", label: "Piutang Usaha", category: "asset", normalBalance: "debit" },
  { value: "inventory", label: "Persediaan", category: "asset", normalBalance: "debit" },
  { value: "other_current_asset", label: "Aktiva Lancar Lainnya", category: "asset", normalBalance: "debit" },
  { value: "fixed_asset", label: "Aktiva Tetap", category: "asset", normalBalance: "debit" },
  { value: "accumulated_depreciation", label: "Akumulasi Penyusutan", category: "asset", normalBalance: "credit" },
  { value: "other_asset", label: "Aktiva Lainnya", category: "asset", normalBalance: "debit" },
  // Liabilities (normal credit)
  { value: "account_payable", label: "Hutang Usaha", category: "liability", normalBalance: "credit" },
  { value: "tax_payable", label: "Hutang Pajak", category: "liability", normalBalance: "credit" },
  { value: "other_current_liability", label: "Hutang Lancar Lainnya", category: "liability", normalBalance: "credit" },
  { value: "long_term_liability", label: "Hutang Jangka Panjang", category: "liability", normalBalance: "credit" },
  // Equity (normal credit)
  { value: "equity", label: "Ekuitas", category: "equity", normalBalance: "credit" },
  // Revenue (normal credit)
  { value: "revenue", label: "Pendapatan", category: "revenue", normalBalance: "credit" },
  { value: "other_income", label: "Pendapatan Lain-lain", category: "revenue", normalBalance: "credit" },
  // Expense (normal debit)
  { value: "cogs", label: "Beban Pokok Penjualan", category: "expense", normalBalance: "debit" },
  { value: "expense", label: "Beban Operasional", category: "expense", normalBalance: "debit" },
  { value: "other_expense", label: "Beban Lain-lain", category: "expense", normalBalance: "debit" },
];

export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((t) => t.value) as [string, ...string[]];

const TYPE_MAP: Record<string, AccountTypeDef> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t])
);

export function accountTypeLabel(value: string): string {
  return TYPE_MAP[value]?.label ?? value;
}

/** Normal balance is a function of the account type — never taken from user input. */
export function normalBalanceFor(type: string): NormalBalance {
  return TYPE_MAP[type]?.normalBalance ?? "debit";
}

export function accountCategoryFor(type: string): AccountCategory | undefined {
  return TYPE_MAP[type]?.category;
}

// ─── Default COA template (trading/export, Indonesia) ────────────────────────
// Parent rows link children via `parent` (code). Codes follow: 1=asset, 2=liability,
// 3=equity, 4=revenue, 5=COGS, 6=expense, 7=other. Multi-currency sub-accounts per §Accurate.

export interface CoaTemplateRow {
  code: string;
  name: string;
  type: string;
  parent?: string; // parent account code
  currency?: string;
}

export const COA_TEMPLATE: CoaTemplateRow[] = [
  // 1xxx ASSETS
  { code: "1101", name: "Kas & Setara Kas", type: "cash_bank" },
  { code: "110101", name: "Kas Kecil", type: "cash_bank", parent: "1101" },
  { code: "110102", name: "Kas Besar", type: "cash_bank", parent: "1101" },
  { code: "110103", name: "Bank (IDR)", type: "cash_bank", parent: "1101", currency: "IDR" },
  { code: "110104", name: "Bank (USD)", type: "cash_bank", parent: "1101", currency: "USD" },
  { code: "110105", name: "Bank (CNY)", type: "cash_bank", parent: "1101", currency: "CNY" },

  { code: "1102", name: "Piutang Usaha", type: "account_receivable" },
  { code: "110201", name: "Piutang Usaha (IDR)", type: "account_receivable", parent: "1102", currency: "IDR" },
  { code: "110202", name: "Piutang Usaha (USD)", type: "account_receivable", parent: "1102", currency: "USD" },
  { code: "110203", name: "Piutang Usaha (CNY)", type: "account_receivable", parent: "1102", currency: "CNY" },

  // Uang Muka Pembelian — an ASSET: money paid before the supplier's invoice
  // exists, so the supplier owes us goods. Currency sub-accounts mirror the
  // 1102/110201-3 pattern, because a CNY advance must sit in a CNY account for
  // the same reason a CNY receivable does (issue #26).
  { code: "1103", name: "Uang Muka Pembelian", type: "other_current_asset" },
  { code: "110301", name: "Uang Muka Pembelian (IDR)", type: "other_current_asset", parent: "1103", currency: "IDR" },
  { code: "110302", name: "Uang Muka Pembelian (USD)", type: "other_current_asset", parent: "1103", currency: "USD" },
  { code: "110303", name: "Uang Muka Pembelian (CNY)", type: "other_current_asset", parent: "1103", currency: "CNY" },

  { code: "1104", name: "Persediaan Barang Dagang", type: "inventory" },
  { code: "1105", name: "PPN Masukan", type: "other_current_asset" },

  { code: "1201", name: "Aktiva Tetap", type: "fixed_asset" },
  { code: "120101", name: "Peralatan & Mesin", type: "fixed_asset", parent: "1201" },
  { code: "120102", name: "Akumulasi Penyusutan", type: "accumulated_depreciation", parent: "1201" },

  // 2xxx LIABILITIES
  { code: "2101", name: "Hutang Usaha", type: "account_payable" },
  // Uang Muka Penjualan — a LIABILITY: the customer has paid but we still owe
  // the goods, so this is emphatically NOT revenue until the invoice compensates
  // it. The live Accurate chart carries 210106 "Uang Muka Penjualan CNY"; these
  // are the template's equivalent slots, and a company on another chart just
  // repoints the `advance_sales` mapping row.
  { code: "2102", name: "Uang Muka Penjualan", type: "other_current_liability" },
  { code: "210201", name: "Uang Muka Penjualan (IDR)", type: "other_current_liability", parent: "2102", currency: "IDR" },
  { code: "210202", name: "Uang Muka Penjualan (USD)", type: "other_current_liability", parent: "2102", currency: "USD" },
  { code: "210203", name: "Uang Muka Penjualan (CNY)", type: "other_current_liability", parent: "2102", currency: "CNY" },

  { code: "2103", name: "Hutang PPN Keluaran", type: "tax_payable" },
  { code: "2201", name: "Hutang Jangka Panjang", type: "long_term_liability" },

  // 3xxx EQUITY
  { code: "3101", name: "Modal", type: "equity" },
  { code: "3102", name: "Laba Ditahan", type: "equity" },

  // 4xxx REVENUE
  { code: "4101", name: "Penjualan Barang Dagang", type: "revenue" },
  { code: "4102", name: "Retur Penjualan", type: "revenue" },

  // 5xxx COGS
  { code: "5101", name: "Beban Pokok Penjualan", type: "cogs" },

  // 6xxx EXPENSES
  { code: "6101", name: "Beban Operasional", type: "expense" },
  { code: "610101", name: "Beban Gaji & Tunjangan", type: "expense", parent: "6101" },
  { code: "610102", name: "Beban Sewa", type: "expense", parent: "6101" },
  { code: "610103", name: "Beban Penyusutan", type: "expense", parent: "6101" },
  { code: "610104", name: "Beban Administrasi & Umum", type: "expense", parent: "6101" },

  // 7xxx OTHER INCOME / EXPENSE
  { code: "7101", name: "Laba/Rugi Selisih Kurs", type: "other_income" },
  { code: "7102", name: "Pendapatan Bunga", type: "other_income" },
  // Laba/Rugi Pelepasan Aset Tetap (issue #28). A SINGLE account holding both the
  // gain (credit) and the loss (debit) on disposal, exactly like 7101 for FX: the
  // laba/rugi pelepasan is proceeds − net book value, already an IDR base amount.
  // `other_income` (normal credit) mirrors 7101; a loss simply carries a debit
  // balance, as a realised FX loss does on 7101.
  { code: "7103", name: "Laba/Rugi Pelepasan Aset Tetap", type: "other_income" },
  { code: "7201", name: "Beban Bunga & Administrasi Bank", type: "other_expense" },
];
