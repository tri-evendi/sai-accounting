package document

import (
	"fmt"
	"strconv"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ LEMBAR SEBAR LABA RUGI & NERACA — PADANAN `buildIncomeStatementSheet` /
// `buildBalanceSheetSheet` + `xlsx.ts` ═══════════════════════════════════════
//
// Bentuknya mengikuti JALUR BERKAS TS, yaitu `buildReportPayload` →
// `buildReportSheet` — yang sejak 22 Okt 2026 menyusun muatan yang SAMA
// dengan halaman (`incomeStatementPrior` / `balanceSheetPrior`). Dua akibatnya:
//
//  1. Tanpa `?compare=` SATU kolom nilai; dengan `?compare=` empat kolom
//     (#557) — lembar komparatif ada di `compare.go`.
//  2. Neraca BERJALAN selalu satu baris "Akumulasi Laba/Rugi" = netIncome:
//     muatan ekspor TS tidak membawa `currentYearIncome`/`priorUnclosedIncome`
//     periode berjalan, jadi `equityLines()` tidak pernah memecahnya. Pecahan
//     #555 tetap DIHITUNG Go (dan dibandingkan `parity:balance-sheet`). Neraca
//     PEMBANDING membawanya — lihat `compare.go`.
//
// Rupa (dibuktikan `bun run parity:income-statement-xlsx` / `…balance-sheet-xlsx`
// dan berkas emas di setiap verify):
//
//   - kepala lembar sama dengan Neraca Saldo;
//   - judul band/seksi, kalimat "tidak ada akun", subtotal, anak tangga, dan
//     baris penutup TEBAL (`kind !== "line"`); baris akun tidak;
//   - sel nominal yang TIDAK BERLAKU (judul, kalimat kosong) kosong dan TIDAK
//     tebal — `text(null)` TS;
//   - nol tetap ANGKA nol (#241);
//   - label baris akun = `${code}  ${name}`.trim() (dua spasi, trim JS).

// dateTextID: padanan `formatDate` (`Intl` id-ID, hari tanpa nol di depan) atas
// tanggal kalender ISO.
func dateTextID(date string) (string, error) {
	if isoDate.FindStringSubmatch(date) == nil {
		return "", fmt.Errorf("tanggal %q bukan YYYY-MM-DD", date)
	}
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", fmt.Errorf("tanggal %q tidak sah: %w", date, err)
	}
	return fmt.Sprintf("%d %s %d", t.Day(), contract.MonthNamesID[t.Month()-1], t.Year()), nil
}

// PeriodRange menyusun "Periode 1 Januari 2026 – 22 Oktober 2026" dari dua
// tanggal ISO (yang SUDAH diselesaikan `resolvePeriod` penerbit), ditambah ekor
// pusat biaya bila costCenterLabel tidak kosong — padanan `periodLabel()` di
// `src/lib/report-payload.ts`.
func PeriodRange(from, to, costCenterLabel string) (string, error) {
	f, err := dateTextID(from)
	if err != nil {
		return "", err
	}
	t, err := dateTextID(to)
	if err != nil {
		return "", err
	}
	s := fmt.Sprintf(contract.PeriodRangeFormat, f, t)
	if costCenterLabel != "" {
		s += fmt.Sprintf(contract.CostCenterPeriodSuffixFormat, costCenterLabel)
	}
	return s, nil
}

// CostCenterLookup membaca kode & nama satu pusat biaya (found=false bila tak ada).
type CostCenterLookup func(id int64) (code, name string, found bool, err error)

// CostCenterLabel: label pusat biaya di label periode — padanan
// `costCenterFilterLabel(raw) ?? "#<filter>"` di `buildReportPayload`, termasuk
// tepiannya:
//
//   - "unassigned" dicocokkan pada teks MENTAH (tanpa trim) — " unassigned"
//     tetap menyaring baris tanpa pusat biaya, tetapi labelnya "#unassigned";
//   - id dibaca `parseInt` (spasi di depan dilewati) setelah teks ber-trim
//     lolos `^\d+$`; pusat biaya yang tak ditemukan → "#<id>";
//   - nama tetap "KODE — Nama" untuk pusat biaya NONAKTIF (`findUnique` tidak
//     menyaring `is_active`).
//
// Bahasa label "belum ditetapkan" adalah bahasa DOKUMEN CETAK (id, #278) —
// pekerja tidak punya bahasa pengguna.
func CostCenterLabel(raw string, f ledgerread.CostCenterFilter, lookup CostCenterLookup) (string, error) {
	if !f.Active {
		return "", nil
	}
	fallback := "#" + contract.CostCenterUnassigned
	if f.ID != nil {
		fallback = "#" + strconv.FormatInt(*f.ID, 10)
	}
	if raw == contract.CostCenterUnassigned {
		return contract.CostCenterUnassignedLabel, nil
	}
	if f.ID == nil {
		return fallback, nil
	}
	code, name, found, err := lookup(*f.ID)
	if err != nil {
		return "", err
	}
	if !found {
		return fallback, nil
	}
	return fmt.Sprintf(contract.CostCenterDisplayFormat, code, name), nil
}

// lineLabel: `${code}  ${name}`.trim().
func lineLabel(code, name string) string {
	return jscompat.Trim(code + "  " + name)
}

// banner: lima baris kepala lembar + baris judul kolom — sama untuk setiap
// lembar laporan (`buildWorkbookBuffer`).
func banner(companyName, title, period string, printedAt time.Time, columns []contract.ReportColumn) ([][]Cell, []float64) {
	muted := contract.SheetMutedARGB
	rows := [][]Cell{
		{text(companyName, true)},
		{text(title, true)},
		{TextCell(period, Style{Font: Font{ColorARGB: muted}})},
		{TextCell(fmt.Sprintf(contract.SheetPrintedFormat, PrintedStamp(printedAt)),
			Style{Font: Font{Size: contract.SheetPrintedFontSize, ColorARGB: muted}})},
		{},
	}
	rows[0][0].Style.Font.Size = contract.SheetCompanyFontSize
	rows[1][0].Style.Font.Size = contract.SheetTitleFontSize

	widths := make([]float64, len(columns))
	header := make([]Cell, len(columns))
	for i, c := range columns {
		widths[i] = c.Width
		align := "right"
		if i == 0 {
			align = "left"
		}
		header[i] = TextCell(c.Header, Style{
			Font:     Font{Bold: true, ColorARGB: contract.SheetHeaderFontARGB},
			FillARGB: contract.SheetHeaderFillARGB,
			HAlign:   align,
		})
	}
	return append(rows, header), widths
}

// labelRow: baris yang kolom nominalnya TIDAK BERLAKU — sel kosong, tidak tebal.
func labelRow(label string, bold bool) []Cell {
	return []Cell{text(label, bold), EmptyCell()}
}

func amountRow(label string, amount ledgerread.Cents, bold bool) []Cell {
	return []Cell{text(label, bold), money(amount, bold)}
}

// GrossMarginNote: anotasi baris Laba Kotor — padanan `grossMarginPct` →
// `roundedMarginPct` → `labels.grossMargin`. "" bila tidak ada penjualan.
// Persennya float seperti TS (rasio dua angka sen, bukan rupiah-float; pada
// batas pembulatan x,x5 kedua sisi bisa berbeda satu ulp — paritas isi yang
// akan menemukannya, bukan dugaan).
func GrossMarginNote(grossProfit, sales ledgerread.Cents) string {
	if sales == 0 {
		return ""
	}
	pct := float64(grossProfit) / float64(sales) * 100
	rounded := jscompat.Round(pct*10) / 10
	return fmt.Sprintf(contract.IncomeStatementGrossMarginFormat, jscompat.FormatNumberID(rounded))
}

// IncomeStatementSheet memetakan Laba Rugi ke satu lembar — padanan
// `incomeStatementLayout()` + `buildIncomeStatementSheet`; prior != nil =
// lembar komparatif (#557). MURNI.
func IncomeStatementSheet(is *ledgerread.IncomeStatement, prior *IncomeStatementPrior, companyName, period string, printedAt time.Time) Sheet {
	if prior != nil {
		return incomeStatementCompareSheet(is, *prior, companyName, period, printedAt)
	}
	rows, widths := banner(companyName, contract.IncomeStatementTitle, period, printedAt, contract.IncomeStatementColumns)

	section := func(title string, band ledgerread.StatementSection) {
		rows = append(rows, labelRow(title, true))
		if len(band.Lines) == 0 {
			rows = append(rows, labelRow(contract.IncomeStatementEmptyLabel, true))
		}
		for _, l := range band.Lines {
			rows = append(rows, amountRow(lineLabel(l.Code, l.Name), l.Amount, false))
		}
		rows = append(rows, amountRow(fmt.Sprintf(contract.IncomeStatementSectionTotalFormat, title), band.Total, true))
	}

	// `incomeStatementBands()`: Penjualan & Beban Operasional SELALU tampil;
	// HPP (dan Laba Kotor) hanya bila berbaris; Laba Usaha hanya bila ada
	// pendapatan/beban lain-lain.
	showCogs := len(is.Cogs.Lines) > 0
	showOtherIncome := len(is.OtherIncome.Lines) > 0
	showOtherExpense := len(is.OtherExpense.Lines) > 0

	section(contract.IncomeStatementSalesLabel, is.Sales)
	if showCogs {
		section(contract.IncomeStatementCogsLabel, is.Cogs)
		label := contract.IncomeStatementGrossProfitLabel
		if note := GrossMarginNote(is.GrossProfit, is.Sales.Total); note != "" {
			label += " (" + note + ")"
		}
		rows = append(rows, amountRow(label, is.GrossProfit, true))
	}
	section(contract.IncomeStatementOperatingExpenseLabel, is.OperatingExpense)
	if showOtherIncome || showOtherExpense {
		rows = append(rows, amountRow(contract.IncomeStatementOperatingProfitLabel, is.OperatingProfit, true))
	}
	if showOtherIncome {
		section(contract.IncomeStatementOtherIncomeLabel, is.OtherIncome)
	}
	if showOtherExpense {
		section(contract.IncomeStatementOtherExpenseLabel, is.OtherExpense)
	}
	// Penutup: `>= 0` terbaca "Laba" — impas bukan kerugian (#123).
	result := contract.IncomeStatementResultLoss
	if is.NetIncome >= 0 {
		result = contract.IncomeStatementResultProfit
	}
	rows = append(rows, amountRow(contract.IncomeStatementNetIncomeLabel+" ("+result+")", is.NetIncome, true))

	return Sheet{Name: contract.IncomeStatementSheetName, ColumnWidths: widths, Rows: rows}
}

// IncomeStatementWorkbook merakit berkas .xlsx Laba Rugi.
func IncomeStatementWorkbook(is *ledgerread.IncomeStatement, prior *IncomeStatementPrior, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{
		Creator: companyName,
		Created: printedAt,
		Sheets:  []Sheet{IncomeStatementSheet(is, prior, companyName, period, printedAt)},
	}
	return wb.Bytes()
}

// BalanceSheetSheet memetakan Neraca ke satu lembar — padanan
// `balanceSheetLayout()` + `buildBalanceSheetSheet`, atas muatan ekspor (tanpa
// pecahan #555 periode berjalan; lihat kepala berkas); prior != nil = lembar
// komparatif (#557). MURNI.
func BalanceSheetSheet(bs *ledgerread.BalanceSheet, prior *BalanceSheetPrior, companyName, period string, printedAt time.Time) Sheet {
	if prior != nil {
		return balanceSheetCompareSheet(bs, *prior, companyName, period, printedAt)
	}
	rows, widths := banner(companyName, contract.BalanceSheetTitle, period, printedAt, contract.BalanceSheetColumns)

	section := func(title string, lines []ledgerread.StatementLine, total ledgerread.Cents) {
		rows = append(rows, labelRow(title, true))
		if len(lines) == 0 {
			rows = append(rows, labelRow(contract.BalanceSheetEmptyLabel, true))
		}
		for _, l := range lines {
			rows = append(rows, amountRow(lineLabel(l.Code, l.Name), l.Amount, false))
		}
		rows = append(rows, amountRow(fmt.Sprintf(contract.BalanceSheetSectionTotalFormat, title), total, true))
	}

	section(contract.BalanceSheetAssetsLabel, bs.Assets, bs.TotalAssets)
	section(contract.BalanceSheetLiabilitiesLabel, bs.Liabilities, bs.TotalLiabilities)
	// Blok ekuitas tak pernah kosong: baris hasil yang belum ditutup (berkode
	// kosong, jadi labelnya nama saja) selalu ada, meski nol.
	equity := append(append([]ledgerread.StatementLine{}, bs.Equity...),
		ledgerread.StatementLine{Name: contract.BalanceSheetCurrentNetIncomeLabel, Amount: bs.NetIncome})
	section(contract.BalanceSheetEquityLabel, equity, bs.TotalEquity+bs.NetIncome)

	note := contract.BalanceSheetNoteUnbalanced
	if bs.Balanced {
		note = contract.BalanceSheetNoteBalanced
	}
	rows = append(rows,
		amountRow(contract.BalanceSheetTotalAssetsLabel, bs.TotalAssets, true),
		amountRow(contract.BalanceSheetTotalLiabilitiesEquityLabel+" "+note, bs.TotalLiabilitiesEquity, true),
	)
	return Sheet{Name: contract.BalanceSheetSheetName, ColumnWidths: widths, Rows: rows}
}

// BalanceSheetWorkbook merakit berkas .xlsx Neraca.
func BalanceSheetWorkbook(bs *ledgerread.BalanceSheet, prior *BalanceSheetPrior, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{
		Creator: companyName,
		Created: printedAt,
		Sheets:  []Sheet{BalanceSheetSheet(bs, prior, companyName, period, printedAt)},
	}
	return wb.Bytes()
}
