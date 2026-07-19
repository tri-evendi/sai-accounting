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

  { code: "1103", name: "Uang Muka Pembelian", type: "other_current_asset" },
  { code: "1104", name: "Persediaan Barang Dagang", type: "inventory" },
  { code: "1105", name: "PPN Masukan", type: "other_current_asset" },

  { code: "1201", name: "Aktiva Tetap", type: "fixed_asset" },
  { code: "120101", name: "Peralatan & Mesin", type: "fixed_asset", parent: "1201" },
  { code: "120102", name: "Akumulasi Penyusutan", type: "accumulated_depreciation", parent: "1201" },

  // 2xxx LIABILITIES
  { code: "2101", name: "Hutang Usaha", type: "account_payable" },
  { code: "2102", name: "Uang Muka Penjualan", type: "other_current_liability" },
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
  { code: "7201", name: "Beban Bunga & Administrasi Bank", type: "other_expense" },
];
