// DIBANGKITKAN DARI `contract/accounting.yaml` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit
// hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
// berkas ini basi, dan penjaga `tests/contract-accounting.test.ts` memanggilnya.
//
// Kontrak akuntansi versi 1.

package contract

// MoneyScale adalah skala kolom uang Decimal(15,2): satu sen = 10^-MoneyScale
// rupiah. Pembaca buku menjumlahkan uang sebagai sen int64 — tidak pernah
// float — dan mengurai NUMERIC dengan skala ini.
const MoneyScale = 2

// AccountType adalah nilai kolom `accounts.type`.
type AccountType string

const (
	AccountTypeCashBank                AccountType = "cash_bank"
	AccountTypeAccountReceivable       AccountType = "account_receivable"
	AccountTypeInventory               AccountType = "inventory"
	AccountTypeOtherCurrentAsset       AccountType = "other_current_asset"
	AccountTypeFixedAsset              AccountType = "fixed_asset"
	AccountTypeAccumulatedDepreciation AccountType = "accumulated_depreciation"
	AccountTypeOtherAsset              AccountType = "other_asset"
	AccountTypeAccountPayable          AccountType = "account_payable"
	AccountTypeTaxPayable              AccountType = "tax_payable"
	AccountTypeOtherCurrentLiability   AccountType = "other_current_liability"
	AccountTypeLongTermLiability       AccountType = "long_term_liability"
	AccountTypeEquity                  AccountType = "equity"
	AccountTypeRevenue                 AccountType = "revenue"
	AccountTypeOtherIncome             AccountType = "other_income"
	AccountTypeCogs                    AccountType = "cogs"
	AccountTypeExpense                 AccountType = "expense"
	AccountTypeOtherExpense            AccountType = "other_expense"
)

// AccountTypes dalam urutan kontrak (urutan pilihan formulir), bukan abjad.
var AccountTypes = []AccountType{
	AccountTypeCashBank,
	AccountTypeAccountReceivable,
	AccountTypeInventory,
	AccountTypeOtherCurrentAsset,
	AccountTypeFixedAsset,
	AccountTypeAccumulatedDepreciation,
	AccountTypeOtherAsset,
	AccountTypeAccountPayable,
	AccountTypeTaxPayable,
	AccountTypeOtherCurrentLiability,
	AccountTypeLongTermLiability,
	AccountTypeEquity,
	AccountTypeRevenue,
	AccountTypeOtherIncome,
	AccountTypeCogs,
	AccountTypeExpense,
	AccountTypeOtherExpense,
}

// IsAccountType melaporkan apakah v adalah tipe akun yang dikenal kontrak ini.
func IsAccountType(v string) bool {
	for _, t := range AccountTypes {
		if string(t) == v {
			return true
		}
	}
	return false
}

// AccountCategory adalah kategori laporan keuangan sebuah tipe akun.
type AccountCategory string

const (
	AccountCategoryAsset     AccountCategory = "asset"
	AccountCategoryLiability AccountCategory = "liability"
	AccountCategoryEquity    AccountCategory = "equity"
	AccountCategoryRevenue   AccountCategory = "revenue"
	AccountCategoryExpense   AccountCategory = "expense"
)

// AccountTypeCategories: kategori setiap tipe akun kontrak (lengkap).
var AccountTypeCategories = map[AccountType]AccountCategory{
	AccountTypeCashBank:                AccountCategoryAsset,
	AccountTypeAccountReceivable:       AccountCategoryAsset,
	AccountTypeInventory:               AccountCategoryAsset,
	AccountTypeOtherCurrentAsset:       AccountCategoryAsset,
	AccountTypeFixedAsset:              AccountCategoryAsset,
	AccountTypeAccumulatedDepreciation: AccountCategoryAsset,
	AccountTypeOtherAsset:              AccountCategoryAsset,
	AccountTypeAccountPayable:          AccountCategoryLiability,
	AccountTypeTaxPayable:              AccountCategoryLiability,
	AccountTypeOtherCurrentLiability:   AccountCategoryLiability,
	AccountTypeLongTermLiability:       AccountCategoryLiability,
	AccountTypeEquity:                  AccountCategoryEquity,
	AccountTypeRevenue:                 AccountCategoryRevenue,
	AccountTypeOtherIncome:             AccountCategoryRevenue,
	AccountTypeCogs:                    AccountCategoryExpense,
	AccountTypeExpense:                 AccountCategoryExpense,
	AccountTypeOtherExpense:            AccountCategoryExpense,
}

// CategoryOf: kategori tipe akun mentah dari basis data; false bila tipenya di
// luar kontrak — akun seperti itu tidak masuk Laba Rugi maupun Neraca.
func CategoryOf(accountType string) (AccountCategory, bool) {
	c, ok := AccountTypeCategories[AccountType(accountType)]
	return c, ok
}

// StatementSide: sisi yang dilaporkan POSITIF di Laba Rugi & Neraca.
type StatementSide string

const (
	StatementSideDebit  StatementSide = "debit"
	StatementSideCredit StatementSide = "credit"
)

// CategoryStatementSide: debit = debit − kredit, credit = kredit − debit.
var CategoryStatementSide = map[AccountCategory]StatementSide{
	AccountCategoryAsset:     StatementSideDebit,
	AccountCategoryLiability: StatementSideCredit,
	AccountCategoryEquity:    StatementSideCredit,
	AccountCategoryRevenue:   StatementSideCredit,
	AccountCategoryExpense:   StatementSideDebit,
}

// IncomeStatementSection adalah satu band Laba Rugi bertingkat (#123).
type IncomeStatementSection string

const (
	IncomeStatementSectionSales            IncomeStatementSection = "sales"
	IncomeStatementSectionCogs             IncomeStatementSection = "cogs"
	IncomeStatementSectionOperatingExpense IncomeStatementSection = "operating_expense"
	IncomeStatementSectionOtherIncome      IncomeStatementSection = "other_income"
	IncomeStatementSectionOtherExpense     IncomeStatementSection = "other_expense"
)

// IncomeStatementSections dalam urutan band laporan.
var IncomeStatementSections = []IncomeStatementSection{
	IncomeStatementSectionSales,
	IncomeStatementSectionCogs,
	IncomeStatementSectionOperatingExpense,
	IncomeStatementSectionOtherIncome,
	IncomeStatementSectionOtherExpense,
}

// IncomeStatementTypeSections: tipe yang punya band SENDIRI.
var IncomeStatementTypeSections = map[AccountType]IncomeStatementSection{
	AccountTypeOtherIncome:  IncomeStatementSectionOtherIncome,
	AccountTypeCogs:         IncomeStatementSectionCogs,
	AccountTypeOtherExpense: IncomeStatementSectionOtherExpense,
}

// IncomeStatementCategoryDefaultSections: band bawaan per kategori; kategori
// tanpa entri bukan akun Laba Rugi.
var IncomeStatementCategoryDefaultSections = map[AccountCategory]IncomeStatementSection{
	AccountCategoryRevenue: IncomeStatementSectionSales,
	AccountCategoryExpense: IncomeStatementSectionOperatingExpense,
}

// ClosingJournalType: `journals.type` jurnal penutup tahunan (#555). Laba
// Rugi MEMBUANGNYA; Neraca dan Neraca Saldo memasukkannya.
const ClosingJournalType = "closing"
