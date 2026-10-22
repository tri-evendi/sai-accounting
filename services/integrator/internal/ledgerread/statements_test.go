package ledgerread

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

// Berkas emas Laba Rugi & Neraca ditulis ulang dengan `-update`. Berkas yang
// SAMA dibaca dua pihak lain:
//
//   - `tests/statements-golden.test.ts` menjalankan `getIncomeStatement` /
//     `getBalanceSheet` TS atas buku fixture yang sama (klien palsu di memori)
//     dan membandingkannya dengan berkas emas ini memakai pembanding paritas
//     produksi (`src/lib/statement-parity.ts`) — jadi `bun run verify`
//     membuktikan kesetaraan aturan tanpa toolchain Go;
//   - `internal/document` merakit lembar sebar dari berkas emas ini.
//
// Penjumlah baris di bawah (`sumLines`) HANYA ada di tes: ia meniru penyaring
// SQL (`netsSQL`) atas fixture, supaya aturan laporan — bukan SQL-nya — diuji
// lintas bahasa. SQL-nya dibuktikan paritas atas buku sungguhan.
var update = flag.Bool("update", false, "tulis ulang testdata/*.golden.json")

type fixtureLine struct {
	AccountID    int    `json:"accountId"`
	Debit        string `json:"debit"`
	Credit       string `json:"credit"`
	Currency     string `json:"currency"`
	Rate         string `json:"rate"`
	BaseDebit    string `json:"baseDebit"`
	BaseCredit   string `json:"baseCredit"`
	CostCenterID *int64 `json:"costCenterId"`
}

type fixtureJournal struct {
	Date  time.Time     `json:"date"`
	Type  string        `json:"type"`
	Lines []fixtureLine `json:"lines"`
}

type fixtureAccount struct {
	ID   int    `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// StatementBook adalah satu buku fixture bersama (`testdata/statement_books.json`).
type statementBook struct {
	Name            string           `json:"name"`
	FiscalYearStart *time.Time       `json:"fiscalYearStart"`
	Accounts        []fixtureAccount `json:"accounts"`
	Journals        []fixtureJournal `json:"journals"`
	IncomeStmts     []struct {
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

func loadStatementBooks(t *testing.T) []statementBook {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "statement_books.json"))
	if err != nil {
		t.Fatal(err)
	}
	var books []statementBook
	if err := json.Unmarshal(raw, &books); err != nil {
		t.Fatal(err)
	}
	return books
}

// base: rupiah dasar baris — `baseDebit` bila disebut (valas), selain itu
// nominalnya sendiri (IDR, kurs 1). Aturan yang SAMA di loader TS.
func base(t *testing.T, explicit, amount string) Cents {
	t.Helper()
	s := explicit
	if s == "" {
		s = amount
	}
	if s == "" {
		return 0
	}
	c, err := ParseCents(s)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// businessDay: padanan `businessDayStart` / `businessDayEnd` (+07:00 eksplisit).
func businessDay(t *testing.T, iso string, end bool) time.Time {
	t.Helper()
	clock := "T00:00:00.000+07:00"
	if end {
		clock = "T23:59:59.999+07:00"
	}
	v, err := time.Parse(time.RFC3339Nano, iso+clock)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// sumLines: padanan `netsSQL` atas fixture — akun dalam urutan kode, jumlah
// rupiah dasar baris yang lolos penyaring.
func (b statementBook) sumLines(t *testing.T, f netsFilter) []accountSums {
	t.Helper()
	sums := map[int]*accountSums{}
	accounts := append([]fixtureAccount{}, b.Accounts...)
	sort.SliceStable(accounts, func(i, j int) bool { return accounts[i].Code < accounts[j].Code })
	var out []accountSums
	for _, a := range accounts {
		out = append(out, accountSums{code: a.Code, name: a.Name, accountType: a.Type})
	}
	for i := range out {
		for _, a := range accounts {
			if a.Code == out[i].code {
				sums[a.ID] = &out[i]
			}
		}
	}
	for _, j := range b.Journals {
		typ := j.Type
		if typ == "" {
			typ = "general"
		}
		if f.from != nil && j.Date.Before(*f.from) {
			continue
		}
		if f.to != nil && j.Date.After(*f.to) {
			continue
		}
		if f.excludeClosing && typ == "closing" {
			continue
		}
		for _, l := range j.Lines {
			if f.costCenter.Active {
				switch {
				case f.costCenter.ID == nil && l.CostCenterID != nil:
					continue
				case f.costCenter.ID != nil && (l.CostCenterID == nil || *l.CostCenterID != *f.costCenter.ID):
					continue
				}
			}
			s := sums[l.AccountID]
			if s == nil {
				t.Fatalf("%s: baris ke akun %d yang tak ada", b.Name, l.AccountID)
			}
			s.debit += base(t, l.BaseDebit, l.Debit)
			s.credit += base(t, l.BaseCredit, l.Credit)
		}
	}
	return out
}

func (b statementBook) incomeStatement(t *testing.T, from, to, costCenter string) *IncomeStatement {
	t.Helper()
	f, l := businessDay(t, from, false), businessDay(t, to, true)
	cc, err := ParseCostCenterFilter(costCenter)
	if err != nil {
		t.Fatal(err)
	}
	return BuildIncomeStatement(b.sumLines(t, netsFilter{from: &f, to: &l, excludeClosing: true, costCenter: cc}))
}

func (b statementBook) balanceSheet(t *testing.T, asOfISO string) *BalanceSheet {
	t.Helper()
	loc, err := BusinessLocation()
	if err != nil {
		t.Fatal(err)
	}
	asOf := businessDay(t, asOfISO, true)
	all := b.sumLines(t, netsFilter{to: &asOf})
	var current []accountSums
	if b.FiscalYearStart != nil {
		start := FiscalYearStart(*b.FiscalYearStart, FiscalYearOf(*b.FiscalYearStart, asOf, loc), loc)
		current = b.sumLines(t, netsFilter{from: &start, to: &asOf})
	}
	bs := BuildBalanceSheet(all, current, b.FiscalYearStart != nil)
	bs.AsOf = asOf.UTC()
	return bs
}

func golden(t *testing.T, name string, v any) {
	t.Helper()
	got, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	path := filepath.Join("testdata", name+".golden.json")
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v — jalankan `go test ./internal/ledgerread -update`", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("%s basi — jalankan `go test ./internal/ledgerread -update`, lalu "+
			"`go test ./internal/document -update` dan `bun run test tests/statements-golden.test.ts`", path)
	}
}

func TestStatementGoldens(t *testing.T) {
	books := loadStatementBooks(t)
	seen := map[string]bool{}
	for _, b := range books {
		for _, c := range b.IncomeStmts {
			if seen[c.Case] {
				t.Fatalf("kasus %s ganda", c.Case)
			}
			seen[c.Case] = true
			t.Run(c.Case, func(t *testing.T) { golden(t, c.Case, b.incomeStatement(t, c.From, c.To, c.CostCenter)) })
		}
		for _, c := range b.BalanceSheets {
			if seen[c.Case] {
				t.Fatalf("kasus %s ganda", c.Case)
			}
			seen[c.Case] = true
			t.Run(c.Case, func(t *testing.T) { golden(t, c.Case, b.balanceSheet(t, c.AsOf)) })
		}
	}
}

func bookByName(t *testing.T, name string) statementBook {
	t.Helper()
	for _, b := range loadStatementBooks(t) {
		if b.Name == name {
			return b
		}
	}
	t.Fatalf("buku %s tak ada", name)
	return statementBook{}
}

func TestIncomeStatementClosedYearKeepsItsProfit(t *testing.T) {
	// #555: jurnal penutup DIBUANG — tanpa itu tahun yang ditutup bernilai nol.
	is := bookByName(t, "buku-dagang").incomeStatement(t, "2025-01-01", "2025-12-31", "")
	if is.NetIncome != 20_000_000_50 {
		t.Fatalf("laba 2025 = %s, mau 20000000.50", is.NetIncome)
	}
	if is.GrossProfit != 40_000_000_50 || is.Cogs.Total != 60_000_000_00 {
		t.Fatalf("laba kotor %s / HPP %s", is.GrossProfit, is.Cogs.Total)
	}
}

func TestIncomeStatementSignsAndBands(t *testing.T) {
	is := bookByName(t, "buku-dagang").incomeStatement(t, "2026-01-01", "2026-06-30", "")
	// Retur Penjualan: pendapatan bersaldo DEBIT → negatif di band penjualan.
	want := []StatementLine{
		{Code: "4101", Name: "Penjualan", Amount: 15_500_000_00},
		{Code: "4102", Name: "Retur Penjualan", Amount: -1_000_000_25},
	}
	if !reflect.DeepEqual(is.Sales.Lines, want) {
		t.Fatalf("penjualan = %+v", is.Sales.Lines)
	}
	// Beban Netral bergerak lalu nol → dilewati (beda dari Neraca Saldo).
	for _, l := range is.OperatingExpense.Lines {
		if l.Code == "6103" {
			t.Fatal("akun berjumlah nol tetap tampil")
		}
	}
	// Beban gaji 1 Juli 00.00 WIB berada di LUAR periode s.d. 30 Juni.
	for _, l := range is.OperatingExpense.Lines {
		if l.Code == "6101" {
			t.Fatalf("jurnal 1 Juli 00.00 WIB masuk periode s.d. 30 Juni: %+v", l)
		}
	}
	if is.OtherIncome.Total != 250_000_75 || is.OtherExpense.Total != 100_000_10 {
		t.Fatalf("lain-lain %s / %s", is.OtherIncome.Total, is.OtherExpense.Total)
	}
	if got := is.OperatingProfit + is.OtherIncome.Total - is.OtherExpense.Total; got != is.NetIncome {
		t.Fatal("anak tangga tidak berjumlah laba bersih")
	}
	if is.TotalRevenue-is.TotalExpense != is.NetIncome {
		t.Fatal("tampilan datar ≠ tampilan bertingkat")
	}
	// Akun bertipe asing bergerak di periode ini: dibuang dari laporan (seperti
	// TS), tetapi dilaporkan — bukan ditelan.
	if !reflect.DeepEqual(is.UnknownTypes, []string{"9999"}) {
		t.Fatalf("UnknownTypes = %v", is.UnknownTypes)
	}
}

func TestBalanceSheetContraAssetAndForeignBase(t *testing.T) {
	bs := bookByName(t, "buku-dagang").balanceSheet(t, "2026-06-30")
	byCode := map[string]Cents{}
	for _, l := range bs.Assets {
		byCode[l.Code] = l.Amount
	}
	if byCode["1509"] != -1_000_000_00 {
		t.Errorf("akumulasi penyusutan = %s, mau negatif di aset", byCode["1509"])
	}
	// Bank USD: 15.500.000 − 1.600.000 rupiah DASAR, bukan USD 1000 − 100.
	if byCode["1102"] != 13_900_000_00 {
		t.Errorf("bank USD = %s, mau 13900000.00 (rupiah dasar)", byCode["1102"])
	}
	if !reflect.DeepEqual(bs.UnknownTypes, []string{"9999"}) {
		t.Errorf("UnknownTypes = %v", bs.UnknownTypes)
	}
	// Akun bertipe asing dibuang, jadi neraca TIMPANG sebesar saldonya — sama
	// seperti TS.
	if bs.Balanced || bs.TotalAssets-bs.TotalLiabilitiesEquity != -12_345_00 {
		t.Errorf("selisih = %s", bs.TotalAssets-bs.TotalLiabilitiesEquity)
	}
}

func TestBalanceSheetSplitsUnclosedPriorYear(t *testing.T) {
	// Tahun buku April: rugi 30 jt di FY2024 belum ditutup, laba 5 jt FY2025.
	b := bookByName(t, "buku-tahun-buku-april")
	bs := b.balanceSheet(t, "2025-06-30")
	if bs.NetIncome != -25_000_000_00 || bs.CurrentYearIncome != 5_000_000_00 || bs.PriorUnclosedIncome != -30_000_000_00 {
		t.Fatalf("laba %s = berjalan %s + lalu %s", bs.NetIncome, bs.CurrentYearIncome, bs.PriorUnclosedIncome)
	}
	if !bs.Balanced {
		t.Fatal("neraca seimbang terbaca timpang")
	}
	// 31 Maret masih FY2024: jurnal 1 April 00.30 WIB (31 Maret 17.30 UTC)
	// TIDAK ikut — batas tahun buku di jam Jakarta, bukan UTC.
	bs = b.balanceSheet(t, "2025-03-31")
	if bs.CurrentYearIncome != -30_000_000_00 || bs.PriorUnclosedIncome != 0 {
		t.Fatalf("31 Maret: berjalan %s, lalu %s", bs.CurrentYearIncome, bs.PriorUnclosedIncome)
	}
}

func TestBalanceSheetWithoutSettingDoesNotSplit(t *testing.T) {
	bs := bookByName(t, "buku-timpang").balanceSheet(t, "2025-12-31")
	if bs.CurrentYearIncome != bs.NetIncome || bs.PriorUnclosedIncome != 0 {
		t.Fatalf("tanpa setelan: %+v", bs)
	}
	if bs.Balanced {
		t.Fatal("buku timpang satu sen terbaca seimbang")
	}
}

func TestFiscalYearMatchesTS(t *testing.T) {
	loc, err := BusinessLocation()
	if err != nil {
		t.Fatal(err)
	}
	// Awal tahun buku 29 Februari: `new Date(2025, 1, 29)` menggulung ke 1 Maret.
	fys := time.Date(2024, 2, 29, 0, 0, 0, 0, loc)
	if got := FiscalYearStart(fys, 2025, loc); !got.Equal(time.Date(2025, 3, 1, 0, 0, 0, 0, loc)) {
		t.Errorf("FiscalYearStart = %v", got)
	}
	// 15 Feb 2027, tahun buku mulai 1 April → tahun buku 2026.
	apr := time.Date(2020, 4, 1, 0, 0, 0, 0, loc)
	if got := FiscalYearOf(apr, time.Date(2027, 2, 15, 12, 0, 0, 0, loc), loc); got != 2026 {
		t.Errorf("FiscalYearOf = %d", got)
	}
}

func TestParseCostCenterFilterMatchesTS(t *testing.T) {
	id := func(v int64) *int64 { return &v }
	cases := map[string]CostCenterFilter{
		"":             {},
		"   ":          {},
		"unassigned":   {Active: true},
		" unassigned ": {Active: true},
		"7":            {Active: true, ID: id(7)},
		" 007 ":        {Active: true, ID: id(7)},
		"0":            {},
		"1.5":          {},
		"12abc":        {},
		"-3":           {},
	}
	for raw, want := range cases {
		got, err := ParseCostCenterFilter(raw)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("ParseCostCenterFilter(%q) = %+v, %v; mau %+v", raw, got, err, want)
		}
	}
	if _, err := ParseCostCenterFilter("99999999999"); err == nil {
		t.Error("id di luar Int harus galat")
	}
}

func TestNetsSQLShape(t *testing.T) {
	for _, must := range []string{
		"SUM(jl.base_debit)", "SUM(jl.base_credit)", // rupiah dasar
		"j.date >= $1::timestamp", "j.date <= $2::timestamp", // kedua batas INKLUSIF
		"j.type <> $3::text",                     // jurnal penutup (Laba Rugi saja)
		"cost_center_id IS NOT DISTINCT FROM $5", // NULL = belum ditetapkan
		"ORDER BY a.code", "LEFT JOIN",
	} {
		if !strings.Contains(netsSQL, must) {
			t.Errorf("netsSQL tidak memuat %q", must)
		}
	}
	if strings.Contains(fiscalSettingSQL, "ORDER BY") {
		t.Error("findFirst TANPA orderBy di TS — jangan menambah urutan di sini")
	}
}

func TestCentsJSONRoundTrip(t *testing.T) {
	for _, c := range []Cents{0, 1, -1, 12345678901, -50} {
		b, _ := json.Marshal(c)
		var back Cents
		if err := json.Unmarshal(b, &back); err != nil || back != c {
			t.Errorf("%s → %s → %s (%v)", c, b, back, err)
		}
	}
	var c Cents
	if err := json.Unmarshal([]byte("12.5"), &c); err == nil {
		t.Error("angka JSON polos harus ditolak")
	}
}
