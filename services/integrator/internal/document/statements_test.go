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
	IncomeComparisons []struct {
		Case       string `json:"case"`
		From       string `json:"from"`
		To         string `json:"to"`
		CostCenter string `json:"costCenter"`
	} `json:"incomeComparisons"`
	BalanceComparisons []struct {
		Case string `json:"case"`
		AsOf string `json:"asOf"`
	} `json:"balanceComparisons"`
	// Arus Kas (tahap 1d, 23 Okt 2026) — `cash_flow_test.go`.
	CashFlows []struct {
		Case string `json:"case"`
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"cashFlows"`
}

// Berkas emas angka komparatif (`ledgerread.IncomeComparisonGolden` /
// `BalanceComparisonGolden` — tipe tes paket itu, jadi bentuknya disalin).
type incomeComparison struct {
	Current   ledgerread.IncomeStatement `json:"current"`
	Prior     ledgerread.IncomeStatement `json:"prior"`
	PriorFrom time.Time                  `json:"priorFrom"`
	PriorTo   time.Time                  `json:"priorTo"`
}

type balanceComparison struct {
	Current   ledgerread.BalanceSheet `json:"current"`
	Prior     ledgerread.BalanceSheet `json:"prior"`
	PriorAsOf time.Time               `json:"priorAsOf"`
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
					data, err := IncomeStatementWorkbook(&is, nil, b.CompanyName, period, printed)
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
					data, err := BalanceSheetWorkbook(&bs, nil, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
		for _, c := range b.IncomeComparisons {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var g incomeComparison
				readNumbers(t, c.Case, &g)
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
				priorPeriod, err := PriorPeriodRange(g.PriorFrom, g.PriorTo)
				if err != nil {
					t.Fatal(err)
				}
				prior := &IncomeStatementPrior{Statement: &g.Prior, Period: priorPeriod}
				compareGolden(t, c.Case, func() []byte {
					data, err := IncomeStatementWorkbook(&g.Current, prior, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
		for _, c := range b.BalanceComparisons {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var g balanceComparison
				readNumbers(t, c.Case, &g)
				period, err := PeriodAsOf(c.AsOf)
				if err != nil {
					t.Fatal(err)
				}
				priorPeriod, err := PriorPeriodAsOf(g.PriorAsOf)
				if err != nil {
					t.Fatal(err)
				}
				prior := &BalanceSheetPrior{Statement: &g.Prior, Period: priorPeriod}
				compareGolden(t, c.Case, func() []byte {
					data, err := BalanceSheetWorkbook(&g.Current, prior, b.CompanyName, period, printed)
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
	sh := BalanceSheetSheet(&ledgerread.BalanceSheet{Balanced: true}, nil, "PT X", "Per 1 Januari 2026", time.Unix(0, 0))
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

func TestComparePercentMatchesJS(t *testing.T) {
	// `percentChange(c / 100, p / 100)` + `comparePercentText` dijalankan di
	// vitest (Node), 22 Okt 2026 — bukan dugaan.
	cases := []struct {
		cur, prior ledgerread.Cents
		want       string
	}{
		{100_00, 0, ""},           // pembanding nol: tanpa persen (sel kosong)
		{150_00, 100_00, "+50%"},  // naik
		{50_00, 100_00, "-50%"},   // turun
		{100_00, 100_00, "0%"},    // tetap — tanpa "+"
		{-50_00, -100_00, "+50%"}, // rugi mengecil = PERBAIKAN (dasar nilai mutlak)
		{99_99, 100_00, "-0%"},    // Math.round(−0,1) = −0 → "-0"
		{1_00, 3_00, "-66,7%"},    // −666,67 → −667 → −66,7
		{1_00, 1, "+9.900%"},      // pemisah ribuan id-ID
		{100_05, 100_00, "0%"},    // 0,4999999… dalam float — bukan 0,5
		{100_10, 100_00, "+0,1%"},
		{3, 2, "+50%"},
		{0, 100_10, "-100%"}, // akun yang hanya ada di pembanding
		{-1, 2, "-150%"},     // sen negatif
		{12_345_678_90, 1_00, "+1.234.567.790%"},
	}
	for _, c := range cases {
		got := ""
		if v, ok := ComparePercent(c.cur, c.prior); ok {
			got = PercentText(v)
		}
		if got != c.want {
			t.Errorf("persen(%s, %s) = %q, mau %q", c.cur, c.prior, got, c.want)
		}
	}
}

func TestCompareLinesOrdersPriorOnlyByLocaleCompare(t *testing.T) {
	// Masukan pembanding dalam urutan BYTE (kolasi "C" basis data): baris yang
	// hanya ada di pembanding tetap keluar dalam urutan `localeCompare`.
	cur := []ledgerread.StatementLine{{Code: "4101", Name: "Penjualan", Amount: 5}}
	prior := []ledgerread.StatementLine{
		{Code: "4101", Name: "Penjualan (lama)", Amount: 3},
		{Code: "4B01", Name: "Sewa", Amount: 1},
		{Code: "4_01", Name: "Ekspor", Amount: 2},
		{Code: "4a01", Name: "Jasa", Amount: 4},
	}
	got := compareLines(cur, prior)
	want := []comparedLine{
		{code: "4101", name: "Penjualan", current: 5, prior: 3},
		{code: "4_01", name: "Ekspor", prior: 2},
		{code: "4a01", name: "Jasa", prior: 4},
		{code: "4B01", name: "Sewa", prior: 1},
	}
	if len(got) != len(want) {
		t.Fatalf("%d baris, mau %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("baris %d = %+v, mau %+v", i, got[i], want[i])
		}
	}
}

func TestBalanceSheetCompareMirrorsSplitTrap(t *testing.T) {
	// Berjalan SATU baris "Akumulasi", pembanding terpecah: baris berjalan
	// bersanding dengan laba tahun LALU pembanding; laba tahun berjalan
	// pembanding tidak tercetak (09 §9, jebakan 3 — disalin, bukan diperbaiki).
	cur := &ledgerread.BalanceSheet{NetIncome: 70_00, Balanced: true}
	pr := &ledgerread.BalanceSheet{NetIncome: 50_00, PriorUnclosedIncome: -30_00, CurrentYearIncome: 80_00, EquitySplitJS: true}
	sh := BalanceSheetSheet(cur, &BalanceSheetPrior{Statement: pr, Period: "Per 1 Januari 2025"}, "PT X", "Per 1 Januari 2026", time.Unix(0, 0))
	var equityLines [][]Cell
	for _, r := range sh.Rows {
		if len(r) == 4 && r[0].Text == contract.BalanceSheetCurrentNetIncomeLabel {
			equityLines = append(equityLines, r)
		}
	}
	if len(equityLines) != 1 {
		t.Fatalf("baris hasil ekuitas: %d, mau 1", len(equityLines))
	}
	if got := equityLines[0][2].Number; got != "-30" {
		t.Fatalf("pembanding baris Akumulasi = %s, mau -30 (laba tahun LALU pembanding)", got)
	}
	// Tanpa pecahan JS: pembandingnya laba bersih pembanding seluruhnya.
	pr.EquitySplitJS = false
	sh = BalanceSheetSheet(cur, &BalanceSheetPrior{Statement: pr, Period: "Per 1 Januari 2025"}, "PT X", "Per 1 Januari 2026", time.Unix(0, 0))
	for _, r := range sh.Rows {
		if len(r) == 4 && r[0].Text == contract.BalanceSheetCurrentNetIncomeLabel && r[2].Number != "50" {
			t.Fatalf("tanpa pecahan: pembanding %s, mau 50", r[2].Number)
		}
	}
}
