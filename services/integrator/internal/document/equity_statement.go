package document

import (
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ LEMBAR SEBAR LAPORAN PERUBAHAN EKUITAS — PADANAN `equityStatementLayout()`
// + `buildEquityStatementSheet` (berkas sejak keputusan pemilik 23 Okt 2026) ══
//
// Bentuknya mengikuti jalur berkas TS (`buildReportPayload` →
// `buildReportSheet`), dibuktikan `bun run parity:equity-changes-xlsx` dan
// berkas emas di setiap verify:
//
//   - kepala lembar sama dengan laporan lain; lima kolom (komponen, awal,
//     tambah, kurang, akhir);
//   - satu baris per komponen ekuitas (urutan `BuildEquityStatement`), lalu
//     "Laba/Rugi Belum Ditutup" SELALU — pergerakannya di kolom tambah bila
//     positif, di kolom kurang (dibalik tandanya) bila negatif, nol di kolom
//     lainnya; lalu Total;
//   - baris Total: tambah & kurang TIDAK BERLAKU — sel KOSONG yang tidak
//     tebal (`text(null)` TS); nol tetap ANGKA nol;
//   - hanya baris Total yang tebal.

// equityRow: label + empat kolom nominal; nil = tidak berlaku.
func equityRow(label string, bold bool, opening ledgerread.Cents, additions, reductions *ledgerread.Cents, closing ledgerread.Cents) []Cell {
	cell := func(v *ledgerread.Cents) Cell {
		if v == nil {
			return EmptyCell()
		}
		return money(*v, bold)
	}
	return []Cell{text(label, bold), money(opening, bold), cell(additions), cell(reductions), money(closing, bold)}
}

// EquityStatementSheet memetakan Laporan Perubahan Ekuitas ke satu lembar. MURNI.
func EquityStatementSheet(es *ledgerread.EquityStatement, companyName, period string, printedAt time.Time) Sheet {
	rows, widths := banner(companyName, contract.EquityStatementTitle, period, printedAt, contract.EquityStatementColumns)

	for _, c := range es.Components {
		rows = append(rows, equityRow(lineLabel(c.Code, c.Name), false,
			c.Opening, ptr(c.Additions), ptr(c.Reductions), c.Closing))
	}

	u := es.UnclosedIncome
	var add, red ledgerread.Cents
	if u.Movement > 0 {
		add = u.Movement
	} else if u.Movement < 0 {
		red = -u.Movement
	}
	rows = append(rows, equityRow(contract.EquityStatementUnclosedLabel, false, u.Opening, &add, &red, u.Closing))
	rows = append(rows, equityRow(contract.EquityStatementTotalLabel, true, es.TotalOpening, nil, nil, es.TotalClosing))

	return Sheet{Name: contract.EquityStatementSheetName, ColumnWidths: widths, Rows: rows}
}

// EquityStatementWorkbook merakit berkas .xlsx Laporan Perubahan Ekuitas.
func EquityStatementWorkbook(es *ledgerread.EquityStatement, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{
		Creator: companyName,
		Created: printedAt,
		Sheets:  []Sheet{EquityStatementSheet(es, companyName, period, printedAt)},
	}
	return wb.Bytes()
}
