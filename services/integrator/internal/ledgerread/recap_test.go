package ledgerread

import (
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Berkas emas Rekap per Pihak, Laporan Kas & Bank, dan Realisasi vs Anggaran
// (tahap 1d, gelombang A) — ditulis ulang dengan `-update`, dibaca dua pihak
// lain dengan pola yang sama dengan `statements_test.go`:
//
//   - `tests/recap-golden.test.ts` menjalankan pembaca TS atas fixture yang
//     SAMA (klien palsu) dan membandingkannya dengan berkas emas ini memakai
//     pembanding paritas produksi (`src/lib/recap-parity.ts`);
//   - `internal/document` merakit lembar sebarnya dari berkas emas ini.
//
// Fixture: `testdata/recap_books.json`. Anggaran memakai buku
// `statement_books.json` (jurnalnya) ditambah baris anggaran & target; rekap
// pihak membawa dokumennya sendiri. Penyaring di bawah meniru SQL-nya
// (`budgetEntriesSQL`, `salesInvoicesSQL`, …) — SQL-nya sendiri dibuktikan
// paritas atas buku sungguhan.

type recapMoney struct {
	Currency   string  `json:"currency"`
	Rate       *string `json:"rate"`
	BaseAmount *string `json:"baseAmount"`
}

type recapBooks struct {
	Budgets []struct {
		Book    string `json:"book"`
		Budgets []struct {
			AccountID int    `json:"accountId"`
			Year      int    `json:"year"`
			Month     int    `json:"month"`
			Amount    string `json:"amount"`
		} `json:"budgets"`
		SalesTargets []struct {
			Year   int    `json:"year"`
			Month  int    `json:"month"`
			Amount string `json:"amount"`
		} `json:"salesTargets"`
		Cases []struct {
			Case  string `json:"case"`
			Year  int    `json:"year"`
			Month int    `json:"month"`
		} `json:"cases"`
	} `json:"budgets"`
	PartyRecaps []struct {
		Name      string `json:"name"`
		Customers []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"customers"`
		Suppliers []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"suppliers"`
		Invoices []struct {
			recapMoney
			Date       time.Time `json:"date"`
			Status     string    `json:"status"`
			CustomerID *int64    `json:"customerId"`
			TaxAmount  string    `json:"taxAmount"`
			Items      []struct {
				Quantity string `json:"quantity"`
				Price    string `json:"price"`
			} `json:"items"`
		} `json:"invoices"`
		SalesReturns []struct {
			recapMoney
			Date       time.Time `json:"date"`
			Status     string    `json:"status"`
			CustomerID *int64    `json:"customerId"`
			Subtotal   string    `json:"subtotal"`
			TaxAmount  string    `json:"taxAmount"`
		} `json:"salesReturns"`
		Purchases []struct {
			recapMoney
			ID         int64     `json:"id"`
			Date       time.Time `json:"date"`
			Type       string    `json:"type"`
			SupplierID int64     `json:"supplierId"`
			Amount     string    `json:"amount"`
			TaxAmount  string    `json:"taxAmount"`
		} `json:"purchases"`
		PurchaseReturns []struct {
			recapMoney
			Date       time.Time `json:"date"`
			Status     string    `json:"status"`
			PurchaseID int64     `json:"purchaseId"`
			SupplierID *int64    `json:"supplierId"`
			Subtotal   string    `json:"subtotal"`
			TaxAmount  string    `json:"taxAmount"`
		} `json:"purchaseReturns"`
		Cases []struct {
			Case string `json:"case"`
			Kind string `json:"kind"`
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"cases"`
	} `json:"partyRecaps"`
}

func loadRecapBooks(t *testing.T) recapBooks {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "recap_books.json"))
	if err != nil {
		t.Fatal(err)
	}
	var b recapBooks
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	return b
}

func mustRat(t *testing.T, s string) *big.Rat {
	t.Helper()
	r, err := parseRat(s)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func mustRatPtr(t *testing.T, s *string) *big.Rat {
	t.Helper()
	r, err := parseRatPtr(s)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func (m recapMoney) base(t *testing.T, amount *big.Rat) *big.Rat {
	t.Helper()
	return toBase(moneyRow{amount: amount, currency: m.Currency, rate: mustRatPtr(t, m.Rate), base: mustRatPtr(t, m.BaseAmount)})
}

func inPeriod(d, from, to time.Time) bool { return !d.Before(from) && !d.After(to) }

// BudgetPeriodBounds: `budgetPeriodRange` TS — sebulan, atau setahun bila
// bulan 0 — di kalender Jakarta. HANYA tes: pelari menerima instannya dari
// penerbit TS, dan `tests/recap-golden.test.ts` memeriksa keduanya sama.
func budgetPeriodBounds(t *testing.T, year, month int) (time.Time, time.Time) {
	t.Helper()
	if month == 0 {
		return businessDay(t, fmt.Sprintf("%d-01-01", year), false), businessDay(t, fmt.Sprintf("%d-12-31", year), true)
	}
	first := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1)
	return businessDay(t, first.Format("2006-01-02"), false), businessDay(t, last.Format("2006-01-02"), true)
}

func TestBudgetGoldens(t *testing.T) {
	books := loadStatementBooks(t)
	n := 0
	for _, fx := range loadRecapBooks(t).Budgets {
		var book *statementBook
		for i := range books {
			if books[i].Name == fx.Book {
				book = &books[i]
			}
		}
		if book == nil {
			t.Fatalf("buku %q tak ada di statement_books.json", fx.Book)
		}
		accounts := map[int]fixtureAccount{}
		for _, a := range book.Accounts {
			accounts[a.ID] = a
		}
		for _, c := range fx.Cases {
			n++
			t.Run(c.Case, func(t *testing.T) {
				from, to := budgetPeriodBounds(t, c.Year, c.Month)
				var entries []BudgetEntry
				for _, b := range fx.Budgets {
					if b.Year != c.Year || (c.Month != 0 && b.Month != c.Month) {
						continue
					}
					a, ok := accounts[b.AccountID]
					if !ok {
						t.Fatalf("anggaran ke akun %d yang tak ada", b.AccountID)
					}
					amount, err := ParseCents(b.Amount)
					if err != nil {
						t.Fatal(err)
					}
					entries = append(entries, BudgetEntry{AccountCode: a.Code, AccountName: a.Name, AccountType: a.Type, Amount: amount})
				}
				var targets []Cents
				for _, s := range fx.SalesTargets {
					if s.Year != c.Year || (c.Month != 0 && s.Month != c.Month) {
						continue
					}
					amount, err := ParseCents(s.Amount)
					if err != nil {
						t.Fatal(err)
					}
					targets = append(targets, amount)
				}
				sums := book.sumLines(t, netsFilter{from: &from, to: &to, excludeClosing: true})
				rep := BuildBudgetRealization(entries, sums, targets, contract.BudgetVarianceThresholdPct)
				rep.Year, rep.Month, rep.From, rep.To = c.Year, c.Month, from.UTC(), to.UTC()
				golden(t, c.Case, rep)
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus anggaran")
	}
}

func TestPartyRecapGoldens(t *testing.T) {
	n := 0
	for _, fx := range loadRecapBooks(t).PartyRecaps {
		customers := map[int64]string{}
		for _, c := range fx.Customers {
			customers[c.ID] = c.Name
		}
		suppliers := map[int64]string{}
		for _, s := range fx.Suppliers {
			suppliers[s.ID] = s.Name
		}
		nameOf := func(m map[int64]string, id *int64) *string {
			if id == nil {
				return nil
			}
			if s, ok := m[*id]; ok {
				return &s
			}
			return nil
		}
		purchaseSupplier := map[int64]int64{}
		for _, p := range fx.Purchases {
			purchaseSupplier[p.ID] = p.SupplierID
		}
		for _, c := range fx.Cases {
			n++
			t.Run(c.Case, func(t *testing.T) {
				from, to := businessDay(t, c.From, false), businessDay(t, c.To, true)
				var docs, returns []PartyDoc
				switch c.Kind {
				case contract.ReportSalesByCustomer:
					for _, inv := range fx.Invoices {
						if !inPeriod(inv.Date, from, to) || inv.Status == string(contract.InvoiceStatusCanceled) {
							continue
						}
						gross := mustRat(t, inv.TaxAmount)
						for _, it := range inv.Items {
							gross = addRat(gross, mulRat(mustRat(t, it.Quantity), mustRat(t, it.Price)))
						}
						docs = append(docs, PartyDoc{PartyID: inv.CustomerID, PartyName: nameOf(customers, inv.CustomerID), GrossBase: inv.base(t, gross)})
					}
					for _, r := range fx.SalesReturns {
						if !inPeriod(r.Date, from, to) || r.Status == "canceled" {
							continue
						}
						amount := addRat(mustRat(t, r.Subtotal), mustRat(t, r.TaxAmount))
						returns = append(returns, PartyDoc{PartyID: r.CustomerID, PartyName: nameOf(customers, r.CustomerID), GrossBase: r.base(t, amount)})
					}
				case contract.ReportPurchasesBySupplier:
					for _, p := range fx.Purchases {
						if !inPeriod(p.Date, from, to) || p.Type != "purchase" {
							continue
						}
						id := p.SupplierID
						amount := addRat(mustRat(t, p.Amount), mustRat(t, p.TaxAmount))
						docs = append(docs, PartyDoc{PartyID: &id, PartyName: nameOf(suppliers, &id), GrossBase: p.base(t, amount)})
					}
					for _, r := range fx.PurchaseReturns {
						if !inPeriod(r.Date, from, to) || r.Status == "canceled" {
							continue
						}
						id := purchaseSupplier[r.PurchaseID]
						if r.SupplierID != nil {
							id = *r.SupplierID
						}
						amount := addRat(mustRat(t, r.Subtotal), mustRat(t, r.TaxAmount))
						returns = append(returns, PartyDoc{PartyID: &id, PartyName: nameOf(suppliers, &id), GrossBase: r.base(t, amount)})
					}
				default:
					t.Fatalf("jenis %q", c.Kind)
				}
				rep := SummarizeParties(c.Kind, docs, returns)
				rep.From, rep.To = from.UTC(), to.UTC()
				golden(t, c.Case, rep)
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus rekap pihak")
	}
}

// Laporan Kas & Bank dari setiap kasus Arus Kas `statement_books.json` —
// `kas-bank-<kasus arus kas>`.
func TestCashBankGoldens(t *testing.T) {
	n := 0
	for _, b := range loadStatementBooks(t) {
		for _, c := range b.CashFlows {
			n++
			t.Run(c.Case, func(t *testing.T) {
				from, to := businessDay(t, c.From, false), businessDay(t, c.To, true)
				golden(t, "kas-bank-"+c.Case, CashBankFrom(b.cashFlowAt(t, from, to), from, to))
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus arus kas")
	}
}

func TestComputeVarianceFollowsJSFloat(t *testing.T) {
	cases := []struct {
		budget, actual Cents
		variance       Cents
		pct            *float64
	}{
		{9_000_000_000, 10_000_000_050, 1_000_000_050, ptrF(11.11)},
		{0, -100_000_025, -100_000_025, nil},
		{10_000, 0, -10_000, ptrF(-100)},
		{25_000_000, 25_000_075, 75, ptrF(0)}, // 0,0003% → 0, bukan −0
		{-50_000, 50_000, 100_000, ptrF(-200)},
		{300, 100, -200, ptrF(-66.67)},
	}
	for _, c := range cases {
		v, pct := ComputeVariance(c.budget, c.actual)
		if v != c.variance || (pct == nil) != (c.pct == nil) || (pct != nil && *pct != *c.pct) {
			t.Errorf("ComputeVariance(%d, %d) = %d, %v", c.budget, c.actual, v, deref(pct))
		}
	}
	// Ambang INKLUSIF di sisi "sesuai": tepat +10% / −10% belum melewati.
	if s := ClassifyVariance(10_000, 11_000, 10); s != contract.BudgetVarianceOnTarget {
		t.Errorf("+10%% → %s", s)
	}
	if s := ClassifyVariance(10_000, 8_999, 10); s != contract.BudgetVarianceUnder {
		t.Errorf("−10,01%% → %s", s)
	}
	if s := ClassifyVariance(0, 0, 10); s != contract.BudgetVarianceOnTarget {
		t.Errorf("nol lawan nol → %s", s)
	}
	if s := ClassifyVariance(0, 1, 10); s != contract.BudgetVarianceOver {
		t.Errorf("anggaran nol, realisasi positif → %s", s)
	}
}

func deref(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func TestSummarizePartiesOrderAndUnrated(t *testing.T) {
	id := func(v int64) *int64 { return &v }
	name := func(s string) *string { return &s }
	rat := func(s string) *big.Rat { return mustRat(t, s) }
	rep := SummarizeParties(contract.ReportSalesByCustomer, []PartyDoc{
		{PartyID: id(2), PartyName: name("beta"), GrossBase: rat("100")},
		{PartyID: nil, PartyName: nil, GrossBase: rat("100")},
		{PartyID: id(1), PartyName: nil, GrossBase: nil},
		{PartyID: id(1), PartyName: name("Alfa"), GrossBase: rat("100.004")},
		{PartyID: id(1), PartyName: name("Alfa"), GrossBase: rat("0.002")},
	}, []PartyDoc{{PartyID: id(3), PartyName: name("Gamma"), GrossBase: rat("50")}})
	// Seri bersih 100 (Alfa 100,006 → 100,01? tidak: dibulatkan SESUDAH dijumlah
	// → 100,01) — Alfa di atas; lalu "" (tanpa pihak) sebelum "beta".
	var order []string
	for _, r := range rep.Rows {
		if r.PartyName == nil {
			order = append(order, "∅")
		} else {
			order = append(order, *r.PartyName)
		}
	}
	if fmt.Sprint(order) != "[Alfa ∅ beta Gamma]" {
		t.Fatalf("urutan %v", order)
	}
	if rep.Rows[0].GrossBase != 10_001 || rep.Rows[0].UnratedCount != 1 || rep.Rows[0].DocCount != 3 {
		t.Errorf("Alfa: %+v", rep.Rows[0])
	}
	if g := rep.Rows[3]; g.NetBase != -5_000 || g.ReturnCount != 1 {
		t.Errorf("Gamma: %+v", g)
	}
	if rep.Totals.NetBase != 10_001+10_000+10_000-5_000 || rep.Totals.UnratedCount != 1 {
		t.Errorf("total: %+v", rep.Totals)
	}
}
