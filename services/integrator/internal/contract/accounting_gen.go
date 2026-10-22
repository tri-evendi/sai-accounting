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
