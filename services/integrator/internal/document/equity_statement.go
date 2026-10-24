package document

import (
	"fmt"
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

// ══ LEMBAR KEDUA: RINCIAN MODAL PER PEMILIK — padanan
// `buildEquityPartnerSheet` + `equityPartnerLayout()` (bentuk usaha,
// 24 Okt 2026) ══
//
// HANYA bila laporan membawa pemilik/sekutu (CV, Firma, usaha perorangan).
// Buku PT tidak punya baris, sehingga berkasnya tetap SATU lembar — berkas
// emas PT tidak berubah satu sel pun. Enam kolom (pemilik, modal awal, bagian
// laba, setoran, prive, modal akhir); baris Total tebal dan selalu terakhir.

// ShareBpText: padanan `shareBpText` TS — 10000 → "100", 3333 → "33,33",
// 3330 → "33,3".
func ShareBpText(bp int) string {
	whole, frac := bp/100, bp%100
	if frac < 0 {
		frac = -frac
	}
	switch {
	case frac == 0:
		return fmt.Sprintf("%d", whole)
	case frac%10 == 0:
		return fmt.Sprintf("%d,%d", whole, frac/10)
	default:
		return fmt.Sprintf("%d,%02d", whole, frac)
	}
}

// EquityPartnerLabel: padanan `equityPartnerLabel` TS.
func EquityPartnerLabel(p ledgerread.EquityPartner) string {
	role := ""
	if p.Role != nil {
		switch *p.Role {
		case "aktif":
			role = contract.EquityPartnerRoleAktifLabel
		case "komanditer":
			role = contract.EquityPartnerRoleKomanditerLabel
		}
	}
	inside := ShareBpText(p.ShareBp) + "%"
	if role != "" {
		inside = role + ", " + inside
	}
	label := p.Name + " (" + inside + ")"
	if !p.IsActive {
		label += " — " + contract.EquityPartnerInactiveLabel
	}
	return label
}

// EquityPartnerSheet memetakan rincian per pemilik ke lembar kedua; ok=false
// bila tidak ada pemilik/sekutu. MURNI.
func EquityPartnerSheet(es *ledgerread.EquityStatement, companyName, period string, printedAt time.Time) (Sheet, bool) {
	if len(es.Partners) == 0 {
		return Sheet{}, false
	}
	rows, widths := banner(companyName, contract.EquityPartnerTitle, period, printedAt, contract.EquityPartnerColumns)
	var opening, share, contrib, drawings, closing ledgerread.Cents
	for _, p := range es.Partners {
		rows = append(rows, []Cell{
			text(EquityPartnerLabel(p), false),
			money(p.Opening, false), money(p.ProfitShare, false), money(p.Contributions, false),
			money(p.Drawings, false), money(p.Closing, false),
		})
		opening += p.Opening
		share += p.ProfitShare
		contrib += p.Contributions
		drawings += p.Drawings
		closing += p.Closing
	}
	rows = append(rows, []Cell{
		text(contract.EquityPartnerTotalLabel, true),
		money(opening, true), money(share, true), money(contrib, true),
		money(drawings, true), money(closing, true),
	})
	return Sheet{Name: contract.EquityPartnerSheetName, ColumnWidths: widths, Rows: rows}, true
}

// EquityStatementSheets: SEMUA lembar laporan — utama, lalu rincian per
// pemilik bila ada. Padanan `buildReportSheets` TS.
func EquityStatementSheets(es *ledgerread.EquityStatement, companyName, period string, printedAt time.Time) []Sheet {
	sheets := []Sheet{EquityStatementSheet(es, companyName, period, printedAt)}
	if extra, ok := EquityPartnerSheet(es, companyName, period, printedAt); ok {
		sheets = append(sheets, extra)
	}
	return sheets
}

// EquityStatementWorkbook merakit berkas .xlsx Laporan Perubahan Ekuitas.
func EquityStatementWorkbook(es *ledgerread.EquityStatement, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{
		Creator: companyName,
		Created: printedAt,
		Sheets:  EquityStatementSheets(es, companyName, period, printedAt),
	}
	return wb.Bytes()
}
