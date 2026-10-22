package document

import (
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ KOLOM PEMBANDING (#557) — PADANAN JALUR KOMPARATIF `buildIncomeStatementSheet`
// / `buildBalanceSheetSheet` ═══════════════════════════════════════════════
//
// Lembar komparatif TS: empat kolom — keterangan, periode berjalan, periode
// pembanding, persen perubahan. Setiap aturan di bawah DISALIN dari
// `src/lib/statement-compare.ts` + `statement-layout.ts`, bukan dirancang
// ulang; paritas isi (`bun run parity:*-xlsx -- --compare …`) dan berkas emas
// membuktikannya.
//
//  1. Baris akun = GABUNGAN kedua periode (`compareLines`): akun berjalan
//     dalam urutannya, lalu akun yang HANYA ada di pembanding, diurutkan
//     `localeCompare` kodenya (`jscompat.LocaleCompare` — bukan urutan byte).
//  2. Band Laba Rugi yang tampil diputuskan periode BERJALAN saja
//     (`incomeStatementBands(statement)`): HPP/lain-lain yang hanya ada di
//     pembanding TIDAK tercetak, dan kolom pembanding tidak lagi berjumlah
//     laba bersihnya. Disalin, bukan diperbaiki.
//  3. Anotasi (marjin kotor, "Laba"/"Rugi", "(Seimbang)") milik periode
//     BERJALAN saja.
//  4. Persen = `percentChange`: dari nilai sen, `null` (sel kosong) bila
//     pembandingnya nol, dasar NILAI MUTLAK pembanding, `Math.round` satu
//     desimal — teks "+12,5%", "-0%".
//  5. Neraca: baris ekuitas SINTETIS dipasangkan menurut URUTAN. Muatan
//     berjalan tidak membawa pecahan #555 (selalu SATU baris "Akumulasi
//     Laba/Rugi"), muatan pembanding membawanya: bila `EquitySplitJS`
//     pembanding benar, baris "Akumulasi" berjalan bersanding dengan laba
//     tahun LALU pembanding, dan laba tahun berjalan pembanding tidak
//     tercetak (09 §9, jebakan 3 — disalin, bukan diperbaiki).

// IncomeStatementPrior: Laba Rugi periode pembanding dan judul kolomnya.
type IncomeStatementPrior struct {
	Statement *ledgerread.IncomeStatement
	// Period: judul kolom — `PriorPeriodRange`.
	Period string
}

// BalanceSheetPrior: Neraca tanggal pembanding dan judul kolomnya.
type BalanceSheetPrior struct {
	Statement *ledgerread.BalanceSheet
	// Period: judul kolom — `PriorPeriodAsOf`.
	Period string
}

// businessDateText: `formatDate(instant)` — tanggal BISNIS (Asia/Jakarta)
// instan itu, "5 Januari 2026".
func businessDateText(t time.Time) (string, error) {
	loc, err := ledgerread.BusinessLocation()
	if err != nil {
		return "", err
	}
	d := t.In(loc)
	return fmt.Sprintf("%d %s %d", d.Day(), contract.MonthNamesID[d.Month()-1], d.Year()), nil
}

// PriorPeriodRange: judul kolom pembanding Laba Rugi —
// `comparePeriodLabel(formatDate(from), formatDate(to))` atas instan yang
// dihitung penerbit TS (`comparisonRange`).
func PriorPeriodRange(from, to time.Time) (string, error) {
	f, err := businessDateText(from)
	if err != nil {
		return "", err
	}
	t, err := businessDateText(to)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(contract.ComparePeriodFormat, f, t), nil
}

// PriorPeriodAsOf: judul kolom pembanding Neraca —
// `asOfPeriodLabel(formatDate(priorAsOf))`.
func PriorPeriodAsOf(asOf time.Time) (string, error) {
	d, err := businessDateText(asOf)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(contract.AsOfPeriodFormat, d), nil
}

// ComparePercent: `percentChange(current, prior)` — ok=false bila pembandingnya
// nol (TS `null`). Rupiah-float dari sen (`round2` TS atas nilai sen yang
// sama memberi double yang sama), urutan operasi TS: ((c − p) / |p|) × 1000,
// `Math.round`, ÷ 10.
func ComparePercent(current, prior ledgerread.Cents) (float64, bool) {
	if prior == 0 {
		return 0, false
	}
	c, p := float64(current)/100, float64(prior)/100
	return jscompat.Round((c-p)/math.Abs(p)*1000) / 10, true
}

// PercentText: `comparePercentText` — "+" hanya untuk persen POSITIF.
func PercentText(pct float64) string {
	if pct > 0 {
		return fmt.Sprintf(contract.ComparePercentPositiveFormat, jscompat.FormatNumberID(pct))
	}
	return fmt.Sprintf(contract.ComparePercentFormat, jscompat.FormatNumberID(pct))
}

type comparedLine struct {
	code, name     string
	current, prior ledgerread.Cents
}

// compareLines: padanan `compareLines` (statement-compare.ts).
func compareLines(current, prior []ledgerread.StatementLine) []comparedLine {
	priorByCode := make(map[string]ledgerread.Cents, len(prior))
	for _, l := range prior {
		priorByCode[l.Code] = l.Amount // Map JS: kode ganda → yang TERAKHIR
	}
	seen := make(map[string]bool, len(current))
	out := make([]comparedLine, 0, len(current)+len(prior))
	for _, l := range current {
		seen[l.Code] = true
		out = append(out, comparedLine{code: l.Code, name: l.Name, current: l.Amount, prior: priorByCode[l.Code]})
	}
	rest := append([]ledgerread.StatementLine{}, prior...)
	sort.SliceStable(rest, func(i, j int) bool { return jscompat.LocaleCompare(rest[i].Code, rest[j].Code) < 0 })
	for _, l := range rest {
		if seen[l.Code] {
			continue
		}
		out = append(out, comparedLine{code: l.Code, name: l.Name, prior: l.Amount})
	}
	return out
}

// compareColumns: empat kolom lembar komparatif — judul kolom periodenya
// tanggalnya sendiri (muatan TS: `p.period`, `p.priorPeriod`).
func compareColumns(single []contract.ReportColumn, period, priorPeriod string) []contract.ReportColumn {
	return []contract.ReportColumn{
		single[0],
		{Header: period, Width: single[1].Width},
		{Header: priorPeriod, Width: single[1].Width},
		{Header: contract.CompareChangeHeader, Width: contract.CompareChangeWidth},
	}
}

// compareLabelRow: baris yang ketiga kolom nilainya TIDAK BERLAKU.
func compareLabelRow(label string, bold bool) []Cell {
	return []Cell{text(label, bold), EmptyCell(), EmptyCell(), EmptyCell()}
}

// compareAmountRow: nominal ANGKA di kedua kolom (bisa dijumlah), persen TEKS.
func compareAmountRow(label string, current, prior ledgerread.Cents, bold bool) []Cell {
	pct := EmptyCell()
	if v, ok := ComparePercent(current, prior); ok {
		pct = text(PercentText(v), bold)
	}
	return []Cell{text(label, bold), money(current, bold), money(prior, bold), pct}
}

// incomeStatementCompareSheet: Laba Rugi komparatif. MURNI.
func incomeStatementCompareSheet(is *ledgerread.IncomeStatement, prior IncomeStatementPrior, companyName, period string, printedAt time.Time) Sheet {
	pr := prior.Statement
	rows, widths := banner(companyName, contract.IncomeStatementTitle, period, printedAt,
		compareColumns(contract.IncomeStatementColumns, period, prior.Period))

	section := func(title string, band, priorBand ledgerread.StatementSection) {
		rows = append(rows, compareLabelRow(title, true))
		lines := compareLines(band.Lines, priorBand.Lines)
		if len(lines) == 0 {
			rows = append(rows, compareLabelRow(contract.IncomeStatementEmptyLabel, true))
		}
		for _, l := range lines {
			rows = append(rows, compareAmountRow(lineLabel(l.code, l.name), l.current, l.prior, false))
		}
		rows = append(rows, compareAmountRow(
			fmt.Sprintf(contract.IncomeStatementSectionTotalFormat, title), band.Total, priorBand.Total, true))
	}

	// Band dari periode BERJALAN saja (butir 2 di kepala berkas).
	showCogs := len(is.Cogs.Lines) > 0
	showOtherIncome := len(is.OtherIncome.Lines) > 0
	showOtherExpense := len(is.OtherExpense.Lines) > 0

	section(contract.IncomeStatementSalesLabel, is.Sales, pr.Sales)
	if showCogs {
		section(contract.IncomeStatementCogsLabel, is.Cogs, pr.Cogs)
		label := contract.IncomeStatementGrossProfitLabel
		if note := GrossMarginNote(is.GrossProfit, is.Sales.Total); note != "" {
			label += " (" + note + ")"
		}
		rows = append(rows, compareAmountRow(label, is.GrossProfit, pr.GrossProfit, true))
	}
	section(contract.IncomeStatementOperatingExpenseLabel, is.OperatingExpense, pr.OperatingExpense)
	if showOtherIncome || showOtherExpense {
		rows = append(rows, compareAmountRow(contract.IncomeStatementOperatingProfitLabel, is.OperatingProfit, pr.OperatingProfit, true))
	}
	if showOtherIncome {
		section(contract.IncomeStatementOtherIncomeLabel, is.OtherIncome, pr.OtherIncome)
	}
	if showOtherExpense {
		section(contract.IncomeStatementOtherExpenseLabel, is.OtherExpense, pr.OtherExpense)
	}
	result := contract.IncomeStatementResultLoss
	if is.NetIncome >= 0 {
		result = contract.IncomeStatementResultProfit
	}
	rows = append(rows, compareAmountRow(
		contract.IncomeStatementNetIncomeLabel+" ("+result+")", is.NetIncome, pr.NetIncome, true))

	return Sheet{Name: contract.IncomeStatementSheetName, ColumnWidths: widths, Rows: rows}
}

// balanceSheetCompareSheet: Neraca komparatif. MURNI.
func balanceSheetCompareSheet(bs *ledgerread.BalanceSheet, prior BalanceSheetPrior, companyName, period string, printedAt time.Time) Sheet {
	pr := prior.Statement
	rows, widths := banner(companyName, contract.BalanceSheetTitle, period, printedAt,
		compareColumns(contract.BalanceSheetColumns, period, prior.Period))

	// synthetic: baris ekuitas berkode kosong, dipasangkan menurut URUTAN.
	section := func(title string, lines, priorLines, synthetic, priorSynthetic []ledgerread.StatementLine, total, priorTotal ledgerread.Cents) {
		rows = append(rows, compareLabelRow(title, true))
		compared := compareLines(lines, priorLines)
		for i, l := range synthetic {
			var p ledgerread.Cents
			if i < len(priorSynthetic) {
				p = priorSynthetic[i].Amount
			}
			compared = append(compared, comparedLine{code: l.Code, name: l.Name, current: l.Amount, prior: p})
		}
		if len(compared) == 0 {
			rows = append(rows, compareLabelRow(contract.BalanceSheetEmptyLabel, true))
		}
		for _, l := range compared {
			rows = append(rows, compareAmountRow(lineLabel(l.code, l.name), l.current, l.prior, false))
		}
		rows = append(rows, compareAmountRow(
			fmt.Sprintf(contract.BalanceSheetSectionTotalFormat, title), total, priorTotal, true))
	}

	section(contract.BalanceSheetAssetsLabel, bs.Assets, pr.Assets, nil, nil, bs.TotalAssets, pr.TotalAssets)
	section(contract.BalanceSheetLiabilitiesLabel, bs.Liabilities, pr.Liabilities, nil, nil, bs.TotalLiabilities, pr.TotalLiabilities)

	// Berjalan: SATU baris (muatan tanpa pecahan). Pembanding: dua bila
	// `EquitySplitJS` — tahun lalu dulu, lalu tahun berjalan (`equityLines`).
	current := []ledgerread.StatementLine{{Name: contract.BalanceSheetCurrentNetIncomeLabel, Amount: bs.NetIncome}}
	priorSynthetic := []ledgerread.StatementLine{{Amount: pr.NetIncome}}
	if pr.EquitySplitJS {
		priorSynthetic = []ledgerread.StatementLine{{Amount: pr.PriorUnclosedIncome}, {Amount: pr.CurrentYearIncome}}
	}
	section(contract.BalanceSheetEquityLabel, bs.Equity, pr.Equity, current, priorSynthetic,
		bs.TotalEquity+bs.NetIncome, pr.TotalEquity+pr.NetIncome)

	note := contract.BalanceSheetNoteUnbalanced
	if bs.Balanced {
		note = contract.BalanceSheetNoteBalanced
	}
	rows = append(rows,
		compareAmountRow(contract.BalanceSheetTotalAssetsLabel, bs.TotalAssets, pr.TotalAssets, true),
		compareAmountRow(contract.BalanceSheetTotalLiabilitiesEquityLabel+" "+note,
			bs.TotalLiabilitiesEquity, pr.TotalLiabilitiesEquity, true),
	)
	return Sheet{Name: contract.BalanceSheetSheetName, ColumnWidths: widths, Rows: rows}
}
