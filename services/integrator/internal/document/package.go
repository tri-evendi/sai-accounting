package document

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ BUKU KERJA PAKET LAPORAN (`report.package`, 09 §5) ═════════════════════
//
// Satu buku kerja, banyak lembar: lembar "Ringkasan" lebih dulu, lalu satu
// lembar per laporan dari penghasil lembar YANG SAMA dengan `report.export_go`
// (`<Laporan>Sheet`). Berkas ini tidak menghitung apa pun — ia hanya:
//
//  1. menamai lembar supaya sah di Excel (≤ 31 karakter, tanpa `[]:*?/\`,
//     unik tanpa memandang huruf besar-kecil). Dua laporan bisa saja bernama
//     lembar sama di masa depan; Excel menolak buku kerja seperti itu sebagai
//     "rusak", jadi yang kedua diberi akhiran " (2)";
//  2. menyusun lembar Ringkasan dari kalimat yang DIKIRIM PENERBIT TS
//     (`PackageSummaryText`) — tidak satu kalimat pun ditulis di sini, sama
//     dengan aturan setiap lembar lain di paket ini (kalimatnya dari
//     `contract`/TS, bukan diketik di Go).

// PackageSummaryText: kalimat lembar Ringkasan, dari muatan pekerjaan
// (`src/lib/report-package.ts` → `PACKAGE_SUMMARY_TEXT`).
type PackageSummaryText struct {
	Title            string `json:"title"`
	IncludedHeading  string `json:"includedHeading"`
	ExcludedHeading  string `json:"excludedHeading"`
	NumberHeader     string `json:"numberHeader"`
	ReportHeader     string `json:"reportHeader"`
	SheetHeader      string `json:"sheetHeader"`
	ReasonHeader     string `json:"reasonHeader"`
	NothingExcluded  string `json:"nothingExcluded"`
	SheetName        string `json:"sheetName"`
	FormatsLine      string `json:"formatsLine"`
	GeneratedForLine string `json:"generatedForLine"`
}

// PackageEntry: satu laporan yang disertakan — judul cetaknya dan lembarnya.
type PackageEntry struct {
	Title string
	Sheet Sheet
}

// PackageExclusion: satu laporan yang TIDAK disertakan, beserta alasannya
// (modul tidak aktif / peran tidak berwenang) — kalimat dari penerbit.
type PackageExclusion struct {
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// sheetNameMax: batas nama lembar Excel.
const sheetNameMax = 31

// SafeSheetName membersihkan satu nama lembar: karakter terlarang Excel
// menjadi "-", dipotong ke 31 karakter (per rune, bukan per byte), dan nama
// kosong menjadi "Lembar".
func SafeSheetName(name string) string {
	s := strings.Map(func(r rune) rune {
		switch r {
		case '[', ']', ':', '*', '?', '/', '\\':
			return '-'
		}
		return r
	}, strings.TrimSpace(name))
	s = strings.Trim(s, "'")
	if s == "" {
		s = "Lembar"
	}
	if utf8.RuneCountInString(s) > sheetNameMax {
		s = string([]rune(s)[:sheetNameMax])
	}
	return s
}

// uniqueSheetNames menamai ulang lembar yang bertabrakan (tanpa memandang
// huruf besar-kecil, seperti Excel) dengan akhiran " (2)", " (3)", ….
func uniqueSheetNames(sheets []Sheet) {
	seen := map[string]bool{}
	for i := range sheets {
		base := SafeSheetName(sheets[i].Name)
		name := base
		for n := 2; seen[strings.ToLower(name)]; n++ {
			suffix := " (" + strconv.Itoa(n) + ")"
			r := []rune(base)
			if len(r)+utf8.RuneCountInString(suffix) > sheetNameMax {
				r = r[:sheetNameMax-utf8.RuneCountInString(suffix)]
			}
			name = string(r) + suffix
		}
		seen[strings.ToLower(name)] = true
		sheets[i].Name = name
	}
}

// PackageSummarySheet menyusun lembar Ringkasan. MURNI.
func PackageSummarySheet(text PackageSummaryText, companyName, period string, entries []PackageEntry, excluded []PackageExclusion, printedAt time.Time) Sheet {
	muted := contract.SheetMutedARGB
	header := func(s string) Cell {
		return TextCell(s, Style{
			Font:     Font{Bold: true, ColorARGB: contract.SheetHeaderFontARGB},
			FillARGB: contract.SheetHeaderFillARGB,
			HAlign:   "left",
		})
	}
	rows := [][]Cell{
		{TextCell(companyName, Style{Font: Font{Bold: true, Size: contract.SheetCompanyFontSize}})},
		{TextCell(text.Title, Style{Font: Font{Bold: true, Size: contract.SheetTitleFontSize}})},
		{TextCell(period, Style{Font: Font{ColorARGB: muted}})},
		{TextCell(fmt.Sprintf(contract.SheetPrintedFormat, PrintedStamp(printedAt)),
			Style{Font: Font{Size: contract.SheetPrintedFontSize, ColorARGB: muted}})},
	}
	for _, line := range []string{text.FormatsLine, text.GeneratedForLine} {
		if strings.TrimSpace(line) != "" {
			rows = append(rows, []Cell{TextCell(line, Style{Font: Font{ColorARGB: muted}})})
		}
	}
	rows = append(rows, []Cell{}, []Cell{text0(text.IncludedHeading)},
		[]Cell{header(text.NumberHeader), header(text.ReportHeader), header(text.SheetHeader)})
	for i, e := range entries {
		rows = append(rows, []Cell{
			NumberCell(strconv.Itoa(i+1), Style{HAlign: "left"}),
			TextCell(e.Title, Style{}),
			TextCell(e.Sheet.Name, Style{}),
		})
	}
	rows = append(rows, []Cell{}, []Cell{text0(text.ExcludedHeading)})
	if len(excluded) == 0 {
		rows = append(rows, []Cell{TextCell(text.NothingExcluded, Style{Font: Font{ColorARGB: muted}})})
	} else {
		rows = append(rows, []Cell{header(text.NumberHeader), header(text.ReportHeader), header(text.ReasonHeader)})
		for i, x := range excluded {
			rows = append(rows, []Cell{
				NumberCell(strconv.Itoa(i+1), Style{HAlign: "left"}),
				TextCell(x.Title, Style{}),
				TextCell(x.Reason, Style{}),
			})
		}
	}
	return Sheet{Name: text.SheetName, ColumnWidths: []float64{6, 40, 60}, Rows: rows}
}

func text0(s string) Cell { return TextCell(s, Style{Font: Font{Bold: true}}) }

// PackageWorkbook merakit buku kerja paket: Ringkasan lebih dulu, lalu lembar
// setiap laporan dalam urutan `entries`. Nama lembar dibersihkan & dibuat unik
// SEBELUM Ringkasan disusun, jadi kolom "Lembar" di Ringkasan menyebut nama
// yang benar-benar ada di buku kerja.
func PackageWorkbook(text PackageSummaryText, companyName, period string, entries []PackageEntry, excluded []PackageExclusion, printedAt time.Time) ([]byte, error) {
	if len(entries) == 0 {
		return nil, fmt.Errorf("paket laporan tanpa satu laporan pun")
	}
	sheets := make([]Sheet, 0, len(entries)+1)
	sheets = append(sheets, Sheet{Name: text.SheetName})
	for _, e := range entries {
		sheets = append(sheets, e.Sheet)
	}
	uniqueSheetNames(sheets)
	named := make([]PackageEntry, len(entries))
	for i, e := range entries {
		named[i] = PackageEntry{Title: e.Title, Sheet: sheets[i+1]}
	}
	summary := PackageSummarySheet(text, companyName, period, named, excluded, printedAt)
	summary.Name = sheets[0].Name
	sheets[0] = summary
	wb := Workbook{Creator: companyName, Created: printedAt, Sheets: sheets}
	return wb.Bytes()
}
