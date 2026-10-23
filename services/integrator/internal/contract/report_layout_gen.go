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

// Id laporan (katalog TS) yang punya implementasi Go — kunci register
// src/lib/report-engine.ts.
const (
	ReportBalanceSheet    = "balance-sheet"
	ReportIncomeStatement = "income-statement"
	ReportPayables        = "payables"
	ReportReceivables     = "receivables"
	ReportTrialBalance    = "trial-balance"
)

// GoEngineReports: laporan yang BERKAS-nya hari ini dihasilkan Go
// (`engine: "go"`). Pelari menolak pekerjaan untuk laporan di luar himpunan ini.
var GoEngineReports = map[string]bool{
	ReportBalanceSheet:    true,
	ReportIncomeStatement: true,
	ReportTrialBalance:    true,
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
