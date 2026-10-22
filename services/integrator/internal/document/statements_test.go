package document

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// Lembar sebar Laba Rugi & Neraca dari berkas emas ANGKA `internal/ledgerread`
// (`../ledgerread/testdata/<kasus>.golden.json`, dihitung dari buku fixture
// bersama). Berkas emas lembar sebarnya (`testdata/<kasus>.golden.xlsx`) dibaca
// `tests/statements-golden.test.ts`, yang membandingkan ISI-nya dengan lembar
// jalur berkas TS (`buildReportPayload` → `buildReportSheet` → ExcelJS) atas
// buku yang sama.

const statementBooks = "../ledgerread/testdata/statement_books.json"

type statementBookMeta struct {
	Name        string `json:"name"`
	CompanyName string `json:"companyName"`
	PrintedAt   string `json:"printedAt"`
	CostCenters []struct {
		ID   int64  `json:"id"`
		Code string `json:"code"`
		Name string `json:"name"`
	} `json:"costCenters"`
	IncomeStmts []struct {
		Case       string `json:"case"`
		From       string `json:"from"`
		To         string `json:"to"`
		CostCenter string `json:"costCenter"`
	} `json:"incomeStatements"`
	BalanceSheets []struct {
		Case string `json:"case"`
		AsOf string `json:"asOf"`
	} `json:"balanceSheets"`
}

func loadStatementMeta(t *testing.T) []statementBookMeta {
	t.Helper()
	raw, err := os.ReadFile(statementBooks)
	if err != nil {
		t.Fatal(err)
	}
	var books []statementBookMeta
	if err := json.Unmarshal(raw, &books); err != nil {
		t.Fatal(err)
	}
	return books
}

func readNumbers(t *testing.T, name string, v any) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "ledgerread", "testdata", name+".golden.json"))
	if err != nil {
		t.Fatalf("%v — jalankan `go test ./internal/ledgerread -update` dulu", err)
	}
	if err := json.Unmarshal(raw, v); err != nil {
		t.Fatal(err)
	}
}

func compareGolden(t *testing.T, name string, build func() []byte) {
	t.Helper()
	got := build()
	if again := build(); !bytes.Equal(got, again) {
		t.Fatal("keluaran tidak deterministik")
	}
	path := filepath.Join("testdata", name+".golden.xlsx")
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
			"`bun run test tests/statements-golden.test.ts`", path)
	}
}

func TestStatementGoldenWorkbooks(t *testing.T) {
	n := 0
	for _, b := range loadStatementMeta(t) {
		printed, err := time.Parse(time.RFC3339, b.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		lookup := func(id int64) (string, string, bool, error) {
			for _, c := range b.CostCenters {
				if c.ID == id {
					return c.Code, c.Name, true, nil
				}
			}
			return "", "", false, nil
		}
		for _, c := range b.IncomeStmts {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var is ledgerread.IncomeStatement
				readNumbers(t, c.Case, &is)
				cc, err := ledgerread.ParseCostCenterFilter(c.CostCenter)
				if err != nil {
					t.Fatal(err)
				}
				label, err := CostCenterLabel(c.CostCenter, cc, lookup)
				if err != nil {
					t.Fatal(err)
				}
				period, err := PeriodRange(c.From, c.To, label)
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := IncomeStatementWorkbook(&is, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
		for _, c := range b.BalanceSheets {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var bs ledgerread.BalanceSheet
				readNumbers(t, c.Case, &bs)
				period, err := PeriodAsOf(c.AsOf)
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := BalanceSheetWorkbook(&bs, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
	}
	if n < 10 {
		t.Fatalf("kasus terlalu sedikit: %d", n)
	}
}

func TestGrossMarginNoteMatchesJS(t *testing.T) {
	cases := []struct {
		gp, sales ledgerread.Cents
		want      string
	}{
		{0, 0, ""}, // tanpa penjualan: tanpa marjin, bukan "0%"
		{462345654, 1449999975, "31,9% dari pendapatan"},
		{1, 8, "12,5% dari pendapatan"},
		{-1, 10000, "-0% dari pendapatan"},     // Math.round(−0,1) = −0; Intl mencetak "-0"
		{-25, 100, "-25% dari pendapatan"},     // −25,0 → "-25"
		{-125, 10000, "-1,2% dari pendapatan"}, // Math.round(−12,5) = −12 (setengah ke ATAS)
		{1234567, 100, "1.234.567% dari pendapatan"},
	}
	for _, c := range cases {
		if got := GrossMarginNote(c.gp, c.sales); got != c.want {
			t.Errorf("GrossMarginNote(%d, %d) = %q, mau %q", c.gp, c.sales, got, c.want)
		}
	}
}

func TestCostCenterLabelEdges(t *testing.T) {
	id := func(v int64) *int64 { return &v }
	none := func(int64) (string, string, bool, error) { return "", "", false, nil }
	found := func(int64) (string, string, bool, error) { return "CC01", "Cabang", true, nil }
	cases := []struct {
		raw    string
		filter ledgerread.CostCenterFilter
		lookup CostCenterLookup
		want   string
	}{
		{"", ledgerread.CostCenterFilter{}, none, ""},
		{"unassigned", ledgerread.CostCenterFilter{Active: true}, none, contract.CostCenterUnassignedLabel},
		// TS mencocokkan "unassigned" pada teks MENTAH — berspasi jatuh ke "#…".
		{" unassigned", ledgerread.CostCenterFilter{Active: true}, none, "#unassigned"},
		{"3", ledgerread.CostCenterFilter{Active: true, ID: id(3)}, found, "CC01 — Cabang"},
		{"3", ledgerread.CostCenterFilter{Active: true, ID: id(3)}, none, "#3"},
	}
	for _, c := range cases {
		got, err := CostCenterLabel(c.raw, c.filter, c.lookup)
		if err != nil || got != c.want {
			t.Errorf("CostCenterLabel(%q) = %q, %v; mau %q", c.raw, got, err, c.want)
		}
	}
}

func TestBalanceSheetEquityAlwaysHasResultLine(t *testing.T) {
	sh := BalanceSheetSheet(&ledgerread.BalanceSheet{Balanced: true}, "PT X", "Per 1 Januari 2026", time.Unix(0, 0))
	body := sh.Rows[6:]
	// Aset: judul, kalimat kosong, total · Liabilitas: sama · Ekuitas: judul,
	// baris hasil (nol), total · dua baris penutup.
	if len(body) != 11 {
		t.Fatalf("buku kosong: %d baris badan, mau 11", len(body))
	}
	if body[7][0].Text != contract.BalanceSheetCurrentNetIncomeLabel || body[7][1].Kind != CellNumber {
		t.Fatalf("baris hasil ekuitas: %+v", body[7])
	}
	if body[7][0].Style.Font.Bold {
		t.Fatal("baris hasil ekuitas adalah baris AKUN (tidak tebal)")
	}
	if body[1][1].Kind != CellEmpty || body[1][1].Style.Font.Bold {
		t.Fatal("sel nominal kalimat kosong harus kosong & tidak tebal")
	}
}
