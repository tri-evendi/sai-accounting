package document

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ══ LEMBAR SEBAR NERACA SALDO — PADANAN `buildTrialBalanceSheet` + `xlsx.ts` ═
//
// Bentuknya disalin dari dua fungsi TS, dan setiap butir di bawah adalah
// perilaku TS yang wajib sama (dibuktikan `bun run parity:trial-balance-xlsx`):
//
//  1. Kepala lembar: nama perusahaan (tebal, 14), judul (tebal, 12), periode
//     (abu), baris "Dicetak: … · Nilai dalam IDR" (9, abu), satu baris kosong.
//  2. Baris judul kolom: tebal putih di atas isi biru; kolom pertama rata
//     kiri, sisanya rata kanan.
//  3. Badan dari `trialBalanceLayout()`: buku TANPA satu baris akun pun
//     mendapat SATU kalimat tebal ("Belum ada saldo sampai tanggal ini") dengan
//     sel nominal KOSONG dan TANPA baris Total (#275).
//  4. Nol tetap ANGKA nol, bukan "-" (#241) — lembar sebar ada untuk dijumlah.
//  5. Baris Total tebal, dengan anotasi keseimbangan di kolom nama.
//
// Semua kalimat, judul kolom, lebar, format angka, dan warna datang dari
// `contract` — DIBANGKITKAN dari modul TS yang sama, bukan diketik di sini.

var isoDate = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})$`)

// PeriodAsOf menyusun label periode "Per 5 Januari 2026" dari tanggal ISO —
// padanan `asOfPeriodLabel(formatDate(asOf))`. Hari TANPA nol di depan, seperti
// `Intl.DateTimeFormat("id-ID", { day: "numeric" })`.
func PeriodAsOf(date string) (string, error) {
	teks, err := dateTextID(date)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(contract.AsOfPeriodFormat, teks), nil
}

// PrintedStamp: padanan `new Date().toLocaleString("id-ID")` di Node —
// "5/1/2026, 08.02.03", di zona waktu proses (TZ container, dari `.env`).
func PrintedStamp(t time.Time) string {
	return t.Local().Format("2/1/2006, 15.04.05")
}

// money: sel angka uang — format Rp, rata kanan, tebal bila diminta.
func money(c ledgerread.Cents, bold bool) Cell {
	return NumberCell(numberText(c), Style{
		NumFmt: contract.MoneyNumberFormat,
		HAlign: "right",
		Font:   Font{Bold: bold},
	})
}

// numberText menulis sen sebagai desimal TANPA nol ekor ("1234.5", "0") —
// bentuk yang sama dengan angka JavaScript yang ditulis ExcelJS.
func numberText(c ledgerread.Cents) string {
	s := c.String()
	if strings.Contains(s, ".") {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	if s == "" || s == "-" || s == "-0" {
		return "0"
	}
	return s
}

func text(s string, bold bool) Cell {
	return TextCell(s, Style{Font: Font{Bold: bold}})
}

// TrialBalanceSheet memetakan Neraca Saldo ke satu lembar. MURNI.
func TrialBalanceSheet(tb *ledgerread.TrialBalance, companyName, period string, printedAt time.Time) Sheet {
	muted := contract.SheetMutedARGB
	rows := [][]Cell{
		{text(companyName, true)},
		{text(contract.TrialBalanceTitle, true)},
		{TextCell(period, Style{Font: Font{ColorARGB: muted}})},
		{TextCell(fmt.Sprintf(contract.SheetPrintedFormat, PrintedStamp(printedAt)),
			Style{Font: Font{Size: contract.SheetPrintedFontSize, ColorARGB: muted}})},
		{},
	}
	rows[0][0].Style.Font.Size = contract.SheetCompanyFontSize
	rows[1][0].Style.Font.Size = contract.SheetTitleFontSize

	widths := make([]float64, len(contract.TrialBalanceColumns))
	header := make([]Cell, len(contract.TrialBalanceColumns))
	for i, c := range contract.TrialBalanceColumns {
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
	rows = append(rows, header)

	bold := Style{Font: Font{Bold: true}}
	if len(tb.Rows) == 0 {
		// Satu kalimat, sel nominal KOSONG (bukan nol), dan tanpa Total (#275).
		// TEBAL, seperti di TS: `buildTrialBalanceSheet` menebalkan setiap baris
		// yang bukan baris akun (`kind !== "line"`) — temuan pertama paritas isi.
		rows = append(rows, []Cell{
			{Kind: CellEmpty, Style: bold},
			text(contract.TrialBalanceEmptyLabel, true),
			{Kind: CellEmpty, Style: bold},
			{Kind: CellEmpty, Style: bold},
		})
	} else {
		for _, r := range tb.Rows {
			rows = append(rows, []Cell{text(r.Code, false), text(r.Name, false), money(r.Debit, false), money(r.Credit, false)})
		}
		note := contract.TrialBalanceNoteUnbalanced
		if tb.Balanced {
			note = contract.TrialBalanceNoteBalanced
		}
		rows = append(rows, []Cell{
			{Kind: CellEmpty, Style: bold},
			text(contract.TrialBalanceTotalLabel+" "+note, true),
			money(tb.TotalDebit, true),
			money(tb.TotalCredit, true),
		})
	}

	return Sheet{Name: contract.TrialBalanceSheetName, ColumnWidths: widths, Rows: rows}
}

// TrialBalanceWorkbook merakit berkas .xlsx Neraca Saldo.
func TrialBalanceWorkbook(tb *ledgerread.TrialBalance, companyName, period string, printedAt time.Time) ([]byte, error) {
	wb := Workbook{
		Creator: companyName,
		Created: printedAt,
		Sheets:  []Sheet{TrialBalanceSheet(tb, companyName, period, printedAt)},
	}
	return wb.Bytes()
}

var bukanHurufAngka = regexp.MustCompile(`[^A-Za-z0-9]+`)

// FileName: padanan `namaBerkas()` di `workers/interactive.ts` —
// "Neraca_Saldo_2026-10-22.xlsx", tanggal UTC (`toISOString().slice(0, 10)`).
func FileName(title string, now time.Time) string {
	slug := strings.Trim(bukanHurufAngka.ReplaceAllString(title, "_"), "_")
	if slug == "" {
		slug = "Laporan"
	}
	return slug + "_" + now.UTC().Format("2006-01-02") + ".xlsx"
}
