package ledgerread

import (
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Berkas emas Arus Kas & Laporan Perubahan Ekuitas — pola yang sama dengan
// Laba Rugi & Neraca (`statements_test.go`): buku fixture BERSAMA
// (`testdata/statement_books.json`, kunci `cashFlows` / `equityStatements`)
// dihitung di sini, ditulis ke `testdata/<kasus>.golden.json` dengan
// `-update`, lalu dibaca `tests/cash-flow-equity-golden.test.ts` yang
// menjalankan `getCashFlow` / `getEquityStatement` TS atas buku yang sama dan
// membandingkannya memakai pembanding paritas PRODUKSI.
//
// Yang ditiru tes ini dari SQL hanyalah penyaringnya (`sumLines`, dan baris
// jurnal periode untuk `CashFlowTally`); aturannya sendiri — per jurnal, per
// kelompok, rekonsiliasi — adalah kode produksi yang sama dengan pembaca basis
// data. SQL-nya dibuktikan paritas atas buku sungguhan.

// rateIsOne: `Number(l.rate) === 1` atas teks kurs fixture; kosong = bawaan
// kolom (1).
func rateIsOne(t *testing.T, raw string) bool {
	t.Helper()
	if raw == "" {
		return true
	}
	r, ok := new(big.Rat).SetString(raw)
	if !ok {
		t.Fatalf("kurs %q bukan angka", raw)
	}
	return r.Cmp(big.NewRat(1, 1)) == 0
}

// cashFlowAt: Arus Kas fixture untuk [from, to] — padanan `Reader.CashFlow`.
func (b statementBook) cashFlowAt(t *testing.T, from, to time.Time) *CashFlow {
	t.Helper()
	closing := b.sumLines(t, netsFilter{to: &to})
	opening := b.sumLines(t, netsFilter{before: &from})
	byID := map[int]fixtureAccount{}
	for _, a := range b.Accounts {
		byID[a.ID] = a
	}
	tally := NewCashFlowTally()
	for i, j := range b.Journals {
		if j.Date.Before(from) || j.Date.After(to) {
			continue
		}
		var lines []CashFlowLineIn
		for _, l := range j.Lines {
			a, ok := byID[l.AccountID]
			if !ok {
				t.Fatalf("%s: baris ke akun %d yang tak ada", b.Name, l.AccountID)
			}
			currency := l.Currency
			if currency == "" {
				currency = string(contract.BaseCurrency)
			}
			lines = append(lines, CashFlowLineIn{
				JournalID:   int64(i + 1),
				AccountCode: a.Code,
				IsCash:      a.Type == string(contract.CashAccountType),
				BaseDebit:   base(t, l.BaseDebit, l.Debit),
				BaseCredit:  base(t, l.BaseCredit, l.Credit),
				Suspect:     currency != string(contract.BaseCurrency) && rateIsOne(t, l.Rate),
			})
		}
		tally.Journal(lines)
	}
	cf := BuildCashFlow(closing, opening, true, tally)
	cf.From, cf.To = utcPtr(&from), utcPtr(&to)
	return cf
}

func (b statementBook) cashFlow(t *testing.T, c periodCase) *CashFlow {
	t.Helper()
	return b.cashFlowAt(t, businessDay(t, c.From, false), businessDay(t, c.To, true))
}

// equityStatement: Laporan Perubahan Ekuitas fixture — padanan
// `Reader.EquityStatement`.
func (b statementBook) equityStatement(t *testing.T, c periodCase) *EquityStatement {
	t.Helper()
	from, to := businessDay(t, c.From, false), businessDay(t, c.To, true)
	before := from.Add(-time.Millisecond)
	es := BuildEquityStatement(
		b.sumLines(t, netsFilter{to: &before}),
		b.sumLines(t, netsFilter{to: &to}),
		b.sumLines(t, netsFilter{from: &from, to: &to}),
	)
	es.From, es.To = from.UTC(), to.UTC()
	return es
}

func TestCashFlowAndEquityGoldens(t *testing.T) {
	seen := map[string]bool{}
	n := 0
	for _, b := range loadStatementBooks(t) {
		for _, c := range b.CashFlows {
			if seen[c.Case] {
				t.Fatalf("kasus %s ganda", c.Case)
			}
			seen[c.Case] = true
			n++
			t.Run(c.Case, func(t *testing.T) { golden(t, c.Case, b.cashFlow(t, c)) })
		}
		for _, c := range b.EquityStatements {
			if seen[c.Case] {
				t.Fatalf("kasus %s ganda", c.Case)
			}
			seen[c.Case] = true
			n++
			t.Run(c.Case, func(t *testing.T) { golden(t, c.Case, b.equityStatement(t, c)) })
		}
	}
	if n < 10 {
		t.Fatalf("hanya %d kasus — fixture kehilangan kasusnya?", n)
	}
}

func caseOf(t *testing.T, cases []periodCase, name string) periodCase {
	t.Helper()
	for _, c := range cases {
		if c.Case == name {
			return c
		}
	}
	t.Fatalf("kasus %s tidak ada", name)
	return periodCase{}
}

func groupOf(t *testing.T, cf *CashFlow, cat contract.CashFlowCategory) CashFlowGroup {
	t.Helper()
	for _, g := range cf.Groups {
		if g.Category == cat {
			return g
		}
	}
	t.Fatalf("kelompok %s tidak ada", cat)
	return CashFlowGroup{}
}

func lineOf(g CashFlowGroup, code string) (CashFlowLine, bool) {
	for _, l := range g.Lines {
		if l.Code == code {
			return l, true
		}
	}
	return CashFlowLine{}, false
}

// Aturan Arus Kas yang paling mudah salah, satu per satu, atas buku
// "buku-arus-kas" — supaya kegagalan menyebut ATURAN-nya, bukan hanya
// "berkas emas basi".
func TestCashFlowRules(t *testing.T) {
	b := bookByName(t, "buku-arus-kas")
	cf := b.cashFlow(t, caseOf(t, b.CashFlows, "arus-kas-q1-2026"))

	// Kelompok dalam urutan kontrak, keempatnya selalu ada di data.
	if len(cf.Groups) != len(contract.CashFlowCategories) {
		t.Fatalf("%d kelompok", len(cf.Groups))
	}
	for i, c := range contract.CashFlowCategories {
		if cf.Groups[i].Category != c {
			t.Errorf("kelompok %d = %s, mau %s", i, cf.Groups[i].Category, c)
		}
	}

	op := groupOf(t, cf, contract.CashFlowCategoryOperating)
	// Pindah kas antarakun kas (Kas → Bank USD) BUKAN arus kas.
	for _, g := range cf.Groups {
		for _, l := range g.Lines {
			if l.Code == "1101" || l.Code == "1102" {
				t.Errorf("akun kas %s tampil sebagai akun lawan", l.Code)
			}
		}
	}
	// Satu akun bisa masuk DAN keluar: penjualan 250,22 + 200,10 + 3 + 11 + 1
	// masuk, retur 20,05 keluar. Jurnal 31 Maret 17.00 UTC (1 April WIB) di
	// luar periode.
	sales, ok := lineOf(op, "4101")
	if !ok || sales.Inflow != 46532 || sales.Outflow != 2005 || sales.Net != 44527 {
		t.Errorf("penjualan = %+v", sales)
	}
	// Akun netral bergerak dua arah — tetap tampil, bersih nol.
	if netral, ok := lineOf(op, "6102"); !ok || netral.Inflow != 700 || netral.Outflow != 700 || netral.Net != 0 {
		t.Errorf("beban netral = %+v", netral)
	}
	// Baris lawan bernilai nol (beban 0 di jurnal 3 Maret) tidak menyumbang.
	if beban, ok := lineOf(op, "6101"); !ok || beban.Outflow != 5000 || beban.Inflow != 0 {
		t.Errorf("beban umum = %+v", beban)
	}
	// Prive (ekuitas, debit) keluar di PENDANAAN; setoran masuk.
	fin := groupOf(t, cf, contract.CashFlowCategoryFinancing)
	if prive, ok := lineOf(fin, "3103"); !ok || prive.Outflow != 1000000 {
		t.Errorf("prive = %+v", prive)
	}
	// Tipe asing → kelompok cadangan yang TERLIHAT, dan tercatat.
	unc := groupOf(t, cf, contract.CashFlowFallbackCategory)
	if l, ok := lineOf(unc, "9999"); !ok || l.Outflow != 123 {
		t.Errorf("tipe asing = %+v", l)
	}
	if strings.Join(cf.UnknownTypes, ",") != "9999" {
		t.Errorf("UnknownTypes = %v", cf.UnknownTypes)
	}
	// Valas berkurs 1: baris USD kurs 1 (non-kas) + baris CNY tanpa kurs.
	if cf.SuspectUnrated != 2 {
		t.Errorf("suspectUnrated = %d, mau 2", cf.SuspectUnrated)
	}
	// Buku seimbang → terekonsiliasi; akun kas tak tersentuh tidak dirinci.
	if !cf.Reconciled {
		t.Error("buku seimbang tidak terekonsiliasi")
	}
	for _, a := range cf.CashAccounts {
		if a.Code == "1103" {
			t.Error("akun kas tanpa saldo dirinci")
		}
	}
	if cf.ClosingCash-cf.OpeningCash != cf.NetChange {
		t.Errorf("kas akhir − awal %s ≠ perubahan %s", cf.ClosingCash-cf.OpeningCash, cf.NetChange)
	}
}

func TestCashFlowUnbalancedBookIsNotReconciled(t *testing.T) {
	b := bookByName(t, "buku-timpang")
	cf := b.cashFlow(t, caseOf(t, b.CashFlows, "arus-kas-timpang"))
	if cf.Reconciled {
		t.Fatal("buku timpang satu sen dinyatakan terekonsiliasi")
	}
	if cf.NetChange != -1 || cf.ClosingCash-cf.OpeningCash != 0 {
		t.Errorf("perubahan %s, kas akhir − awal %s", cf.NetChange, cf.ClosingCash-cf.OpeningCash)
	}
}

func TestCashFlowSQLShape(t *testing.T) {
	for _, must := range []string{
		"jl.base_debit::text", "jl.base_credit::text", // rupiah dasar, tepat
		"j.date >= $1::timestamp", "j.date <= $2::timestamp", // kedua batas INKLUSIF
		"a.type = $3::text",                       // sisi kas dari kontrak
		"jl.currency <> $4::text AND jl.rate = 1", // valas berkurs 1, NUMERIC tepat
		"ORDER BY jl.journal_id, jl.id",           // jurnal demi jurnal
	} {
		if !strings.Contains(cashFlowLinesSQL, must) {
			t.Errorf("cashFlowLinesSQL tidak memuat %q", must)
		}
	}
	// Jurnal penutup TIDAK dibuang (TS tidak menyaringnya).
	if strings.Contains(cashFlowLinesSQL, "j.type") {
		t.Error("arus kas tidak menyaring jenis jurnal")
	}
}

func TestEquityStatementRules(t *testing.T) {
	b := bookByName(t, "buku-arus-kas")
	es := b.equityStatement(t, caseOf(t, b.EquityStatements, "ekuitas-lintas-tutup"))
	byCode := map[string]EquityComponent{}
	for _, c := range es.Components {
		byCode[c.Code] = c
	}
	// Setoran 1.000.000 + 2.500 di periode; saldo awal nol.
	if m := byCode["3101"]; m.Opening != 0 || m.Additions != 100250000 || m.Reductions != 0 || m.Closing != 100250000 {
		t.Errorf("modal = %+v", m)
	}
	// Prive: pengurangan, bukan penambahan negatif.
	if p := byCode["3103"]; p.Reductions != 1000000 || p.Additions != 0 || p.Closing != -1000000 {
		t.Errorf("prive = %+v", p)
	}
	// Jurnal penutup IKUT: laba 2025 pindah ke Laba Ditahan.
	if r := byCode["3102"]; r.Additions != 500005 {
		t.Errorf("laba ditahan = %+v", r)
	}
	// Akun ekuitas tanpa saldo & tanpa gerak dilewati.
	if _, ok := byCode["3104"]; ok {
		t.Error("akun ekuitas diam tampil")
	}
	// Total akhir = ekuitas akun + laba belum ditutup = Neraca pada `to`.
	to := businessDay(t, "2026-03-31", true)
	bs := BuildBalanceSheet(b.sumLines(t, netsFilter{to: &to}), nil, false)
	if es.TotalClosing != bs.TotalEquity+bs.NetIncome {
		t.Errorf("total akhir %s ≠ ekuitas Neraca %s", es.TotalClosing, bs.TotalEquity+bs.NetIncome)
	}
	if es.UnclosedIncome.Movement != es.UnclosedIncome.Closing-es.UnclosedIncome.Opening {
		t.Error("pergerakan laba belum ditutup bukan turunan")
	}
}
