package document

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ LEMBAR SEBAR UMUR PIUTANG / UMUR UTANG — PADANAN `buildAgingSheet` ═════
//
// Setiap butir di bawah adalah perilaku TS yang wajib sama (dibuktikan
// `bun run parity:receivables-xlsx` / `parity:payables-xlsx`):
//
//  1. Kepala lembar seperti laporan lain (`banner`), kolom = kolom yang
//     dipilih `?cols=` (`resolveColumns` → `agingColumns`; kolom pihak selalu).
//  2. Blok "Ringkasan umur": satu baris per ember, lalu Total (tebal) — label
//     di kolom PERTAMA, nilai di kolom TERAKHIR. Dengan SATU kolom tampil,
//     nilainya hilang (sel terakhir = sel label), persis TS.
//  3. Baris kosong, lalu "Rincian dokumen"; buku tanpa dokumen terbuka
//     mendapat satu kalimat.
//  4. Umur dari tanggal dokumen (jatuh tempo kosong) adalah TEKS berbintang;
//     selainnya ANGKA. Nilai dokumen: angka dalam mata uangnya sendiri, tanpa
//     format rupiah. Sisa valas tanpa kurs: sel KOSONG, bukan nol.
//  5. Catatan kaki: umur dari tanggal dokumen, lalu jumlah dokumen tanpa
//     nilai IDR — masing-masing hanya bila berlaku.

// AgingVisibleColumns: `resolveColumns(report, raw)` lalu `agingColumns` —
// kolom yang tampil, dalam urutan katalog. Id tak dikenal diabaikan; tanpa
// satu pun id sah, kolom bawaan (`defaultOn`) yang tampil.
func AgingVisibleColumns(specs []contract.AgingColumn, raw string) []contract.AgingColumn {
	wanted := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		id := jscompat.Trim(part)
		if id == "" {
			continue
		}
		for _, c := range specs {
			if c.ID == id {
				wanted[id] = true
			}
		}
	}
	var out []contract.AgingColumn
	for _, c := range specs {
		if c.Fixed || (len(wanted) == 0 && c.DefaultOn) || wanted[c.ID] {
			out = append(out, c)
		}
	}
	return out
}

// decimalCell: angka TANPA format uang (nilai dokumen dalam mata uangnya
// sendiri, kolomnya bercampur mata uang).
func decimalCell(d ledgerread.Decimal) Cell {
	return NumberCell(d.String(), Style{HAlign: "right"})
}

// AgingSheet memetakan Umur Piutang/Utang ke satu lembar. MURNI.
func AgingSheet(rep *ledgerread.AgingReport, cols []contract.AgingColumn, companyName, period string, printedAt time.Time) (Sheet, error) {
	var sheetName, title string
	switch rep.Kind {
	case "receivables":
		sheetName, title = contract.ReceivablesSheetName, contract.ReceivablesTitle
	case "payables":
		sheetName, title = contract.PayablesSheetName, contract.PayablesTitle
	default:
		return Sheet{}, fmt.Errorf("laporan umur %q tidak dikenal", rep.Kind)
	}
	if len(cols) == 0 {
		return Sheet{}, fmt.Errorf("lembar umur tanpa kolom")
	}
	columns := make([]contract.ReportColumn, len(cols))
	for i, c := range cols {
		columns[i] = contract.ReportColumn{Header: c.Header, Width: c.Width}
	}
	rows, widths := banner(companyName, title, period, printedAt, columns)

	n := len(cols)
	pad := func(cells ...Cell) []Cell {
		row := append([]Cell(nil), cells...)
		for len(row) < n {
			row = append(row, EmptyCell())
		}
		return row[:n]
	}
	summary := func(label, value Cell) []Cell {
		if n == 1 {
			return []Cell{label}
		}
		row := pad(label)
		row[n-1] = value
		return row
	}

	rows = append(rows, pad(text(contract.AgingSummaryLabel, true)))
	for _, b := range rep.Buckets {
		rows = append(rows, summary(text(contract.AgingBucketLabels[b.Bucket], false), money(b.Amount, false)))
	}
	rows = append(rows, summary(text(contract.AgingTotalLabel, true), money(rep.Total, true)))
	rows = append(rows, pad())
	rows = append(rows, pad(text(contract.AgingDetailsLabel, true)))
	if len(rep.Rows) == 0 {
		rows = append(rows, pad(text(contract.AgingEmptyLabel, false)))
	}

	anyFromIssue := false
	for _, r := range rep.Rows {
		if r.AgeFromIssue {
			anyFromIssue = true
		}
		row := make([]Cell, n)
		for i, c := range cols {
			cell, err := agingCell(r, c.ID)
			if err != nil {
				return Sheet{}, err
			}
			row[i] = cell
		}
		rows = append(rows, row)
	}

	var notes []string
	if anyFromIssue {
		notes = append(notes, contract.AgingUndatedNote)
	}
	if rep.Unresolved > 0 {
		notes = append(notes, fmt.Sprintf(contract.AgingUnresolvedNoteFormat, rep.Unresolved))
	}
	if len(notes) > 0 {
		rows = append(rows, pad())
		for _, note := range notes {
			rows = append(rows, pad(text(note, false)))
		}
	}
	return Sheet{Name: sheetName, ColumnWidths: widths, Rows: rows}, nil
}

func agingCell(r ledgerread.AgingDocument, id string) (Cell, error) {
	switch id {
	case "party":
		return text(r.PartyName, false), nil
	case "documentNo":
		return text(r.DocumentNo, false), nil
	case "date":
		d, err := businessDateText(r.Date)
		if err != nil {
			return Cell{}, err
		}
		return text(d, false), nil
	case "dueDate":
		if r.DueDate == nil {
			return text(contract.AgingNoDueDate, false), nil
		}
		d, err := businessDateText(*r.DueDate)
		if err != nil {
			return Cell{}, err
		}
		return text(d, false), nil
	case "age":
		if r.AgeFromIssue {
			return TextCell(fmt.Sprintf(contract.AgingIssueAgeFormat, r.AgeDays), Style{HAlign: "right"}), nil
		}
		return NumberCell(strconv.Itoa(r.AgeDays), Style{HAlign: "right"}), nil
	case "status":
		return text(contract.PaymentStatusLabels[r.Status], false), nil
	case "total":
		return decimalCell(r.Total), nil
	case "outstanding":
		if r.OutstandingBase == nil {
			return EmptyCell(), nil
		}
		return money(*r.OutstandingBase, false), nil
	}
	return Cell{}, fmt.Errorf("kolom umur %q tidak dikenal", id)
}

// AgingWorkbook merakit berkas .xlsx Umur Piutang/Utang.
func AgingWorkbook(rep *ledgerread.AgingReport, cols []contract.AgingColumn, companyName, period string, printedAt time.Time) ([]byte, error) {
	sheet, err := AgingSheet(rep, cols, companyName, period, printedAt)
	if err != nil {
		return nil, err
	}
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{sheet}}
	return wb.Bytes()
}

// AgingColumnsFor: daftar kolom katalog laporan umur.
func AgingColumnsFor(kind string) ([]contract.AgingColumn, error) {
	switch kind {
	case "receivables":
		return contract.ReceivablesColumns, nil
	case "payables":
		return contract.PayablesColumns, nil
	}
	return nil, fmt.Errorf("laporan umur %q tidak dikenal", kind)
}

// AgingTitle: judul dokumen (nama berkas) laporan umur.
func AgingTitle(kind string) string {
	if kind == "payables" {
		return contract.PayablesTitle
	}
	return contract.ReceivablesTitle
}
