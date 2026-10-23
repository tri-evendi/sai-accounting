// DIBANGKITKAN DARI `src/lib/statement-layout.ts`, `src/lib/report-export.ts`,
// `src/lib/cost-centers.ts`, `@sai/core/constants`, `@sai/core/business-date`, dan
// kamus `id.json` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah salah satunya, dan commit
// hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
// berkas ini basi (penjaga `tests/contract-jobs.test.ts`).
//
// Pembacanya `internal/document`: lembar sebar yang dihasilkan Go untuk laporan
// ber-`engine: "go"` di `src/lib/report-engine.ts`. Kalimat & rupa di sini
// wajib sama dengan lembar yang dihasilkan `src/lib/xlsx.ts` — dibuktikan
// `bun run parity:trial-balance-xlsx`.

package contract

// ReportColumn adalah satu kolom lembar sebar: judul dan lebar (karakter).
type ReportColumn struct {
	Header string
	Width  float64
}

// Kalimat cetak, format angka, dan rupa kepala lembar. Pola ber-%s disusun
// dengan fmt.Sprintf; nilainya dibangkitkan dengan memanggil fungsi TS-nya.
const (
	CompanyNameFallback        = "PT Subur Anugerah Indonesia"
	TrialBalanceSheetName      = "Neraca Saldo"
	TrialBalanceTitle          = "Neraca Saldo"
	TrialBalanceEmptyLabel     = "Belum ada saldo sampai tanggal ini"
	TrialBalanceTotalLabel     = "Total"
	TrialBalanceNoteBalanced   = "(Seimbang)"
	TrialBalanceNoteUnbalanced = "(TIDAK SEIMBANG — periksa jurnal)"
	AsOfPeriodFormat           = "Per %s"
	SheetPrintedFormat         = "Dicetak: %s · Nilai dalam IDR"
	MoneyNumberFormat          = "\"Rp\" #,##0;[Red](\"Rp\" #,##0)"
	SheetCompanyFontSize       = 14
	SheetTitleFontSize         = 12
	SheetPrintedFontSize       = 9
	SheetMutedARGB             = "FF64748B"
	SheetHeaderFillARGB        = "FF1E40AF"
	SheetHeaderFontARGB        = "FFFFFFFF"
)

// Laba Rugi & Neraca (tahap 1d): kalimat cetak, pola label periode & pusat
// biaya, pemisah angka id-ID, dan zona waktu bisnis — semuanya dari modul TS
// yang sama dengan layar, PDF, dan lembar sebar TS.
const (
	BusinessTimeZone                        = "Asia/Jakarta"
	PeriodRangeFormat                       = "Periode %s – %s"
	CostCenterPeriodSuffixFormat            = " · Pusat Biaya: %s"
	CostCenterDisplayFormat                 = "%s — %s"
	CostCenterUnassigned                    = "unassigned"
	CostCenterUnassignedLabel               = "Belum ditetapkan"
	NumberGroupSeparatorID                  = "."
	NumberDecimalSeparatorID                = ","
	NumberMinusSignID                       = "-"
	IncomeStatementSheetName                = "Laba Rugi"
	IncomeStatementTitle                    = "Laporan Laba / Rugi"
	IncomeStatementSalesLabel               = "Pendapatan"
	IncomeStatementCogsLabel                = "Beban Pokok Penjualan"
	IncomeStatementOperatingExpenseLabel    = "Beban Operasional"
	IncomeStatementOtherIncomeLabel         = "Pendapatan Lain-lain"
	IncomeStatementOtherExpenseLabel        = "Beban Lain-lain"
	IncomeStatementSectionTotalFormat       = "Total %s"
	IncomeStatementGrossProfitLabel         = "Laba Kotor"
	IncomeStatementOperatingProfitLabel     = "Laba Usaha"
	IncomeStatementNetIncomeLabel           = "Laba / Rugi Bersih"
	IncomeStatementEmptyLabel               = "Tidak ada akun bersaldo pada bagian ini."
	IncomeStatementGrossMarginFormat        = "%s%% dari pendapatan"
	IncomeStatementResultProfit             = "Laba"
	IncomeStatementResultLoss               = "Rugi"
	BalanceSheetSheetName                   = "Neraca"
	BalanceSheetTitle                       = "Neraca"
	BalanceSheetAssetsLabel                 = "Aset"
	BalanceSheetLiabilitiesLabel            = "Liabilitas"
	BalanceSheetEquityLabel                 = "Ekuitas"
	BalanceSheetSectionTotalFormat          = "Total %s"
	BalanceSheetCurrentNetIncomeLabel       = "Akumulasi Laba/Rugi"
	BalanceSheetEmptyLabel                  = "Tidak ada akun bersaldo pada bagian ini."
	BalanceSheetTotalAssetsLabel            = "Total Aset"
	BalanceSheetTotalLiabilitiesEquityLabel = "Total Liabilitas + Ekuitas"
	BalanceSheetNoteBalanced                = "(Seimbang)"
	BalanceSheetNoteUnbalanced              = "(TIDAK SEIMBANG — periksa jurnal)"
	ComparePeriodFormat                     = "%s – %s"
	CompareChangeHeader                     = "Perubahan"
	CompareChangeWidth                      = 14
	ComparePercentPositiveFormat            = "+%s%%"
	ComparePercentFormat                    = "%s%%"
)

// Arus Kas (tahap 1d): kalimat cetak & anotasi rekonsiliasi dari
// `CASH_FLOW_PRINT_LABELS` / `cashFlowReconciliationNote`.
const (
	CashFlowSheetName        = "Laporan Arus Kas"
	CashFlowTitle            = "Laporan Arus Kas"
	CashFlowOpeningLabel     = "Kas & setara kas awal periode"
	CashFlowClosingLabel     = "Kas & setara kas akhir periode"
	CashFlowTotalLabel       = "Kenaikan / Penurunan Kas"
	CashFlowEmptyLabel       = "Tidak ada pergerakan kas pada periode ini."
	CashFlowSubtotalFormat   = "Jumlah %s"
	CashFlowNoteReconciled   = "(cocok dengan buku besar)"
	CashFlowNoteUnreconciled = "(TIDAK COCOK — periksa buku besar)"
)

// CashFlowCategoryLabels: nama kelompok Arus Kas di DOKUMEN CETAK
// (`CASH_FLOW_CATEGORY_LABELS` lewat `CASH_FLOW_PRINT_LABELS.group`).
var CashFlowCategoryLabels = map[CashFlowCategory]string{
	CashFlowCategoryOperating:     "Aktivitas Operasi",
	CashFlowCategoryInvesting:     "Aktivitas Investasi",
	CashFlowCategoryFinancing:     "Aktivitas Pendanaan",
	CashFlowCategoryUncategorised: "Belum Terkategori",
}

// Laporan Perubahan Ekuitas (berkas sejak 23 Okt 2026): kalimat cetak dari
// `EQUITY_STATEMENT_PRINT_LABELS`.
const (
	EquityStatementSheetName     = "Laporan Perubahan Ekuitas"
	EquityStatementTitle         = "Laporan Perubahan Ekuitas"
	EquityStatementUnclosedLabel = "Laba/Rugi Belum Ditutup"
	EquityStatementTotalLabel    = "Total"
)

// Id laporan (katalog TS) yang punya implementasi Go — kunci register
// src/lib/report-engine.ts.
const (
	ReportBalanceSheet        = "balance-sheet"
	ReportBudgetRealization   = "budget-realization"
	ReportCashBank            = "cash-bank"
	ReportCashFlow            = "cash-flow"
	ReportEquityChanges       = "equity-changes"
	ReportIncomeStatement     = "income-statement"
	ReportOpnameHistory       = "opname-history"
	ReportPayables            = "payables"
	ReportPurchasesBySupplier = "purchases-by-supplier"
	ReportReceivables         = "receivables"
	ReportSalesByCustomer     = "sales-by-customer"
	ReportStockMovement       = "stock-movement"
	ReportStockValue          = "stock-value"
	ReportTrialBalance        = "trial-balance"
)

// GoEngineReports: laporan yang BERKAS-nya hari ini dihasilkan Go
// (`engine: "go"`). Pelari menolak pekerjaan untuk laporan di luar himpunan ini.
var GoEngineReports = map[string]bool{
	ReportBalanceSheet:        true,
	ReportBudgetRealization:   true,
	ReportCashBank:            true,
	ReportCashFlow:            true,
	ReportEquityChanges:       true,
	ReportIncomeStatement:     true,
	ReportOpnameHistory:       true,
	ReportPayables:            true,
	ReportPurchasesBySupplier: true,
	ReportReceivables:         true,
	ReportSalesByCustomer:     true,
	ReportStockMovement:       true,
	ReportStockValue:          true,
	ReportTrialBalance:        true,
}

// TrialBalanceColumns: judul (TRIAL_BALANCE_HEADERS) dan lebar
// (TRIAL_BALANCE_WIDTHS) kolom Neraca Saldo, dalam urutan TRIAL_BALANCE_COLUMNS.
var TrialBalanceColumns = []ReportColumn{
	{Header: "Kode", Width: 12},
	{Header: "Nama Akun", Width: 40},
	{Header: "Debit (IDR)", Width: 20},
	{Header: "Kredit (IDR)", Width: 20},
}

// IncomeStatementColumns: judul (INCOME_STATEMENT_HEADERS) dan lebar
// (INCOME_STATEMENT_WIDTHS) kolom Laba Rugi satu periode.
var IncomeStatementColumns = []ReportColumn{
	{Header: "Keterangan", Width: 48},
	{Header: "Jumlah (IDR)", Width: 22},
}

// BalanceSheetColumns: judul (BALANCE_SHEET_HEADERS) dan lebar
// (BALANCE_SHEET_WIDTHS) kolom Neraca satu tanggal.
var BalanceSheetColumns = []ReportColumn{
	{Header: "Keterangan", Width: 48},
	{Header: "Jumlah (IDR)", Width: 22},
}

// CashFlowColumns: judul (CASH_FLOW_HEADERS) dan lebar (CASH_FLOW_WIDTHS)
// kolom Arus Kas, dalam urutan CASH_FLOW_COLUMNS.
var CashFlowColumns = []ReportColumn{
	{Header: "Sumber / Penggunaan Kas", Width: 44},
	{Header: "Kas Masuk (IDR)", Width: 20},
	{Header: "Kas Keluar (IDR)", Width: 20},
	{Header: "Bersih (IDR)", Width: 20},
}

// EquityStatementColumns: judul (EQUITY_STATEMENT_HEADERS) dan lebar
// (EQUITY_STATEMENT_WIDTHS) kolom Laporan Perubahan Ekuitas.
var EquityStatementColumns = []ReportColumn{
	{Header: "Komponen Ekuitas", Width: 44},
	{Header: "Saldo Awal (IDR)", Width: 20},
	{Header: "Penambahan (IDR)", Width: 20},
	{Header: "Pengurangan (IDR)", Width: 20},
	{Header: "Saldo Akhir (IDR)", Width: 20},
}

// MonthNamesID: nama bulan id-ID dari Intl — formatter yang dipakai formatDate.
var MonthNamesID = [12]string{
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
}

// ComparisonModes: kosakata `?compare=` (COMPARISON_MODES,
// src/lib/statement-compare.ts) — kolom pembanding Laba Rugi & Neraca (#557).
var ComparisonModes = map[string]bool{
	"preceding":     true,
	"previous_year": true,
}

// LocaleCompareASCII: urutan `localeCompare` atas ASCII cetak, dari
// Intl.Collator runtime pembangkit — kelompok setara-dasar (huruf besar/kecil),
// berurutan; di dalam kelompok, urutan tersier. Dibaca jscompat.LocaleCompare.
var LocaleCompareASCII = []string{
	" ",
	"_",
	"-",
	",",
	";",
	":",
	"!",
	"?",
	".",
	"'",
	"\"",
	"(",
	")",
	"[",
	"]",
	"{",
	"}",
	"@",
	"*",
	"/",
	"\\",
	"&",
	"#",
	"%",
	"`",
	"^",
	"+",
	"<",
	"=",
	">",
	"|",
	"~",
	"$",
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"aA",
	"bB",
	"cC",
	"dD",
	"eE",
	"fF",
	"gG",
	"hH",
	"iI",
	"jJ",
	"kK",
	"lL",
	"mM",
	"nN",
	"oO",
	"pP",
	"qQ",
	"rR",
	"sS",
	"tT",
	"uU",
	"vV",
	"wW",
	"xX",
	"yY",
	"zZ",
}
