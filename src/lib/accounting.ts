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

/**
 * Tipe akun yang berkategori BEBAN — diturunkan, tidak diketik ulang.
 *
 * Ada karena penyaring di luar modul ini (pemeriksa kesesuaian data, laporan
 * sifat beban) butuh daftarnya, dan daftar yang disalin akan menyimpang pada
 * tipe beban berikutnya yang ditambahkan — persis kelas cacat yang pemeriksa
 * itu sendiri dibuat untuk menemukan.
 */
export const EXPENSE_ACCOUNT_TYPE_VALUES: readonly string[] = ACCOUNT_TYPES.filter(
  (t) => t.category === "expense"
).map((t) => t.value);

/**
 * Tipe akun "Beban Lain-lain" — band di luar usaha pada Laba Rugi.
 *
 * Disebut sebagai konstanta karena ia PUNYA MAKNA di luar dirinya: sejak
 * Coretax, akun "Lain-Lain" berskala material diprioritaskan sebagai target
 * koreksi fiskal positif otomatis, sebab sifat objek pajaknya sulit
 * diidentifikasi sistem pengawasan (issue #444). Yang membaca konstanta ini
 * adalah pagar materialitas di `@/lib/materiality`.
 */
export const CATCH_ALL_EXPENSE_TYPE = "other_expense";

// ─── Sifat Beban / nature of expense (issue #445) ────────────────────────────

export interface ExpenseNatureDef {
  value: string;
  label: string;
}

/**
 * SIFAT sebuah beban — apa yang dibelanjakan, bukan untuk apa.
 *
 * ══ KENAPA INI TIDAK BISA DITEBAK DARI NAMA AKUN ═══════════════════════════
 * Bagan akun bawaan kebetulan sudah terpisah menurut sifat: "Beban Gaji &
 * Tunjangan", "Beban Sewa", "Beban Penyusutan". Yang memisahkannya hanyalah
 * NAMA YANG DIKETIK MANUSIA, dan setiap PT menyunting bagan akunnya. Perusahaan
 * pertama yang menamai akunnya "Beban Personalia" memutus kaitan itu tanpa satu
 * galat pun — dan yang berdiri di atasnya adalah dua hal yang tidak boleh
 * meleset: rincian CALK, dan equalisasi PPh yang menyandingkan beban gaji
 * dengan SPT Masa PPh 21.
 *
 * Mencocokkan dengan `LIKE '%gaji%'` bukan dasar yang pantas untuk angka yang
 * dikirim ke DJP.
 *
 * ══ SENGAJA PENDEK, DAN SENGAJA TANPA "LAINNYA" ════════════════════════════
 * Setiap nilai enum yang pernah tersimpan harus ditanggung selamanya, jadi
 * daftar panjang yang tak dipakai siapa pun lebih buruk daripada daftar pendek
 * yang bisa ditambah.
 *
 * Yang TIDAK ada di sini adalah "Lainnya", dan ketiadaannya disengaja: seluruh
 * alasan penanda ini lahir adalah melawan penampung (#444), jadi menyediakan
 * penampung di dalam penandanya sendiri akan membatalkan dirinya. Akun yang
 * sungguh-sungguh tidak masuk satu pun sifat di bawah cukup dibiarkan KOSONG —
 * dan itu pertanda daftarnya perlu entri baru, bukan pertanda ia perlu ember.
 */
export const EXPENSE_NATURES: ExpenseNatureDef[] = [
  { value: "salary", label: "Gaji & Imbalan Kerja" },
  { value: "professional_services", label: "Imbalan Jasa Profesional" },
  { value: "rent", label: "Sewa" },
  { value: "depreciation", label: "Penyusutan & Amortisasi" },
  { value: "materials", label: "Bahan & Barang Terjual" },
  { value: "utilities", label: "Utilitas" },
  { value: "transport", label: "Transportasi & Perjalanan" },
  { value: "interest", label: "Bunga & Biaya Keuangan" },
  { value: "levy", label: "Pajak & Retribusi" },
];

export const EXPENSE_NATURE_VALUES = EXPENSE_NATURES.map((n) => n.value) as [string, ...string[]];

const NATURE_MAP: Record<string, ExpenseNatureDef> = Object.fromEntries(
  EXPENSE_NATURES.map((n) => [n.value, n])
);

/** Label bahasa Indonesia; kamus yang menerjemahkannya untuk layar. */
export function expenseNatureLabel(value: string): string {
  return NATURE_MAP[value]?.label ?? value;
}

/** Sifat beban hanya bermakna pada akun BERKATEGORI beban. */
export function acceptsExpenseNature(type: string): boolean {
  return accountCategoryFor(type) === "expense";
}

/**
 * Sifat yang BOLEH tersimpan untuk sebuah tipe akun.
 *
 * Satu tempat, dipakai setiap jalur tulis (buat, ubah, semai). Tanpa ini,
 * akun bank bisa membawa sifat "gaji", dan — yang jauh lebih mudah terjadi —
 * sebuah akun beban yang KEMUDIAN diubah tipenya jadi aset akan meninggalkan
 * sifat lamanya menempel di sana, ikut terjumlah ke rincian CALK dari sebuah
 * baris yang bukan beban sama sekali.
 */
export function resolveExpenseNature(
  type: string,
  nature: string | null | undefined
): string | null {
  return acceptsExpenseNature(type) ? (nature ?? null) : null;
}

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
  /**
   * Modul yang MEMBUTUHKAN akun ini (issue #99/#104). Tanpa `module`, akunnya
   * inti — selalu ikut, apa pun kategori usahanya.
   *
   * KENAPA MODUL, BUKAN KATEGORI USAHA. Kategori hanya memilihkan himpunan
   * modul awal; sesudah itu tiap modul bisa dinyalakan/dimatikan sendiri dari
   * Pengaturan, dan `business-modules.ts` menegaskan kategori TIDAK PERNAH
   * dibaca saat menegakkan apa pun — yang berlaku selalu himpunan modul.
   * Menandai baris dengan kategori akan membuat dua sumber kebenaran yang bisa
   * menyimpang; menandainya dengan modul membuat bagan akun mengikuti aturan
   * yang sudah ada.
   */
  module?: string;
  /**
   * Sifat beban bawaan (issue #445). Hanya untuk baris berkategori beban;
   * KOSONG berarti "belum ditetapkan" dan itu jawaban yang sah — lihat
   * `EXPENSE_NATURES`.
   */
  nature?: string;
}

export const COA_TEMPLATE: CoaTemplateRow[] = [
  // 1xxx ASSETS
  { code: "1101", name: "Kas & Setara Kas", type: "cash_bank", module: "cash_bank" },
  { code: "110101", name: "Kas Kecil", type: "cash_bank", parent: "1101", module: "cash_bank" },
  { code: "110102", name: "Kas Besar", type: "cash_bank", parent: "1101", module: "cash_bank" },
  { code: "110103", name: "Bank (IDR)", type: "cash_bank", parent: "1101", currency: "IDR", module: "cash_bank" },
  { code: "110104", name: "Bank (USD)", type: "cash_bank", parent: "1101", currency: "USD", module: "cash_bank" },
  { code: "110105", name: "Bank (CNY)", type: "cash_bank", parent: "1101", currency: "CNY", module: "cash_bank" },

  { code: "1102", name: "Piutang Usaha", type: "account_receivable", module: "sales" },
  { code: "110201", name: "Piutang Usaha (IDR)", type: "account_receivable", parent: "1102", currency: "IDR", module: "sales" },
  { code: "110202", name: "Piutang Usaha (USD)", type: "account_receivable", parent: "1102", currency: "USD", module: "sales" },
  { code: "110203", name: "Piutang Usaha (CNY)", type: "account_receivable", parent: "1102", currency: "CNY", module: "sales" },

  // Uang Muka Pembelian — an ASSET: money paid before the supplier's invoice
  // exists, so the supplier owes us goods. Currency sub-accounts mirror the
  // 1102/110201-3 pattern, because a CNY advance must sit in a CNY account for
  // the same reason a CNY receivable does (issue #26).
  { code: "1103", name: "Uang Muka Pembelian", type: "other_current_asset", module: "purchasing" },
  { code: "110301", name: "Uang Muka Pembelian (IDR)", type: "other_current_asset", parent: "1103", currency: "IDR", module: "purchasing" },
  { code: "110302", name: "Uang Muka Pembelian (USD)", type: "other_current_asset", parent: "1103", currency: "USD", module: "purchasing" },
  { code: "110303", name: "Uang Muka Pembelian (CNY)", type: "other_current_asset", parent: "1103", currency: "CNY", module: "purchasing" },

  { code: "1104", name: "Persediaan Barang Dagang", type: "inventory", module: "inventory" },
  { code: "1105", name: "PPN Masukan", type: "other_current_asset", module: "tax_id" },

  { code: "1201", name: "Aktiva Tetap", type: "fixed_asset", module: "fixed_assets" },
  { code: "120101", name: "Peralatan & Mesin", type: "fixed_asset", parent: "1201", module: "fixed_assets" },
  { code: "120102", name: "Akumulasi Penyusutan", type: "accumulated_depreciation", parent: "1201", module: "fixed_assets" },

  // 2xxx LIABILITIES
  { code: "2101", name: "Hutang Usaha", type: "account_payable", module: "purchasing" },
  // Uang Muka Penjualan — a LIABILITY: the customer has paid but we still owe
  // the goods, so this is emphatically NOT revenue until the invoice compensates
  // it. The live Accurate chart carries 210106 "Uang Muka Penjualan CNY"; these
  // are the template's equivalent slots, and a company on another chart just
  // repoints the `advance_sales` mapping row.
  { code: "2102", name: "Uang Muka Penjualan", type: "other_current_liability", module: "sales" },
  { code: "210201", name: "Uang Muka Penjualan (IDR)", type: "other_current_liability", parent: "2102", currency: "IDR", module: "sales" },
  { code: "210202", name: "Uang Muka Penjualan (USD)", type: "other_current_liability", parent: "2102", currency: "USD", module: "sales" },
  { code: "210203", name: "Uang Muka Penjualan (CNY)", type: "other_current_liability", parent: "2102", currency: "CNY", module: "sales" },

  { code: "2103", name: "Hutang PPN Keluaran", type: "tax_payable", module: "tax_id" },
  { code: "2201", name: "Hutang Jangka Panjang", type: "long_term_liability" },

  // 3xxx EQUITY
  { code: "3101", name: "Modal", type: "equity" },
  { code: "3102", name: "Laba Ditahan", type: "equity" },

  // 4xxx REVENUE
  { code: "4101", name: "Penjualan Barang Dagang", type: "revenue", module: "sales" },
  { code: "4102", name: "Retur Penjualan", type: "revenue", module: "sales" },

  // 5xxx COGS
  { code: "5101", name: "Beban Pokok Penjualan", type: "cogs", module: "inventory", nature: "materials" },
  // Selisih Harga Pokok (issue #495 butir 1) — biaya impor yang datang
  // BELAKANGAN dan jatuh pada barang yang SUDAH TERJUAL. HPP baris penjualannya
  // sudah terbit dan tidak ditulis ulang (itu akan mengubah jurnal yang sudah
  // dilaporkan), jadi bagian itu mendarat di sini, di periode berjalan.
  //
  // Bertipe `cogs`, bukan `expense`: yang sedang dicatat adalah harga pokok
  // barang yang benar-benar terjual — hanya terlambat diketahui. Menaruhnya di
  // Beban Operasional akan membuat marjin kotor tampak lebih baik daripada
  // kenyataannya, tepat sebesar bea masuk yang telat datang.
  { code: "5102", name: "Selisih Harga Pokok", type: "cogs", module: "inventory" },

  // 6xxx EXPENSES
  { code: "6101", name: "Beban Operasional", type: "expense" },
  { code: "610101", name: "Beban Gaji & Tunjangan", type: "expense", parent: "6101", nature: "salary" },
  { code: "610102", name: "Beban Sewa", type: "expense", parent: "6101", nature: "rent" },
  { code: "610103", name: "Beban Penyusutan", type: "expense", parent: "6101", module: "fixed_assets", nature: "depreciation" },
  { code: "610104", name: "Beban Administrasi & Umum", type: "expense", parent: "6101" },
  // Selisih Persediaan (issue #57) — akun tunggal untuk penyesuaian stok opname:
  // susut (fisik < sistem) mendebit sebagai kerugian; lebih (fisik > sistem)
  // mengkredit (kontra). Bertipe expense agar tampil di Laba/Rugi.
  { code: "610105", name: "Selisih Persediaan", type: "expense", parent: "6101", module: "inventory" },
  // Beban Susut Proses (issue #490) — susut yang lahir dari MENGOLAH barang
  // (menyortir, mengeringkan, mengupas), bukan dari salah hitung. Akun sendiri,
  // terpisah dari Selisih Persediaan: yang satu kerugian pencatatan, yang lain
  // ongkos produksi yang wajar dan memang diharapkan. Menggabungkannya membuat
  // "seberapa akurat gudang kami" dan "berapa rendemen proses kami" jadi satu
  // angka yang tak menjawab keduanya. Bagan akun pengguna pertama menamainya
  // 5100002 BEBAN SUSUT PROSES.
  { code: "610106", name: "Beban Susut Proses", type: "expense", parent: "6101", module: "inventory" },

  // 7xxx OTHER INCOME / EXPENSE
  { code: "7101", name: "Laba/Rugi Selisih Kurs", type: "other_income" },
  { code: "7102", name: "Pendapatan Bunga", type: "other_income" },
  // Laba/Rugi Pelepasan Aset Tetap (issue #28). A SINGLE account holding both the
  // gain (credit) and the loss (debit) on disposal, exactly like 7101 for FX: the
  // laba/rugi pelepasan is proceeds − net book value, already an IDR base amount.
  // `other_income` (normal credit) mirrors 7101; a loss simply carries a debit
  // balance, as a realised FX loss does on 7101.
  { code: "7103", name: "Laba/Rugi Pelepasan Aset Tetap", type: "other_income", module: "fixed_assets" },
  { code: "7201", name: "Beban Bunga & Administrasi Bank", type: "other_expense", nature: "interest" },
];
