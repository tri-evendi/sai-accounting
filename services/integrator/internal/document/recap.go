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

// ══ LEMBAR SEBAR REKAP PER PIHAK, KAS & BANK, REALISASI VS ANGGARAN ═══════
//
// Padanan `buildPartyRecapSheet`, `buildCashBankSheet`, dan `buildBudgetSheet`
// (`src/lib/report-export.ts`). Setiap butir di bawah adalah perilaku TS yang
// wajib sama — dibuktikan `bun run parity:<laporan>-xlsx` dan berkas emas:
//
//  1. Kepala lembar seperti laporan lain (`banner`); kolom = kolom yang dipilih
//     `?cols=` (`resolveColumns` → `selectColumns`, kolom pertama selalu) —
//     kecuali Realisasi vs Anggaran, yang tanpa pilihan kolom.
//  2. Laporan tanpa baris mendapat SATU kalimat di kolom pertama; baris Total
//     (tebal) tetap ada.
//  3. Rekap per Pihak: jumlah dokumen ANGKA tanpa format rupiah (cacah, bukan
//     uang); retur ditulis NEGATIF (pengurang), nol bila tidak positif; pihak
//     yang tak tercatat diberi nama; dokumen valas tanpa kurs disebut di kaki.
//  4. Kas & Bank: total kolom "Perubahan" = perubahan bersih ARUS KAS
//     (`netChange`), bukan selisih saldo — sama dengan TS.
//  5. Realisasi vs Anggaran: persen selisih ANGKA (bisa diurutkan), sel KOSONG
//     bila anggaran nol; keterangan baris Total menyebut jumlah akun di luar
//     ambang; target penjualan (bila ada) di blok sendiri sesudah satu baris
//     kosong.
//  6. Sel yang TIDAK BERLAKU = sel kosong (`text(null)` TS) — gayanya tidak
//     dibandingkan paritas isi, tetapi tebalnya ikut supaya bentuknya sama.

// CatalogVisibleColumns: `resolveColumns(report, raw)` lalu `selectColumns` —
// kolom yang tampil, dalam urutan katalog. Id tak dikenal diabaikan; tanpa
// satu pun id sah, kolom bawaan (`defaultOn`) yang tampil; kolom `Fixed`
// selalu tampil.
func CatalogVisibleColumns(specs []contract.CatalogColumn, raw string) []contract.CatalogColumn {
	wanted := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		id := jscompat.Trim(part)
		for _, c := range specs {
			if id != "" && c.ID == id {
				wanted[id] = true
			}
		}
	}
	var out []contract.CatalogColumn
	for _, c := range specs {
		if c.Fixed || (len(wanted) == 0 && c.DefaultOn) || wanted[c.ID] {
			out = append(out, c)
		}
	}
	return out
}

func catalogHeaders(cols []contract.CatalogColumn) []contract.ReportColumn {
	out := make([]contract.ReportColumn, len(cols))
	for i, c := range cols {
		out[i] = contract.ReportColumn{Header: c.Header, Width: c.Width}
	}
	return out
}

// blank: `text(null, bold)` TS — sel kosong yang membawa tebalnya.
func blank(bold bool) Cell {
	return Cell{Kind: CellEmpty, Style: Style{Font: Font{Bold: bold}}}
}

// textOrBlank: `text(s, bold)` — string kosong adalah sel kosong.
func textOrBlank(s string, bold bool) Cell {
	if s == "" {
		return blank(bold)
	}
	return text(s, bold)
}

// count: `{ value, align: "right", bold }` — ANGKA tanpa format rupiah.
func count(n int, bold bool) Cell {
	return NumberCell(strconv.Itoa(n), Style{HAlign: "right", Font: Font{Bold: bold}})
}

// sentenceRow: satu kalimat di kolom pertama, sisanya kosong.
func sentenceRow(s string, n int) []Cell {
	row := []Cell{text(s, false)}
	for len(row) < n {
		row = append(row, blank(false))
	}
	return row
}

// ═══ REKAP PER PIHAK ═════════════════════════════════════════════════════

// PartyRecapColumnsFor: daftar kolom katalog rekap pihak.
func PartyRecapColumnsFor(kind string) ([]contract.CatalogColumn, error) {
	switch kind {
	case contract.ReportSalesByCustomer:
		return contract.SalesByCustomerColumns, nil
	case contract.ReportPurchasesBySupplier:
		return contract.PurchasesBySupplierColumns, nil
	}
	return nil, fmt.Errorf("rekap pihak %q tidak dikenal", kind)
}

// PartyRecapTitle: judul dokumen (nama berkas) rekap pihak.
func PartyRecapTitle(kind string) string {
	if kind == contract.ReportPurchasesBySupplier {
		return contract.PurchasesBySupplierTitle
	}
	return contract.SalesByCustomerTitle
}

type partyRecapCells struct {
	label                      string
	docCount                   int
	gross, returnBase, netBase ledgerread.Cents
}

func partyRecapCell(r partyRecapCells, id string, bold bool) (Cell, error) {
	switch id {
	case "party":
		return text(r.label, bold), nil
	case "docCount":
		return count(r.docCount, bold), nil
	case "gross":
		return money(r.gross, bold), nil
	case "returns":
		// Retur = pengurang, dan tandanya yang menyatakannya — bukan warna.
		if r.returnBase > 0 {
			return money(-r.returnBase, bold), nil
		}
		return money(0, bold), nil
	case "net":
		return money(r.netBase, bold), nil
	}
	return Cell{}, fmt.Errorf("kolom rekap pihak %q tidak dikenal", id)
}

// PartyRecapSheet memetakan rekap pihak ke satu lembar. MURNI.
func PartyRecapSheet(rep *ledgerread.PartyRecap, cols []contract.CatalogColumn, companyName, period string, printedAt time.Time) (Sheet, error) {
	var sheetName, title, noParty string
	switch rep.Kind {
	case contract.ReportSalesByCustomer:
		sheetName, title, noParty = contract.SalesByCustomerSheetName, contract.SalesByCustomerTitle, contract.SalesByCustomerNoParty
	case contract.ReportPurchasesBySupplier:
		sheetName, title, noParty = contract.PurchasesBySupplierSheetName, contract.PurchasesBySupplierTitle, contract.PurchasesBySupplierNoParty
	default:
		return Sheet{}, fmt.Errorf("rekap pihak %q tidak dikenal", rep.Kind)
	}
	if len(cols) == 0 {
		return Sheet{}, fmt.Errorf("lembar rekap pihak tanpa kolom")
	}
	rows, widths := banner(companyName, title, period, printedAt, catalogHeaders(cols))
	line := func(r partyRecapCells, bold bool) ([]Cell, error) {
		out := make([]Cell, len(cols))
		for i, c := range cols {
			cell, err := partyRecapCell(r, c.ID, bold)
			if err != nil {
				return nil, err
			}
			out[i] = cell
		}
		return out, nil
	}
	if len(rep.Rows) == 0 {
		rows = append(rows, sentenceRow(contract.PartyRecapEmptyLabel, len(cols)))
	}
	for _, r := range rep.Rows {
		label := noParty
		if r.PartyName != nil {
			label = *r.PartyName
		}
		row, err := line(partyRecapCells{label, r.DocCount, r.GrossBase, r.ReturnBase, r.NetBase}, false)
		if err != nil {
			return Sheet{}, err
		}
		rows = append(rows, row)
	}
	t := rep.Totals
	total, err := line(partyRecapCells{contract.RecapTotalLabel, t.DocCount, t.GrossBase, t.ReturnBase, t.NetBase}, true)
	if err != nil {
		return Sheet{}, err
	}
	rows = append(rows, total)
	if t.UnratedCount > 0 {
		rows = append(rows, sentenceRow(fmt.Sprintf(contract.PartyRecapUnratedNoteFormat, t.UnratedCount), len(cols)))
	}
	return Sheet{Name: sheetName, ColumnWidths: widths, Rows: rows}, nil
}

// PartyRecapWorkbook merakit berkas .xlsx rekap pihak.
func PartyRecapWorkbook(rep *ledgerread.PartyRecap, cols []contract.CatalogColumn, companyName, period string, printedAt time.Time) ([]byte, error) {
	sheet, err := PartyRecapSheet(rep, cols, companyName, period, printedAt)
	if err != nil {
		return nil, err
	}
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{sheet}}
	return wb.Bytes()
}

// ═══ KAS & BANK ══════════════════════════════════════════════════════════

// CashBankSheet memetakan Laporan Kas & Bank ke satu lembar. MURNI.
func CashBankSheet(cb *ledgerread.CashBank, cols []contract.CatalogColumn, companyName, period string, printedAt time.Time) (Sheet, error) {
	if len(cols) == 0 {
		return Sheet{}, fmt.Errorf("lembar kas & bank tanpa kolom")
	}
	rows, widths := banner(companyName, contract.CashBankTitle, period, printedAt, catalogHeaders(cols))
	cell := func(id, label string, opening, net, closing ledgerread.Cents, bold bool) (Cell, error) {
		switch id {
		case "account":
			return text(label, bold), nil
		case "opening":
			return money(opening, bold), nil
		case "net":
			return money(net, bold), nil
		case "closing":
			return money(closing, bold), nil
		}
		return Cell{}, fmt.Errorf("kolom kas & bank %q tidak dikenal", id)
	}
	line := func(label string, opening, net, closing ledgerread.Cents, bold bool) ([]Cell, error) {
		out := make([]Cell, len(cols))
		for i, c := range cols {
			v, err := cell(c.ID, label, opening, net, closing, bold)
			if err != nil {
				return nil, err
			}
			out[i] = v
		}
		return out, nil
	}
	if len(cb.Rows) == 0 {
		rows = append(rows, sentenceRow(contract.CashBankEmptyLabel, len(cols)))
	}
	for _, r := range cb.Rows {
		row, err := line(lineLabel(r.Code, r.Name), r.Opening, r.Net, r.Closing, false)
		if err != nil {
			return Sheet{}, err
		}
		rows = append(rows, row)
	}
	total, err := line(contract.RecapTotalLabel, cb.OpeningCash, cb.NetChange, cb.ClosingCash, true)
	if err != nil {
		return Sheet{}, err
	}
	rows = append(rows, total)
	return Sheet{Name: contract.CashBankSheetName, ColumnWidths: widths, Rows: rows}, nil
}

// CashBankWorkbook merakit berkas .xlsx Laporan Kas & Bank.
func CashBankWorkbook(cb *ledgerread.CashBank, cols []contract.CatalogColumn, companyName, period string, printedAt time.Time) ([]byte, error) {
	sheet, err := CashBankSheet(cb, cols, companyName, period, printedAt)
	if err != nil {
		return nil, err
	}
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{sheet}}
	return wb.Bytes()
}

// ═══ REALISASI VS ANGGARAN ═══════════════════════════════════════════════

// BudgetPeriod: label periode — `budgetPeriodLabel(year, month)`; month 0 =
// setahun penuh.
func BudgetPeriod(year, month int) (string, error) {
	switch {
	case month == 0:
		return fmt.Sprintf(contract.BudgetWholeYearFormat, year), nil
	case month >= 1 && month <= 12:
		return fmt.Sprintf(contract.BudgetMonthFormat, contract.BudgetMonthNamesID[month-1], year), nil
	}
	return "", fmt.Errorf("bulan %d di luar 0–12", month)
}

// percentText: angka JavaScript yang ditulis ExcelJS (`String(n)`) untuk persen
// berpecahan ≤ 2 digit.
func percentText(p float64) string {
	return strconv.FormatFloat(p, 'f', -1, 64)
}

type budgetCells struct {
	label                    string
	budget, actual, variance ledgerread.Cents
	pct                      *float64
	status                   string
}

func budgetLine(r budgetCells, bold bool) []Cell {
	pct := blank(bold)
	if r.pct != nil {
		pct = NumberCell(percentText(*r.pct), Style{HAlign: "right", Font: Font{Bold: bold}})
	}
	return []Cell{
		text(r.label, bold),
		money(r.budget, bold),
		money(r.actual, bold),
		money(r.variance, bold),
		pct,
		textOrBlank(r.status, bold),
	}
}

// BudgetSheet memetakan Realisasi vs Anggaran ke satu lembar. MURNI.
func BudgetSheet(rep *ledgerread.BudgetRealization, companyName, period string, printedAt time.Time) Sheet {
	cols := contract.BudgetColumns
	rows, widths := banner(companyName, contract.BudgetTitle, period, printedAt, cols)
	if len(rep.Rows) == 0 {
		rows = append(rows, sentenceRow(contract.BudgetEmptyLabel, len(cols)))
	}
	for _, r := range rep.Rows {
		rows = append(rows, budgetLine(budgetCells{
			lineLabel(r.Code, r.Name), r.Budget, r.Actual, r.Variance, r.VariancePct,
			contract.BudgetVarianceStatusLabels[r.Status],
		}, false))
	}
	t := rep.Totals
	note := ""
	if t.AlertCount > 0 {
		note = fmt.Sprintf(contract.BudgetAlertNoteFormat, t.AlertCount)
	}
	rows = append(rows, budgetLine(budgetCells{
		lineLabel("", contract.RecapTotalLabel), t.Budget, t.Actual, t.Variance, t.VariancePct, note,
	}, true))

	if st := rep.SalesTarget; st.HasTargets {
		empty := make([]Cell, len(cols))
		for i := range empty {
			empty[i] = blank(false)
		}
		rows = append(rows, empty)
		heading := []Cell{text(contract.BudgetSalesTargetLabel, true)}
		for len(heading) < len(cols) {
			heading = append(heading, blank(false))
		}
		rows = append(rows, heading)
		rows = append(rows, budgetLine(budgetCells{
			lineLabel("", contract.BudgetPeriodSalesLabel), st.TotalTarget, st.ActualSales, st.Variance, nil, "",
		}, false))
	}
	return Sheet{Name: contract.BudgetSheetName, ColumnWidths: widths, Rows: rows}
}

// BudgetWorkbook merakit berkas .xlsx Realisasi vs Anggaran.
func BudgetWorkbook(rep *ledgerread.BudgetRealization, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: []Sheet{BudgetSheet(rep, companyName, period, printedAt)}}
	return wb.Bytes()
}
