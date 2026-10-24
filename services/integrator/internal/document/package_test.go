package document

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestSafeSheetName(t *testing.T) {
	cases := map[string]string{
		"Neraca":                             "Neraca",
		"Laba/Rugi: [2026]":                  "Laba-Rugi- -2026-",
		"":                                   "Lembar",
		"'Kutip'":                            "Kutip",
		strings.Repeat("Panjang sekali ", 4): "Panjang sekali Panjang sekali P",
	}
	for in, want := range cases {
		got := SafeSheetName(in)
		if got != want {
			t.Errorf("SafeSheetName(%q) = %q, mau %q", in, got, want)
		}
		if utf8.RuneCountInString(got) > 31 {
			t.Errorf("%q melewati 31 karakter", got)
		}
	}
}

func TestUniqueSheetNamesTanpaMemandangHuruf(t *testing.T) {
	sheets := []Sheet{{Name: "Ringkasan"}, {Name: "Neraca"}, {Name: "NERACA"}, {Name: "neraca"}, {Name: strings.Repeat("x", 31)}, {Name: strings.Repeat("x", 31)}}
	uniqueSheetNames(sheets)
	var nama []string
	for _, s := range sheets {
		nama = append(nama, s.Name)
		if utf8.RuneCountInString(s.Name) > 31 {
			t.Errorf("%q melewati 31 karakter", s.Name)
		}
	}
	want := []string{"Ringkasan", "Neraca", "NERACA (2)", "neraca (3)", strings.Repeat("x", 31), strings.Repeat("x", 27) + " (2)"}
	if strings.Join(nama, "|") != strings.Join(want, "|") {
		t.Fatalf("nama lembar %v", nama)
	}
}

func lembarUji(name string) Sheet {
	return Sheet{Name: name, ColumnWidths: []float64{10}, Rows: [][]Cell{{TextCell(name, Style{})}}}
}

// Buku kerja paket: Ringkasan LEBIH DULU, lalu satu lembar per laporan dalam
// urutan permintaan; kolom "Lembar" di Ringkasan menyebut nama yang benar-benar
// ada (sesudah dibuat unik).
func TestPackageWorkbook(t *testing.T) {
	text := PackageSummaryText{
		Title: "Paket Laporan", IncludedHeading: "Laporan yang disertakan", ExcludedHeading: "Tidak disertakan",
		NumberHeader: "No", ReportHeader: "Laporan", SheetHeader: "Lembar", ReasonHeader: "Alasan",
		NothingExcluded: "Tidak ada", SheetName: "Ringkasan",
	}
	entries := []PackageEntry{
		{Title: "Neraca", Sheet: lembarUji("Neraca")},
		{Title: "Laporan Laba / Rugi", Sheet: lembarUji("Laba Rugi")},
		{Title: "Neraca (pembanding)", Sheet: lembarUji("Neraca")},
	}
	excluded := []PackageExclusion{{Title: "Nilai Persediaan", Reason: "Modul Stok tidak aktif untuk PT ini"}}
	data, err := PackageWorkbook(text, "PT Contoh", "1 Januari 2026 – 31 Januari 2026", entries, excluded, time.Date(2026, 2, 1, 9, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	baca := func(nama string) string {
		for _, f := range zr.File {
			if f.Name == nama {
				rc, _ := f.Open()
				b, _ := io.ReadAll(rc)
				_ = rc.Close()
				return string(b)
			}
		}
		t.Fatalf("%s tidak ada", nama)
		return ""
	}
	wb := baca("xl/workbook.xml")
	for i, nama := range []string{"Ringkasan", "Neraca", "Laba Rugi", "Neraca (2)"} {
		if !strings.Contains(wb, `<sheet name="`+nama+`" sheetId="`+string(rune('1'+i))+`"`) {
			t.Errorf("lembar %d %q tidak ada di urutannya: %s", i+1, nama, wb)
		}
	}
	shared := baca("xl/sharedStrings.xml")
	for _, s := range []string{"PT Contoh", "Paket Laporan", "Neraca (2)", "Modul Stok tidak aktif untuk PT ini", "Laporan Laba / Rugi"} {
		if !strings.Contains(shared, s) {
			t.Errorf("Ringkasan tidak memuat %q", s)
		}
	}

	if _, err := PackageWorkbook(text, "PT", "p", nil, nil, time.Now()); err == nil {
		t.Error("paket tanpa laporan diterima")
	}
}
