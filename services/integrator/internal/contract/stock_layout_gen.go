// DIBANGKITKAN DARI `src/lib/statement-layout.ts`, `src/lib/report-export.ts`,
// `src/lib/report-catalog.ts`, dan `@sai/core/constants` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah salah satunya, dan commit
// hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
// berkas ini basi (penjaga `tests/contract-jobs.test.ts`).
//
// Pembacanya `internal/ledgerread/stock.go` (kosakata gerakan stok, penanda
// opname) dan `internal/document/stock.go` (lembar sebar Nilai Persediaan,
// Riwayat Stok, Riwayat Hitung Ulang Stok). Isi lembarnya wajib sama dengan
// `buildStockValueSheet` / `buildStockMovementSheet` / `buildOpnameHistorySheet`
// — dibuktikan `bun run parity:stock-value-xlsx` dst.

package contract

// StockMovementType: kosakata `stock_movements.type` (STOCK_MOVEMENT_TYPES).
type StockMovementType string

// Kosakata gerakan stok.
const (
	StockMovementTypeIn         StockMovementType = "in"
	StockMovementTypeOut        StockMovementType = "out"
	StockMovementTypeProcess    StockMovementType = "process"
	StockMovementTypeCostAdjust StockMovementType = "cost_adjust"
)

// StockColumn adalah satu kolom lembar laporan stok yang bisa dipilih
// `?cols=`: id katalog, judul, lebar, dan aturan pilihnya (`resolveColumns`).
type StockColumn struct {
	ID        string
	Header    string
	Width     float64
	Fixed     bool
	DefaultOn bool
}

// Kalimat cetak laporan stok. Pola ber-%s/%d disusun fmt.Sprintf.
const (
	QuantityNumberFormat           = "#,##0.###;[Red]-#,##0.###"
	OpnameAdjustmentNote           = "Penyesuaian stok opname"
	StockNoUnit                    = "-"
	StockValueSheetName            = "Nilai Persediaan"
	StockValueTitle                = "Nilai Persediaan"
	StockValuePeriodFormat         = "%s — %s"
	StockValueEmptyLabel           = "Belum ada barang."
	StockValueTotalLabel           = "Total Nilai Persediaan"
	StockValueUncostedNoteFormat   = "Catatan: %d barang bersaldo belum punya dasar biaya, jadi nilainya tidak ikut dijumlahkan."
	StockMovementSheetName         = "Kartu Stok"
	StockMovementTitle             = "Kartu Stok / Mutasi Persediaan"
	StockMovementEmptyLabel        = "Tidak ada mutasi pada periode ini."
	StockMovementTotalLabel        = "Total"
	StockMovementDormantNoteFormat = "Catatan: %d barang tanpa saldo awal dan tanpa mutasi tidak ditampilkan."
	OpnameHistorySheetName         = "Riwayat Opname"
	OpnameHistoryTitle             = "Riwayat Hitung Ulang Stok (Stok Opname)"
	OpnameHistoryEmptyLabel        = "Tidak ada hitung ulang stok pada periode ini."
	OpnameItemIndent               = "   "
	OpnameSessionFormat            = "Hitung ulang %s"
	OpnameSummaryFormat            = "%[1]d kali hitung ulang · %[2]d penyesuaian · Selisih bersih"
)

// StockValueColumns: kolom Nilai Persediaan dalam urutan STOCK_VALUE_COLUMNS.
var StockValueColumns = []StockColumn{
	{ID: "code", Header: "Kode Barang", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "name", Header: "Barang", Width: 34, Fixed: true, DefaultOn: true},
	{ID: "unit", Header: "Satuan", Width: 12, Fixed: false, DefaultOn: true},
	{ID: "openingQty", Header: "Kts Awal", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "openingValue", Header: "Nilai Awal (IDR)", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "inQty", Header: "Kts Masuk", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "inValue", Header: "Nilai Masuk (IDR)", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "outQty", Header: "Kts Keluar", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "outValue", Header: "Nilai Keluar (IDR)", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "closingQty", Header: "Kts Akhir", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "closingValue", Header: "Nilai Akhir (IDR)", Width: 22, Fixed: false, DefaultOn: true},
}

// StockMovementColumns: kolom Riwayat Stok dalam urutan STOCK_MOVEMENT_COLUMNS.
var StockMovementColumns = []StockColumn{
	{ID: "name", Header: "Barang", Width: 34, Fixed: true, DefaultOn: true},
	{ID: "unit", Header: "Satuan", Width: 12, Fixed: false, DefaultOn: true},
	{ID: "opening", Header: "Saldo Awal", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "movedIn", Header: "Masuk", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "movedOut", Header: "Keluar", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "processed", Header: "Diolah", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "closing", Header: "Saldo Akhir", Width: 14, Fixed: false, DefaultOn: true},
}

// OpnameHistoryColumns: judul & lebar kolom Riwayat Hitung Ulang Stok
// (OPNAME_HISTORY_COLUMNS).
var OpnameHistoryColumns = []ReportColumn{
	{Header: "Tanggal / Barang", Width: 40},
	{Header: "Satuan", Width: 12},
	{Header: "Lebih", Width: 16},
	{Header: "Susut", Width: 16},
}
