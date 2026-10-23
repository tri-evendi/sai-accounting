package document

import (
	"fmt"
	"strings"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ LEMBAR SEBAR LAPORAN STOK — PADANAN `buildStockValueSheet`,
// `buildStockMovementSheet`, `buildOpnameHistorySheet` ══════════════════════
//
// Setiap butir di bawah adalah perilaku TS yang wajib sama (dibuktikan
// `bun run parity:stock-value-xlsx` dst. dan berkas emas di setiap verify):
//
//  1. Kolom tampil = `resolveColumns(report, ?cols=)` lalu `selectColumns`
//     (kolom `name` selalu). Riwayat Stok membuang kolom "Diolah" lebih dulu
//     bila periodenya tanpa mutasi olah — pilihan pengguna hanya MENGURANGI.
//  2. Kuantitas adalah ANGKA berformat kuantitas (`#,##0.###`), rata kanan;
//     nilai Nilai Persediaan berformat rupiah. Nilai tanpa dasar biaya: sel
//     KOSONG, bukan nol. Satuan kosong → "-".
//  3. Angka ditulis seperti `String(x)` JS (`jscompat.NumberString`) — float
//     apa adanya, termasuk sisa seperti 5,55e-17 yang lahir dari penjumlahan
//     TS (lihat kepala `ledgerread/stock.go`).
//  4. Kalimat kosong, baris total, dan catatan kaki di kolom PERTAMA; kolom
//     lain sel kosong.

// quantityCell: angka kuantitas — format kuantitas, rata kanan.
func quantityCell(v float64, bold bool) Cell {
	return NumberCell(jscompat.NumberString(v), Style{
		NumFmt: contract.QuantityNumberFormat,
		HAlign: "right",
		Font:   Font{Bold: bold},
	})
}

// moneyFloat: angka uang float (Nilai Persediaan menghitung dalam float TS).
func moneyFloat(v float64, bold bool) Cell {
	return NumberCell(jscompat.NumberString(v), Style{
		NumFmt: contract.MoneyNumberFormat,
		HAlign: "right",
		Font:   Font{Bold: bold},
	})
}

// unitText: `unit || "-"`.
func unitText(u *string) string {
	if u == nil || *u == "" {
		return contract.StockNoUnit
	}
	return *u
}

// StockVisibleColumns: `resolveColumns(report, raw)` → `selectColumns(available,
// visible, "name")`. `available` = kolom yang ADA di laporan ini (Riwayat Stok:
// "Diolah" hanya bila periodenya punya mutasi olah).
func StockVisibleColumns(specs []contract.StockColumn, raw string, available func(id string) bool) []contract.StockColumn {
	known := map[string]bool{}
	for _, c := range specs {
		known[c.ID] = true
	}
	wanted := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		if id := jscompat.Trim(part); id != "" && known[id] {
			wanted[id] = true
		}
	}
	visible := map[string]bool{}
	for _, c := range specs {
		if c.Fixed || (len(wanted) == 0 && c.DefaultOn) || wanted[c.ID] {
			visible[c.ID] = true
		}
	}
	var out []contract.StockColumn
	for _, c := range specs {
		if !available(c.ID) {
			continue
		}
		// `selectColumns`: daftar tampil yang KOSONG berarti seluruhnya — hanya
		// mungkin bila katalog tak punya satu kolom pun yang tampil.
		if len(visible) == 0 || c.ID == "name" || visible[c.ID] {
			out = append(out, c)
		}
	}
	return out
}

func reportColumns(cols []contract.StockColumn) []contract.ReportColumn {
	out := make([]contract.ReportColumn, len(cols))
	for i, c := range cols {
		out[i] = contract.ReportColumn{Header: c.Header, Width: c.Width}
	}
	return out
}

// noteRow: kalimat di kolom pertama, sisanya sel kosong.
func noteRow(n int, label string, bold bool) []Cell {
	row := make([]Cell, n)
	row[0] = text(label, bold)
	for i := 1; i < n; i++ {
		row[i] = EmptyCell()
	}
	return row
}

// ── Riwayat Stok / Kartu Stok ──────────────────────────────────────────────

// StockMovementSheet memetakan Kartu Stok ke satu lembar. MURNI.
func StockMovementSheet(rep *ledgerread.StockMovementReport, rawCols, companyName, period string, printedAt time.Time) (Sheet, error) {
	cols := StockVisibleColumns(contract.StockMovementColumns, rawCols, func(id string) bool {
		return id != "processed" || rep.HasProcess
	})
	if len(cols) == 0 {
		return Sheet{}, fmt.Errorf("lembar kartu stok tanpa kolom")
	}
	rows, widths := banner(companyName, contract.StockMovementTitle, period, printedAt, reportColumns(cols))
	n := len(cols)

	qty := func(r ledgerread.StockMovementRow, id string) (float64, error) {
		switch id {
		case "opening":
			return r.Opening, nil
		case "movedIn":
			return r.MovedIn, nil
		case "movedOut":
			return r.MovedOut, nil
		case "processed":
			return r.Processed, nil
		case "closing":
			return r.Closing, nil
		}
		return 0, fmt.Errorf("kolom kartu stok %q tidak dikenal", id)
	}
	if len(rep.Rows) == 0 {
		rows = append(rows, noteRow(n, contract.StockMovementEmptyLabel, false))
	}
	for _, r := range rep.Rows {
		row := make([]Cell, n)
		for i, c := range cols {
			switch c.ID {
			case "name":
				row[i] = text(r.Name, false)
			case "unit":
				row[i] = text(unitText(r.Unit), false)
			default:
				v, err := qty(r, c.ID)
				if err != nil {
					return Sheet{}, err
				}
				row[i] = quantityCell(v, false)
			}
		}
		rows = append(rows, row)
	}

	totals := map[string]float64{
		"opening": rep.TotalOpening, "movedIn": rep.TotalIn, "movedOut": rep.TotalOut,
		"processed": rep.TotalProcessed, "closing": rep.TotalClosing,
	}
	total := make([]Cell, n)
	for i, c := range cols {
		switch c.ID {
		case "name":
			total[i] = text(contract.StockMovementTotalLabel, true)
		case "unit":
			total[i] = EmptyCell()
		default:
			total[i] = quantityCell(totals[c.ID], true)
		}
	}
	rows = append(rows, total)

	if rep.DormantCount > 0 {
		rows = append(rows, noteRow(n, fmt.Sprintf(contract.StockMovementDormantNoteFormat, rep.DormantCount), false))
	}
	return Sheet{Name: contract.StockMovementSheetName, ColumnWidths: widths, Rows: rows}, nil
}

// StockMovementWorkbook merakit berkas .xlsx Kartu Stok.
func StockMovementWorkbook(rep *ledgerread.StockMovementReport, rawCols, companyName, period string, printedAt time.Time) ([]byte, error) {
	sheet, err := StockMovementSheet(rep, rawCols, companyName, period, printedAt)
	if err != nil {
		return nil, err
	}
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{sheet}}
	return wb.Bytes()
}

// ── Nilai Persediaan ───────────────────────────────────────────────────────

// StockValuePeriod: label periode Nilai Persediaan — `stockValuePeriodLabel(
// formatDate(from), formatDate(to))` atas tanggal ISO yang SUDAH diselesaikan
// penerbit (`resolvePeriod`).
func StockValuePeriod(from, to string) (string, error) {
	f, err := dateTextID(from)
	if err != nil {
		return "", err
	}
	t, err := dateTextID(to)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(contract.StockValuePeriodFormat, f, t), nil
}

func stockValueCell(r ledgerread.StockValueRow, id string) (Cell, error) {
	value := func(v *float64) Cell {
		if v == nil {
			return EmptyCell()
		}
		return moneyFloat(*v, false)
	}
	switch id {
	case "code":
		return text(r.Code, false), nil
	case "name":
		return text(r.Name, false), nil
	case "unit":
		return text(unitText(r.Unit), false), nil
	case "openingQty":
		return quantityCell(r.OpeningQty, false), nil
	case "inQty":
		return quantityCell(r.InQty, false), nil
	case "outQty":
		return quantityCell(r.OutQty, false), nil
	case "closingQty":
		return quantityCell(r.ClosingQty, false), nil
	case "openingValue":
		return value(r.OpeningValue), nil
	case "inValue":
		return value(r.InValue), nil
	case "outValue":
		return value(r.OutValue), nil
	case "closingValue":
		return value(r.ClosingValue), nil
	}
	return Cell{}, fmt.Errorf("kolom nilai persediaan %q tidak dikenal", id)
}

// StockValueSheet memetakan Nilai Persediaan ke satu lembar. MURNI.
func StockValueSheet(rep *ledgerread.StockValueReport, rawCols, companyName, period string, printedAt time.Time) (Sheet, error) {
	cols := StockVisibleColumns(contract.StockValueColumns, rawCols, func(string) bool { return true })
	if len(cols) == 0 {
		return Sheet{}, fmt.Errorf("lembar nilai persediaan tanpa kolom")
	}
	rows, widths := banner(companyName, contract.StockValueTitle, period, printedAt, reportColumns(cols))
	n := len(cols)

	if len(rep.Rows) == 0 {
		rows = append(rows, noteRow(n, contract.StockValueEmptyLabel, false))
	}
	for _, r := range rep.Rows {
		row := make([]Cell, n)
		for i, c := range cols {
			cell, err := stockValueCell(r, c.ID)
			if err != nil {
				return Sheet{}, err
			}
			row[i] = cell
		}
		rows = append(rows, row)
	}

	total := make([]Cell, n)
	for i, c := range cols {
		switch c.ID {
		case "name":
			total[i] = text(contract.StockValueTotalLabel, true)
		case "closingValue":
			// Nilai pada AKHIR periode (`totalValue` = `totalClosingValue`).
			total[i] = moneyFloat(rep.TotalClosingValue, true)
		default:
			total[i] = EmptyCell()
		}
	}
	rows = append(rows, total)

	if rep.UncostedCount > 0 {
		rows = append(rows, noteRow(n, fmt.Sprintf(contract.StockValueUncostedNoteFormat, rep.UncostedCount), false))
	}
	return Sheet{Name: contract.StockValueSheetName, ColumnWidths: widths, Rows: rows}, nil
}

// StockValueWorkbook merakit berkas .xlsx Nilai Persediaan.
func StockValueWorkbook(rep *ledgerread.StockValueReport, rawCols, companyName, period string, printedAt time.Time) ([]byte, error) {
	sheet, err := StockValueSheet(rep, rawCols, companyName, period, printedAt)
	if err != nil {
		return nil, err
	}
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{sheet}}
	return wb.Bytes()
}

// ── Riwayat Hitung Ulang Stok ──────────────────────────────────────────────

// opnameDateText: `opnameSheetDate` — Intl id-ID { day: "2-digit", month:
// "long", year: "numeric" } atas tanggal kalender ISO ("05 Januari 2026").
func opnameDateText(iso string) (string, error) {
	if isoDate.FindStringSubmatch(iso) == nil {
		return "", fmt.Errorf("tanggal %q bukan YYYY-MM-DD", iso)
	}
	t, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return "", fmt.Errorf("tanggal %q tidak sah: %w", iso, err)
	}
	return fmt.Sprintf("%02d %s %d", t.Day(), contract.MonthNamesID[t.Month()-1], t.Year()), nil
}

// OpnameHistorySheet memetakan Riwayat Hitung Ulang Stok ke satu lembar. MURNI.
func OpnameHistorySheet(h *ledgerread.OpnameHistory, companyName, period string, printedAt time.Time) (Sheet, error) {
	rows, widths := banner(companyName, contract.OpnameHistoryTitle, period, printedAt, contract.OpnameHistoryColumns)
	first := len(rows)
	for _, s := range h.Sessions {
		d, err := opnameDateText(s.DateISO)
		if err != nil {
			return Sheet{}, err
		}
		rows = append(rows, []Cell{
			text(fmt.Sprintf(contract.OpnameSessionFormat, d), true), EmptyCell(),
			quantityCell(s.Increase, true), quantityCell(s.Decrease, true),
		})
		for _, a := range s.Adjustments {
			inc, dec := EmptyCell(), EmptyCell()
			if a.Variance > 0 {
				inc = quantityCell(a.Variance, false)
			}
			if a.Variance < 0 {
				dec = quantityCell(-a.Variance, false)
			}
			rows = append(rows, []Cell{text(contract.OpnameItemIndent+a.ItemName, false), text(unitText(a.Unit), false), inc, dec})
		}
	}
	if len(rows) == first {
		rows = append(rows, noteRow(4, contract.OpnameHistoryEmptyLabel, false))
	}
	inc, dec := EmptyCell(), EmptyCell()
	if h.NetVariance >= 0 {
		inc = quantityCell(h.NetVariance, true)
	}
	if h.NetVariance < 0 {
		dec = quantityCell(-h.NetVariance, true)
	}
	rows = append(rows, []Cell{
		text(fmt.Sprintf(contract.OpnameSummaryFormat, h.SessionCount, h.AdjustmentCount), true), EmptyCell(), inc, dec,
	})
	return Sheet{Name: contract.OpnameHistorySheetName, ColumnWidths: widths, Rows: rows}, nil
}

// OpnameHistoryWorkbook merakit berkas .xlsx Riwayat Hitung Ulang Stok.
func OpnameHistoryWorkbook(h *ledgerread.OpnameHistory, companyName, period string, printedAt time.Time) ([]byte, error) {
	sheet, err := OpnameHistorySheet(h, companyName, period, printedAt)
	if err != nil {
		return nil, err
	}
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{sheet}}
	return wb.Bytes()
}
