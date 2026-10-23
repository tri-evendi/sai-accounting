package document

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// Lembar sebar laporan stok dari berkas emas ANGKA `internal/ledgerread`
// (`../ledgerread/testdata/<kasus>.golden.json`, buku `stock_books.json`).
// Berkas emas lembarnya dibaca `tests/stock-golden.test.ts`, yang
// membandingkan ISI-nya dengan lembar jalur berkas TS (`buildReportPayload` →
// `buildReportSheet` → ExcelJS) atas buku yang sama.

type stockCaseMeta struct {
	Case string `json:"case"`
	From string `json:"from"`
	To   string `json:"to"`
	Cols string `json:"cols"`
}

type stockBookMeta struct {
	Name            string          `json:"name"`
	CompanyName     string          `json:"companyName"`
	PrintedAt       string          `json:"printedAt"`
	StockValues     []stockCaseMeta `json:"stockValues"`
	StockMovements  []stockCaseMeta `json:"stockMovements"`
	OpnameHistories []stockCaseMeta `json:"opnameHistories"`
}

func loadStockMeta(t *testing.T) []stockBookMeta {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "ledgerread", "testdata", "stock_books.json"))
	if err != nil {
		t.Fatal(err)
	}
	var books []stockBookMeta
	if err := json.Unmarshal(raw, &books); err != nil {
		t.Fatal(err)
	}
	return books
}

func TestStockGoldenWorkbooks(t *testing.T) {
	n := 0
	for _, b := range loadStockMeta(t) {
		printed, err := time.Parse(time.RFC3339, b.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range b.StockValues {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var rep ledgerread.StockValueReport
				readNumbers(t, c.Case, &rep)
				period, err := StockValuePeriod(c.From, c.To)
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := StockValueWorkbook(&rep, c.Cols, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
		for _, c := range b.StockMovements {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var rep ledgerread.StockMovementReport
				readNumbers(t, c.Case, &rep)
				period, err := PeriodRange(c.From, c.To, "")
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := StockMovementWorkbook(&rep, c.Cols, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
		for _, c := range b.OpnameHistories {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var h ledgerread.OpnameHistory
				readNumbers(t, c.Case, &h)
				period, err := PeriodRange(c.From, c.To, "")
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := OpnameHistoryWorkbook(&h, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
	}
	if n < 15 {
		t.Fatalf("fixture stok terlalu sedikit: %d kasus", n)
	}
}

// Pilihan kolom: `name` selalu, "Diolah" hanya bila periodenya punya mutasi
// olah — pilihan pengguna hanya MENGURANGI.
func TestStockVisibleColumns(t *testing.T) {
	ids := func(cols []contract.StockColumn) []string {
		var out []string
		for _, c := range cols {
			out = append(out, c.ID)
		}
		return out
	}
	noProcess := func(id string) bool { return id != "processed" }
	all := func(string) bool { return true }
	cases := []struct {
		specs []contract.StockColumn
		raw   string
		avail func(string) bool
		want  []string
	}{
		{contract.StockMovementColumns, "", all, []string{"name", "unit", "opening", "movedIn", "movedOut", "processed", "closing"}},
		{contract.StockMovementColumns, "", noProcess, []string{"name", "unit", "opening", "movedIn", "movedOut", "closing"}},
		{contract.StockMovementColumns, "processed", noProcess, []string{"name"}},
		{contract.StockMovementColumns, " closing , asing", all, []string{"name", "closing"}},
		{contract.StockValueColumns, "code", all, []string{"code", "name"}},
		{contract.StockValueColumns, "asing", all, []string{"code", "name", "unit", "openingQty", "openingValue", "inQty", "inValue", "outQty", "outValue", "closingQty", "closingValue"}},
	}
	for _, c := range cases {
		got := ids(StockVisibleColumns(c.specs, c.raw, c.avail))
		if len(got) != len(c.want) {
			t.Errorf("%q: %v, mau %v", c.raw, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("%q: %v, mau %v", c.raw, got, c.want)
				break
			}
		}
	}
}

// Tanggal sesi opname berhari DUA digit ("05 Januari 2026"), beda dari
// `formatDate` laporan lain.
func TestOpnameDateText(t *testing.T) {
	got, err := opnameDateText("2026-01-05")
	if err != nil || got != "05 Januari 2026" {
		t.Fatalf("%q %v", got, err)
	}
}
