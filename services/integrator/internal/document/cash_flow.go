package document

import (
	"fmt"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ LEMBAR SEBAR ARUS KAS — PADANAN `cashFlowLayout()` + `buildCashFlowSheet` ═
//
// Bentuknya mengikuti jalur berkas TS (`buildReportPayload` →
// `buildReportSheet`), dibuktikan `bun run parity:cash-flow-xlsx` dan berkas
// emas di setiap verify:
//
//   - kepala lembar sama dengan laporan lain; empat kolom (sumber/penggunaan,
//     masuk, keluar, bersih);
//   - baris pertama kas awal, baris terakhir dua: kas akhir, lalu total
//     (masuk, keluar, perubahan bersih) dengan anotasi rekonsiliasi di
//     labelnya;
//   - setiap kelompok: judul, baris akun ATAU kalimat "tidak ada pergerakan",
//     lalu baris jumlah. Kelompok CADANGAN ("Belum Terkategori") yang kosong
//     tidak tampil sama sekali; tiga kelompok baku selalu tampil;
//   - kolom yang TIDAK BERLAKU (judul, kalimat kosong, kas awal/akhir di
//     kolom masuk/keluar) adalah sel KOSONG yang tidak tebal — `text(null)`
//     TS; nol tetap ANGKA nol (#241);
//   - semua baris tebal kecuali baris akun.

// cashFlowRow: label + tiga kolom nominal satu baris; nil = tidak berlaku.
func cashFlowRow(label string, bold bool, inflow, outflow, net *ledgerread.Cents) []Cell {
	cell := func(v *ledgerread.Cents) Cell {
		if v == nil {
			return EmptyCell()
		}
		return money(*v, bold)
	}
	return []Cell{text(label, bold), cell(inflow), cell(outflow), cell(net)}
}

func ptr(c ledgerread.Cents) *ledgerread.Cents { return &c }

// CashFlowSheet memetakan Arus Kas ke satu lembar. MURNI.
func CashFlowSheet(cf *ledgerread.CashFlow, companyName, period string, printedAt time.Time) Sheet {
	rows, widths := banner(companyName, contract.CashFlowTitle, period, printedAt, contract.CashFlowColumns)

	rows = append(rows, cashFlowRow(contract.CashFlowOpeningLabel, true, nil, nil, ptr(cf.OpeningCash)))
	for _, g := range cf.Groups {
		if g.Category == contract.CashFlowFallbackCategory && len(g.Lines) == 0 {
			continue
		}
		label := contract.CashFlowCategoryLabels[g.Category]
		rows = append(rows, cashFlowRow(label, true, nil, nil, nil))
		if len(g.Lines) == 0 {
			rows = append(rows, cashFlowRow(contract.CashFlowEmptyLabel, true, nil, nil, nil))
		}
		for _, l := range g.Lines {
			rows = append(rows, cashFlowRow(lineLabel(l.Code, l.Name), false, ptr(l.Inflow), ptr(l.Outflow), ptr(l.Net)))
		}
		rows = append(rows, cashFlowRow(fmt.Sprintf(contract.CashFlowSubtotalFormat, label), true,
			ptr(g.Inflow), ptr(g.Outflow), ptr(g.Net)))
	}
	rows = append(rows, cashFlowRow(contract.CashFlowClosingLabel, true, nil, nil, ptr(cf.ClosingCash)))

	note := contract.CashFlowNoteUnreconciled
	if cf.Reconciled {
		note = contract.CashFlowNoteReconciled
	}
	rows = append(rows, cashFlowRow(contract.CashFlowTotalLabel+" "+note, true,
		ptr(cf.TotalInflow), ptr(cf.TotalOutflow), ptr(cf.NetChange)))

	return Sheet{Name: contract.CashFlowSheetName, ColumnWidths: widths, Rows: rows}
}

// CashFlowWorkbook merakit berkas .xlsx Arus Kas.
func CashFlowWorkbook(cf *ledgerread.CashFlow, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{
		Creator: companyName,
		Created: printedAt,
		Sheets:  []Sheet{CashFlowSheet(cf, companyName, period, printedAt)},
	}
	return wb.Bytes()
}
