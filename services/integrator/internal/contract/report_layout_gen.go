// DIBANGKITKAN DARI `src/lib/statement-layout.ts`, `src/lib/report-export.ts`,
// dan `@sai/core/constants` — JANGAN DISUNTING TANGAN.
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

// Id laporan (katalog TS) yang punya implementasi Go — kunci register
// src/lib/report-engine.ts.
const (
	ReportTrialBalance = "trial-balance"
)

// GoEngineReports: laporan yang BERKAS-nya hari ini dihasilkan Go
// (`engine: "go"`). Pelari menolak pekerjaan untuk laporan di luar himpunan ini.
var GoEngineReports = map[string]bool{
	ReportTrialBalance: true,
}

// TrialBalanceColumns: judul (TRIAL_BALANCE_HEADERS) dan lebar
// (TRIAL_BALANCE_WIDTHS) kolom Neraca Saldo, dalam urutan TRIAL_BALANCE_COLUMNS.
var TrialBalanceColumns = []ReportColumn{
	{Header: "Kode", Width: 12},
	{Header: "Nama Akun", Width: 40},
	{Header: "Debit (IDR)", Width: 20},
	{Header: "Kredit (IDR)", Width: 20},
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
