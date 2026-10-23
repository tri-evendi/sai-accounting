// DIBANGKITKAN DARI `src/lib/statement-layout.ts`, `src/lib/report-export.ts`,
// `src/lib/report-catalog.ts`, dan `src/lib/budget.ts` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah salah satunya, dan commit
// hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
// berkas ini basi (penjaga `tests/contract-jobs.test.ts`).
//
// Pembacanya `internal/ledgerread` (kosakata & ambang variansi anggaran) dan
// `internal/document` (lembar sebar Penjualan per Pelanggan, Pembelian per
// Pemasok, Laporan Kas & Bank, Realisasi vs Anggaran). Isi lembarnya wajib sama
// dengan `buildPartyRecapSheet` / `buildCashBankSheet` / `buildBudgetSheet` —
// dibuktikan `bun run parity:<laporan>-xlsx`.

package contract

// CatalogColumn adalah satu kolom lembar yang BERPILIHAN kolom (`?cols=`):
// id katalog, judul, lebar, dan aturan pilihnya (`resolveColumns`).
type CatalogColumn struct {
	ID        string
	Header    string
	Width     float64
	Fixed     bool
	DefaultOn bool
}

// Kalimat cetak Rekap per Pihak, Kas & Bank, dan Realisasi vs Anggaran. Pola
// ber-%d / %s disusun fmt.Sprintf; nilainya dibangkitkan dengan memanggil
// fungsi TS-nya.
const (
	SalesByCustomerSheetName     = "Penjualan per Pelanggan"
	SalesByCustomerTitle         = "Penjualan per Pelanggan"
	SalesByCustomerNoParty       = "Tanpa pelanggan"
	PurchasesBySupplierSheetName = "Pembelian per Pemasok"
	PurchasesBySupplierTitle     = "Pembelian per Pemasok"
	PurchasesBySupplierNoParty   = "Tanpa pemasok"
	PartyRecapEmptyLabel         = "Tidak ada dokumen pada periode ini."
	PartyRecapUnratedNoteFormat  = "Catatan: %d dokumen valas tanpa kurs tidak ikut dijumlahkan."
	RecapTotalLabel              = "Total"
	CashBankSheetName            = "Laporan Kas & Bank"
	CashBankTitle                = "Laporan Kas & Bank"
	CashBankEmptyLabel           = "Tidak ada akun kas & bank yang bergerak pada periode ini."
	BudgetSheetName              = "Realisasi vs Anggaran"
	BudgetTitle                  = "Realisasi vs Anggaran"
	BudgetEmptyLabel             = "Belum ada anggaran untuk periode ini."
	BudgetSalesTargetLabel       = "Target Penjualan"
	BudgetPeriodSalesLabel       = "Total penjualan periode ini"
	BudgetAlertNoteFormat        = "%d akun melewati ambang"
	BudgetWholeYearFormat        = "Tahun %d"
	BudgetMonthFormat            = "%s %d"
	BudgetVarianceThresholdPct   = 10
)

// SalesByCustomerColumns: kolom Penjualan per Pelanggan, urutan katalog.
var SalesByCustomerColumns = []CatalogColumn{
	{ID: "party", Header: "Pelanggan", Width: 36, Fixed: true, DefaultOn: true},
	{ID: "docCount", Header: "Dokumen", Width: 12, Fixed: false, DefaultOn: true},
	{ID: "gross", Header: "Penjualan Kotor (IDR)", Width: 22, Fixed: false, DefaultOn: true},
	{ID: "returns", Header: "Retur (IDR)", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "net", Header: "Bersih (IDR)", Width: 22, Fixed: false, DefaultOn: true},
}

// PurchasesBySupplierColumns: kolom Pembelian per Pemasok, urutan katalog.
var PurchasesBySupplierColumns = []CatalogColumn{
	{ID: "party", Header: "Pemasok", Width: 36, Fixed: true, DefaultOn: true},
	{ID: "docCount", Header: "Dokumen", Width: 12, Fixed: false, DefaultOn: true},
	{ID: "gross", Header: "Pembelian Kotor (IDR)", Width: 22, Fixed: false, DefaultOn: true},
	{ID: "returns", Header: "Retur (IDR)", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "net", Header: "Bersih (IDR)", Width: 22, Fixed: false, DefaultOn: true},
}

// CashBankColumns: kolom Laporan Kas & Bank, urutan katalog.
var CashBankColumns = []CatalogColumn{
	{ID: "account", Header: "Akun Kas & Bank", Width: 40, Fixed: true, DefaultOn: true},
	{ID: "opening", Header: "Saldo Awal (IDR)", Width: 22, Fixed: false, DefaultOn: true},
	{ID: "net", Header: "Perubahan (IDR)", Width: 22, Fixed: false, DefaultOn: true},
	{ID: "closing", Header: "Saldo Akhir (IDR)", Width: 22, Fixed: false, DefaultOn: true},
}

// BudgetColumns: judul (BUDGET_HEADERS) dan lebar (BUDGET_WIDTHS) kolom
// Realisasi vs Anggaran — tanpa pilihan kolom.
var BudgetColumns = []ReportColumn{
	{Header: "Akun", Width: 40},
	{Header: "Anggaran (IDR)", Width: 20},
	{Header: "Realisasi (IDR)", Width: 20},
	{Header: "Selisih (IDR)", Width: 20},
	{Header: "Selisih %", Width: 14},
	{Header: "Keterangan", Width: 22},
}

// BudgetMonthNamesID: nama bulan cetak (BUDGET_MONTH_NAMES_ID), Januari dulu.
var BudgetMonthNamesID = [12]string{
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

// BudgetVarianceStatus: arah selisih realisasi terhadap anggaran
// (`VarianceStatus`, budget.ts) — dihitung saat dibaca, tidak disimpan.
type BudgetVarianceStatus string

const (
	BudgetVarianceOver     BudgetVarianceStatus = "over"
	BudgetVarianceUnder    BudgetVarianceStatus = "under"
	BudgetVarianceOnTarget BudgetVarianceStatus = "on_target"
)

// BudgetVarianceStatusLabels: kata cetak tiap arah (VARIANCE_STATUS_TEXT).
var BudgetVarianceStatusLabels = map[BudgetVarianceStatus]string{
	BudgetVarianceOver:     "Di atas anggaran",
	BudgetVarianceUnder:    "Di bawah anggaran",
	BudgetVarianceOnTarget: "Sesuai anggaran",
}
