package document

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// Berkas emas ditulis ulang dengan bendera -update. Berkas yang sama DIBACA sisi TS
// (`tests/trial-balance-xlsx-golden.test.ts`), yang membandingkan ISI-nya
// dengan lembar dari `src/lib/xlsx.ts` — jadi `bun run verify` membuktikan
// paritas lintas bahasa tanpa toolchain Go.
var update = flag.Bool("update", false, "tulis ulang testdata/*.golden.xlsx")

func TestMain(m *testing.M) {
	// Baris "Dicetak" memakai zona proses; dipaku supaya berkas emas tidak
	// bergantung pada TZ mesin yang menjalankan tes.
	time.Local = time.UTC
	os.Exit(m.Run())
}

type fixture struct {
	Name        string `json:"name"`
	CompanyName string `json:"companyName"`
	AsOf        string `json:"asOf"`
	PrintedAt   string `json:"printedAt"`
	Rows        []struct {
		Code   string `json:"code"`
		Name   string `json:"name"`
		Debit  string `json:"debit"`
		Credit string `json:"credit"`
	} `json:"rows"`
	TotalDebit  string `json:"totalDebit"`
	TotalCredit string `json:"totalCredit"`
	Balanced    bool   `json:"balanced"`
}

func cents(t *testing.T, s string) ledgerread.Cents {
	t.Helper()
	c, err := ledgerread.ParseCents(s)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func loadFixtures(t *testing.T) []fixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "trial_balance_fixtures.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fx []fixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx) < 3 {
		t.Fatalf("fixture terlalu sedikit: %d", len(fx))
	}
	return fx
}

func (f fixture) build(t *testing.T) []byte {
	t.Helper()
	tb := &ledgerread.TrialBalance{
		TotalDebit:  cents(t, f.TotalDebit),
		TotalCredit: cents(t, f.TotalCredit),
		Balanced:    f.Balanced,
	}
	for _, r := range f.Rows {
		tb.Rows = append(tb.Rows, ledgerread.TrialBalanceRow{
			Code: r.Code, Name: r.Name, Debit: cents(t, r.Debit), Credit: cents(t, r.Credit),
		})
	}
	period, err := PeriodAsOf(f.AsOf)
	if err != nil {
		t.Fatal(err)
	}
	printed, err := time.Parse(time.RFC3339, f.PrintedAt)
	if err != nil {
		t.Fatal(err)
	}
	data, err := TrialBalanceWorkbook(tb, f.CompanyName, period, printed)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestGoldenWorkbooks(t *testing.T) {
	for _, f := range loadFixtures(t) {
		t.Run(f.Name, func(t *testing.T) {
			got := f.build(t)
			// Dua kali dari masukan yang sama = byte yang sama. Tanpa ini
			// berkas emas tidak berarti apa pun.
			if again := f.build(t); !bytes.Equal(got, again) {
				t.Fatal("keluaran tidak deterministik")
			}
			path := filepath.Join("testdata", f.Name+".golden.xlsx")
			if *update {
				if err := os.WriteFile(path, got, 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("%v — jalankan `go test ./internal/document -update`", err)
			}
			if !bytes.Equal(got, want) {
				t.Fatalf("%s basi — jalankan `go test ./internal/document -update` lalu "+
					"`bun run test tests/trial-balance-xlsx-golden.test.ts`", path)
			}
		})
	}
}

func TestEveryPartIsWellFormedXML(t *testing.T) {
	for _, f := range loadFixtures(t) {
		data := f.build(t)
		zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			t.Fatal(err)
		}
		for _, zf := range zr.File {
			rc, err := zf.Open()
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := io.ReadAll(rc)
			_ = rc.Close()
			dec := xml.NewDecoder(bytes.NewReader(raw))
			for {
				if _, err := dec.Token(); errors.Is(err, io.EOF) {
					break
				} else if err != nil {
					t.Fatalf("%s/%s: %v", f.Name, zf.Name, err)
				}
			}
		}
	}
}

func TestEmptyBookHasOneSentenceAndNoTotal(t *testing.T) {
	sh := TrialBalanceSheet(&ledgerread.TrialBalance{Balanced: true}, "PT X", "Per 1 Januari 2026", time.Unix(0, 0))
	body := sh.Rows[6:]
	if len(body) != 1 {
		t.Fatalf("buku kosong: %d baris badan, mau 1", len(body))
	}
	if body[0][1].Text != contract.TrialBalanceEmptyLabel {
		t.Fatalf("kalimat buku kosong: %q", body[0][1].Text)
	}
	for _, i := range []int{0, 2, 3} {
		if body[0][i].Kind != CellEmpty {
			t.Fatalf("sel %d buku kosong harus KOSONG (bukan nol)", i)
		}
	}
}

func TestTotalRowCarriesBalanceNote(t *testing.T) {
	tb := &ledgerread.TrialBalance{
		Rows:       []ledgerread.TrialBalanceRow{{Code: "1", Name: "Kas", Debit: 100}},
		TotalDebit: 100,
	}
	sh := TrialBalanceSheet(tb, "PT X", "p", time.Unix(0, 0))
	last := sh.Rows[len(sh.Rows)-1]
	if want := contract.TrialBalanceTotalLabel + " " + contract.TrialBalanceNoteUnbalanced; last[1].Text != want {
		t.Fatalf("baris Total: %q, mau %q", last[1].Text, want)
	}
	if !last[2].Style.Font.Bold || last[2].Style.NumFmt != contract.MoneyNumberFormat {
		t.Fatalf("nominal Total harus tebal & berformat Rp: %+v", last[2].Style)
	}
	// Nol tetap ANGKA nol (#241), bukan "-".
	if row := sh.Rows[6]; row[3].Kind != CellNumber || row[3].Number != "0" {
		t.Fatalf("kredit nol harus angka 0: %+v", row[3])
	}
}

func TestPeriodAsOf(t *testing.T) {
	cases := map[string]string{
		"2026-01-05": "Per 5 Januari 2026",
		"2025-12-31": "Per 31 Desember 2025",
		"2026-10-22": "Per 22 Oktober 2026",
	}
	for in, want := range cases {
		got, err := PeriodAsOf(in)
		if err != nil || got != want {
			t.Errorf("PeriodAsOf(%q) = %q, %v; mau %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "2026-1-5", "2026-02-30", "kemarin"} {
		if _, err := PeriodAsOf(bad); err == nil {
			t.Errorf("PeriodAsOf(%q) harus galat", bad)
		}
	}
}

func TestPrintedStampMatchesNodeShape(t *testing.T) {
	// Node: new Date(Date.UTC(2026,0,5,1,2,3)).toLocaleString("id-ID") di UTC.
	got := PrintedStamp(time.Date(2026, 1, 5, 1, 2, 3, 0, time.UTC))
	if got != "5/1/2026, 01.02.03" {
		t.Fatalf("PrintedStamp = %q", got)
	}
}

func TestNumberText(t *testing.T) {
	cases := map[ledgerread.Cents]string{0: "0", 1: "0.01", 10: "0.1", 100: "1", 123456789: "1234567.89", 123456780: "1234567.8", -50: "-0.5"}
	for c, want := range cases {
		if got := numberText(c); got != want {
			t.Errorf("numberText(%d) = %q, mau %q", c, got, want)
		}
	}
}

func TestFileName(t *testing.T) {
	now := time.Date(2026, 10, 22, 23, 30, 0, 0, time.FixedZone("WIB", 7*3600))
	if got := FileName("Neraca Saldo", now); got != "Neraca_Saldo_2026-10-22.xlsx" {
		t.Fatalf("FileName = %q (tanggal wajib UTC, seperti toISOString)", got)
	}
	if got := FileName("///", now); got != "Laporan_2026-10-22.xlsx" {
		t.Fatalf("FileName kosong = %q", got)
	}
}

func TestWriteResult(t *testing.T) {
	root := t.TempDir()
	ref, err := WriteResult(root, contract.KindReportExportGo, 42, "Neraca_Saldo_2026-10-22.xlsx", []byte("isi"))
	if err != nil {
		t.Fatal(err)
	}
	if want := "report-export_go-42/Neraca_Saldo_2026-10-22.xlsx"; ref != want {
		t.Fatalf("ref = %q, mau %q", ref, want)
	}
	info, err := os.Stat(filepath.Join(root, ref))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode berkas %o, mau 600", info.Mode().Perm())
	}
	dir, _ := os.Stat(filepath.Join(root, "report-export_go-42"))
	if dir.Mode().Perm() != 0o700 {
		t.Fatalf("mode direktori %o, mau 700", dir.Mode().Perm())
	}
	entries, _ := os.ReadDir(filepath.Join(root, "report-export_go-42"))
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".partial") {
			t.Fatal("berkas .partial tertinggal")
		}
	}
	for _, bad := range []string{"../x.xlsx", "a/b.xlsx", ".x", "", "x y.xlsx"} {
		if _, err := WriteResult(root, contract.KindReportExportGo, 43, bad, nil); err == nil {
			t.Errorf("nama %q harus ditolak", bad)
		}
	}
	if _, err := WriteResult(root, contract.KindReportExportGo, 0, "a.xlsx", nil); err == nil {
		t.Error("jobId 0 harus ditolak")
	}
}

func TestColName(t *testing.T) {
	for i, want := range map[int]string{0: "A", 25: "Z", 26: "AA", 27: "AB", 701: "ZZ", 702: "AAA"} {
		if got := colName(i); got != want {
			t.Errorf("colName(%d) = %q, mau %q", i, got, want)
		}
	}
}
