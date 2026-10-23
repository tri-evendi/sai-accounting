// DIBANGKITKAN DARI `src/lib/statement-layout.ts`, `src/lib/report-export.ts`,
// `src/lib/report-catalog.ts`, dan `contract/accounting.yaml` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah salah satunya, dan commit
// hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
// berkas ini basi (penjaga `tests/contract-jobs.test.ts`).
//
// Pembacanya `internal/ledgerread/aging.go` (kosakata status pembayaran) dan
// `internal/document/aging.go` (lembar sebar Umur Piutang & Umur Utang). Isi
// lembarnya wajib sama dengan `buildAgingSheet` — dibuktikan
// `bun run parity:receivables-xlsx` dan `bun run parity:payables-xlsx`.

package contract

// AgingColumn adalah satu kolom lembar Umur Piutang/Utang: id katalog (nilai
// `?cols=`), judul, lebar, dan aturan pilihnya (`resolveColumns`).
type AgingColumn struct {
	ID        string
	Header    string
	Width     float64
	Fixed     bool
	DefaultOn bool
}

// Kalimat cetak lembar Umur Piutang/Utang. Pola ber-%d disusun fmt.Sprintf.
const (
	ReceivablesSheetName      = "Piutang & Umur Piutang"
	ReceivablesTitle          = "Piutang & Umur Piutang"
	PayablesSheetName         = "Utang & Umur Utang"
	PayablesTitle             = "Utang & Umur Utang"
	AgingSummaryLabel         = "Ringkasan umur"
	AgingDetailsLabel         = "Rincian dokumen"
	AgingTotalLabel           = "Total"
	AgingNoDueDate            = "-"
	AgingIssueAgeFormat       = "%d *"
	AgingEmptyLabel           = "Tidak ada dokumen yang belum lunas."
	AgingUndatedNote          = "* Umur dihitung dari tanggal dokumen karena tanggal jatuh temponya tidak ada."
	AgingUnresolvedNoteFormat = "%d dokumen valas tanpa kurs tidak punya nilai IDR, jadi tidak ikut dijumlahkan."
	AgingPartyColumn          = "party"
	PayablesDocumentNoFormat  = "TRX-%d"
	ReceivablesNoCustomer     = "Tanpa pelanggan"
)

// ReceivablesColumns: kolom Umur Piutang dalam urutan AGING_COLUMNS.
var ReceivablesColumns = []AgingColumn{
	{ID: "party", Header: "Pelanggan", Width: 30, Fixed: true, DefaultOn: true},
	{ID: "documentNo", Header: "Dokumen", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "date", Header: "Tanggal", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "dueDate", Header: "Jatuh Tempo", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "age", Header: "Umur", Width: 12, Fixed: false, DefaultOn: true},
	{ID: "status", Header: "Status", Width: 24, Fixed: false, DefaultOn: true},
	{ID: "total", Header: "Nilai Dokumen", Width: 18, Fixed: false, DefaultOn: true},
	{ID: "outstanding", Header: "Sisa (IDR)", Width: 20, Fixed: false, DefaultOn: true},
}

// PayablesColumns: kolom Umur Utang dalam urutan AGING_COLUMNS.
var PayablesColumns = []AgingColumn{
	{ID: "party", Header: "Pemasok", Width: 30, Fixed: true, DefaultOn: true},
	{ID: "documentNo", Header: "Dokumen", Width: 20, Fixed: false, DefaultOn: true},
	{ID: "date", Header: "Tanggal", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "dueDate", Header: "Jatuh Tempo", Width: 14, Fixed: false, DefaultOn: true},
	{ID: "age", Header: "Umur", Width: 12, Fixed: false, DefaultOn: true},
	{ID: "status", Header: "Status", Width: 24, Fixed: false, DefaultOn: true},
	{ID: "total", Header: "Nilai Dokumen", Width: 18, Fixed: false, DefaultOn: true},
	{ID: "outstanding", Header: "Sisa (IDR)", Width: 20, Fixed: false, DefaultOn: true},
}

// AgingBucketLabels: label cetak tiap ember (AGING_BUCKET_PRINT_LABELS).
var AgingBucketLabels = map[AgingBucket]string{
	AgingBucketB030:    "0–30 hari",
	AgingBucketB3160:   "31–60 hari",
	AgingBucketB6190:   "61–90 hari",
	AgingBucketB90Plus: "> 90 hari",
}

// PaymentStatus: status pembayaran turunan (`deriveStatus`, receivables.ts) —
// dihitung saat dibaca, tidak pernah disimpan.
type PaymentStatus string

const (
	PaymentStatusPaid    PaymentStatus = "paid"
	PaymentStatusPartial PaymentStatus = "partial"
	PaymentStatusUnpaid  PaymentStatus = "unpaid"
	PaymentStatusOverdue PaymentStatus = "overdue"
)

// PaymentStatusLabels: label cetak tiap status (PAYMENT_STATUS_PRINT_LABELS).
var PaymentStatusLabels = map[PaymentStatus]string{
	PaymentStatusPaid:    "Lunas",
	PaymentStatusPartial: "Sebagian",
	PaymentStatusUnpaid:  "Belum Bayar",
	PaymentStatusOverdue: "Jatuh Tempo",
}
