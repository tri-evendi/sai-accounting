package document

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// Lembar sebar Rekap per Pihak, Kas & Bank, dan Realisasi vs Anggaran dari
// berkas emas ANGKA `internal/ledgerread` (`recap_test.go`). Berkas emas
// lembarnya dibaca `tests/recap-golden.test.ts`, yang membandingkan ISI-nya
// dengan lembar jalur berkas TS atas fixture yang sama.

// CashBankColsVariant: satu varian `?cols=` Kas & Bank yang ikut berkas emas —
// nilainya disebut juga di `tests/recap-golden.test.ts`.
const cashBankColsCase, cashBankColsVariant = "arus-kas-q1-2026", "closing"

type recapMeta struct {
	Budgets []struct {
		Book  string `json:"book"`
		Cases []struct {
			Case  string `json:"case"`
			Year  int    `json:"year"`
			Month int    `json:"month"`
		} `json:"cases"`
	} `json:"budgets"`
	PartyRecaps []struct {
		CompanyName string `json:"companyName"`
		PrintedAt   string `json:"printedAt"`
		Cases       []struct {
			Case string `json:"case"`
			Kind string `json:"kind"`
			From string `json:"from"`
			To   string `json:"to"`
			Cols string `json:"cols"`
		} `json:"cases"`
	} `json:"partyRecaps"`
}

func loadRecapMeta(t *testing.T) recapMeta {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "ledgerread", "testdata", "recap_books.json"))
	if err != nil {
		t.Fatal(err)
	}
	var m recapMeta
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestCashBankGoldenWorkbooks(t *testing.T) {
	n := 0
	for _, b := range loadStatementMeta(t) {
		printed, err := time.Parse(time.RFC3339, b.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range b.CashFlows {
			variants := []string{""}
			if c.Case == cashBankColsCase {
				variants = append(variants, cashBankColsVariant)
			}
			for _, cols := range variants {
				n++
				name := "kas-bank-" + c.Case
				if cols != "" {
					name += "-kolom-" + cols
				}
				t.Run(name, func(t *testing.T) {
					var cb ledgerread.CashBank
					readNumbers(t, "kas-bank-"+c.Case, &cb)
					period, err := PeriodRange(c.From, c.To, "")
					if err != nil {
						t.Fatal(err)
					}
					compareGolden(t, name, func() []byte {
						data, err := CashBankWorkbook(&cb, CatalogVisibleColumns(contract.CashBankColumns, cols), b.CompanyName, period, printed)
						if err != nil {
							t.Fatal(err)
						}
						return data
					})
				})
			}
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus Kas & Bank")
	}
}

func TestBudgetGoldenWorkbooks(t *testing.T) {
	books := map[string]statementBookMeta{}
	for _, b := range loadStatementMeta(t) {
		books[b.Name] = b
	}
	n := 0
	for _, fx := range loadRecapMeta(t).Budgets {
		b, ok := books[fx.Book]
		if !ok {
			t.Fatalf("buku %q", fx.Book)
		}
		printed, err := time.Parse(time.RFC3339, b.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range fx.Cases {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var rep ledgerread.BudgetRealization
				readNumbers(t, c.Case, &rep)
				period, err := BudgetPeriod(c.Year, c.Month)
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := BudgetWorkbook(&rep, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus anggaran")
	}
}

func TestPartyRecapGoldenWorkbooks(t *testing.T) {
	n := 0
	for _, fx := range loadRecapMeta(t).PartyRecaps {
		printed, err := time.Parse(time.RFC3339, fx.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range fx.Cases {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var rep ledgerread.PartyRecap
				readNumbers(t, c.Case, &rep)
				period, err := PeriodRange(c.From, c.To, "")
				if err != nil {
					t.Fatal(err)
				}
				specs, err := PartyRecapColumnsFor(c.Kind)
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := PartyRecapWorkbook(&rep, CatalogVisibleColumns(specs, c.Cols), fx.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus rekap pihak")
	}
}

func TestCatalogVisibleColumnsMirrorsResolveColumns(t *testing.T) {
	cases := map[string]string{
		"":                "party,docCount,gross,returns,net",
		"bukan,kolom":     "party,docCount,gross,returns,net",
		" net , gross":    "party,gross,net",
		"party":           "party",
		"returns,,party,": "party,returns",
	}
	for raw, want := range cases {
		var got []string
		for _, c := range CatalogVisibleColumns(contract.SalesByCustomerColumns, raw) {
			got = append(got, c.ID)
		}
		if strings.Join(got, ",") != want {
			t.Errorf("%q: %v, ingin %s", raw, got, want)
		}
	}
}

// Bentuk yang paling mudah salah: retur NEGATIF (atau nol), pihak tanpa nama
// diberi nama, catatan valas tanpa kurs di kaki, dan persen anggaran kosong
// untuk anggaran nol.
func TestRecapSheetShapes(t *testing.T) {
	ret := ledgerread.PartyRecap{
		Kind: contract.ReportPurchasesBySupplier,
		Rows: []ledgerread.PartyRecapRow{
			{DocCount: 2, GrossBase: 100_00, ReturnBase: 30_00, NetBase: 70_00},
			{DocCount: 1, GrossBase: 5_00, ReturnBase: -1_00, NetBase: 6_00},
		},
		Totals: ledgerread.PartyRecapTotals{DocCount: 3, GrossBase: 105_00, ReturnBase: 29_00, NetBase: 76_00, UnratedCount: 2},
	}
	s, err := PartyRecapSheet(&ret, contract.PurchasesBySupplierColumns, "PT", "Periode", time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	body := s.Rows[6:]
	if body[0][0].Text != contract.PurchasesBySupplierNoParty || body[0][3].Number != "-30" || body[1][3].Number != "0" {
		t.Errorf("baris: %+v / %+v", body[0], body[1])
	}
	if body[0][1].Style.NumFmt != "" || body[0][1].Number != "2" {
		t.Errorf("jumlah dokumen bukan cacah polos: %+v", body[0][1])
	}
	if last := body[len(body)-1][0].Text; last != "Catatan: 2 dokumen valas tanpa kurs tidak ikut dijumlahkan." {
		t.Errorf("catatan: %q", last)
	}

	rep := ledgerread.BudgetRealization{
		Rows:   []ledgerread.BudgetVarianceRow{{Code: "6101", Name: "Gaji", Actual: 5_00, Variance: 5_00, Status: contract.BudgetVarianceOver}},
		Totals: ledgerread.BudgetTotals{Actual: 5_00, Variance: 5_00, AlertCount: 1},
	}
	b := BudgetSheet(&rep, "PT", "Tahun 2026", time.Unix(0, 0))
	row := b.Rows[6]
	if row[4].Kind != CellEmpty || row[5].Text != "Di atas anggaran" {
		t.Errorf("baris anggaran nol: %+v", row)
	}
	if total := b.Rows[7]; total[0].Text != "Total" || total[5].Text != "1 akun melewati ambang" {
		t.Errorf("baris total: %+v", total)
	}
	if p, _ := BudgetPeriod(2026, 3); p != "Maret 2026" {
		t.Errorf("periode bulan: %q", p)
	}
	if p, _ := BudgetPeriod(2026, 0); p != "Tahun 2026" {
		t.Errorf("periode setahun: %q", p)
	}
}
