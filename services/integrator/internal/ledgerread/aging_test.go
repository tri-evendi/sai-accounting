package ledgerread

import (
	"math/big"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

func rat(t *testing.T, s string) *big.Rat {
	t.Helper()
	r, err := parseRat(s)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func jakarta(t *testing.T) *time.Location {
	t.Helper()
	loc, err := BusinessLocation()
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func utc(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestBucketEdgesInclusive(t *testing.T) {
	cases := map[int]contract.AgingBucket{
		-7: contract.AgingBucketB030, 0: contract.AgingBucketB030, 30: contract.AgingBucketB030,
		31: contract.AgingBucketB3160, 60: contract.AgingBucketB3160,
		61: contract.AgingBucketB6190, 90: contract.AgingBucketB6190,
		91: contract.AgingBucketB90Plus, 4000: contract.AgingBucketB90Plus,
	}
	for days, want := range cases {
		if got := BucketFor(days); got != want {
			t.Errorf("umur %d: %s, ingin %s", days, got, want)
		}
	}
}

func TestAgeCountsJakartaCalendarDays(t *testing.T) {
	loc := jakarta(t)
	asOf := utc(t, "2026-03-31T16:59:59.999Z") // 31 Mar 23:59:59 WIB
	cases := []struct {
		date string
		want int
	}{
		{"2026-03-31T00:00:00Z", 0},  // formulir: 07:00 WIB hari yang sama
		{"2026-03-30T17:00:00Z", 0},  // sistem: 00:00 WIB 31 Mar
		{"2026-03-30T16:59:59Z", 1},  // 23:59 WIB 30 Mar — sehari
		{"2026-03-01T00:00:00Z", 30}, // tepat 30
		{"2026-02-28T00:00:00Z", 31},
		{"2026-04-01T00:00:00Z", -1}, // masa depan
	}
	for _, c := range cases {
		if got := AgeInDays(utc(t, c.date), asOf, loc); got != c.want {
			t.Errorf("%s: %d, ingin %d", c.date, got, c.want)
		}
	}
}

func TestRoundCentsIsMathRoundOnExactValue(t *testing.T) {
	cases := map[string]Cents{
		"0.005": 1, "0.0049999": 0, "-0.005": 0, "-0.0051": -1, "2.675": 268,
		"1575200.005": 157520001, "12.344": 1234, "0": 0,
	}
	for s, want := range cases {
		if got := roundCents(rat(t, s)); got != want {
			t.Errorf("%s → %d, ingin %d", s, got, want)
		}
	}
}

func TestHalfCentTieIsFlagged(t *testing.T) {
	for s, want := range map[string]bool{"78910.005": true, "0.005": true, "-0.005": true, "78910.0051": false, "1.01": false} {
		var rd rounder
		rd.cents(rat(t, s))
		if rd.tie != want {
			t.Errorf("%s: seri %v, ingin %v", s, rd.tie, want)
		}
	}
}

func TestToBaseOrder(t *testing.T) {
	r := func(s string) *big.Rat { return rat(t, s) }
	cases := []struct {
		m    moneyRow
		want string // "" = nil
	}{
		{moneyRow{amount: r("10"), currency: "USD", rate: r("15000"), base: r("149000")}, "149000"},
		{moneyRow{amount: r("10"), currency: "IDR"}, "10"},
		{moneyRow{amount: r("10"), currency: ""}, "10"},
		{moneyRow{amount: r("10.01"), currency: "USD", rate: r("15750.5")}, "157662.505"},
		{moneyRow{amount: r("10"), currency: "USD"}, ""},
		{moneyRow{amount: r("10"), currency: "USD", rate: r("0")}, ""},
	}
	for i, c := range cases {
		got := toBase(c.m)
		switch {
		case c.want == "" && got != nil:
			t.Errorf("%d: %s, ingin nil", i, ratText(got))
		case c.want != "" && (got == nil || ratText(got) != c.want):
			t.Errorf("%d: %v, ingin %s", i, got, c.want)
		}
	}
}

func TestStatusPrecedence(t *testing.T) {
	loc := jakarta(t)
	asOf := utc(t, "2026-03-31T16:59:59.999Z")
	past := utc(t, "2026-03-01T00:00:00Z")
	today := utc(t, "2026-03-31T00:00:00Z")
	r := func(s string) *big.Rat { return rat(t, s) }
	cases := []struct {
		total *big.Rat
		paid  Cents
		due   *time.Time
		want  contract.PaymentStatus
	}{
		{r("100"), 10000, &past, contract.PaymentStatusPaid},
		{r("100.004"), 10000, &past, contract.PaymentStatusPaid}, // dalam setengah sen
		{r("100.006"), 10000, &past, contract.PaymentStatusOverdue},
		{r("100"), 5000, &today, contract.PaymentStatusPartial}, // jatuh tempo HARI INI belum lewat
		{r("100"), 0, nil, contract.PaymentStatusUnpaid},
		{nil, 99999999, nil, contract.PaymentStatusPartial}, // tanpa nilai IDR: tidak pernah lunas
	}
	for i, c := range cases {
		if got := deriveStatus(c.total, c.paid, c.due, asOf, loc); got != c.want {
			t.Errorf("%d: %s, ingin %s", i, got, c.want)
		}
	}
}

func TestNormalizeItemNameMatchesJS(t *testing.T) {
	cases := map[string]string{
		"  Black  Pepper\t": "black pepper",
		"CLOVE\u00a0 Grade A": "clove grade a",
		"\ufeffNutmeg":        "nutmeg",
	}
	for in, want := range cases {
		if got := NormalizeItemName(in); got != want {
			t.Errorf("%q → %q, ingin %q", in, got, want)
		}
	}
}

func TestAllocationNeverCreatesOrDestroysMoney(t *testing.T) {
	d := func(s string) time.Time { return utc(t, s) }
	purchases := []fifoPurchase{
		{id: 3, date: d("2026-02-01T00:00:00Z"), base: rat(t, "300")},
		{id: 1, date: d("2026-01-01T00:00:00Z"), base: rat(t, "100")},
		{id: 2, date: d("2026-01-01T00:00:00Z"), base: rat(t, "200")},
		{id: 4, date: d("2026-01-15T00:00:00Z"), base: nil},
	}
	recorded := []recordedAllocation{
		{purchaseID: 3, base: rat(t, "350")}, // melebihi nilai: 50 kembali ke kolam
		{purchaseID: 9, base: rat(t, "5")},   // pembelian asing: tidak dijumlah
		{purchaseID: 1, base: nil},           // tanpa nilai IDR
	}
	res := allocatePayments(purchases, recorded, 12000, &rounder{}) // kolam 120
	want := map[int64]Cents{1: 10000, 2: 7000, 3: 30000, 4: 0}
	for id, w := range want {
		if res.applied[id] != w {
			t.Errorf("pembelian %d: %d, ingin %d", id, res.applied[id], w)
		}
	}
	if !res.estimated[1] || !res.estimated[2] || res.estimated[3] {
		t.Errorf("tanda perkiraan salah: %v", res.estimated)
	}
}

func dec(t *testing.T, s string) *big.Rat { return rat(t, s) }

func TestReceivablesUnratedForeignIsListedNotSummed(t *testing.T) {
	loc := jakarta(t)
	asOf := utc(t, "2026-03-31T16:59:59.999Z")
	due := utc(t, "2026-01-15T00:00:00Z")
	book := &receivablesBook{
		invoices: []*invoiceDoc{
			{id: 2, no: "INV-2", date: utc(t, "2026-03-01T00:00:00Z"), currency: "USD",
				tax: dec(t, "0"), subtotal: dec(t, "1000"), party: "Buyer A"},
			{id: 1, no: "INV-1", date: utc(t, "2026-01-01T00:00:00Z"), due: &due, currency: "IDR",
				tax: dec(t, "110"), subtotal: dec(t, "1000"), party: "Buyer B",
				settlement: []moneyRow{{amount: dec(t, "500"), currency: "IDR"}}},
		},
		contracts: []*contractDoc{{
			id: 7, no: "K-7", date: utc(t, "2025-12-01T00:00:00Z"), buyer: "Buyer C", currency: "USD",
			rate: dec(t, "16000"),
			lines: []contractLine{
				{name: "Clove", value: dec(t, "100")},
				{name: "Nutmeg", value: dec(t, "50")},
			},
			invoiced: []invoicedLine{
				{name: " clove ", value: dec(t, "40.004")},
				{name: "Freight", value: dec(t, "9")}, // bukan barang kontrak
			},
		}},
	}
	rep := buildReceivables(book, asOf, false, loc)
	if len(rep.Rows) != 3 {
		t.Fatalf("%d baris, ingin 3", len(rep.Rows))
	}
	if rep.Rows[0].OutstandingBase != nil || rep.Unresolved != 1 {
		t.Errorf("valas tanpa kurs harus tanpa nilai IDR dan terhitung: %+v", rep.Rows[0])
	}
	if got := *rep.Rows[1].OutstandingBase; got != 61000 || rep.Rows[1].Status != contract.PaymentStatusOverdue {
		t.Errorf("INV-1: sisa %d status %s", got, rep.Rows[1].Status)
	}
	// Kontrak 150 USD, difakturkan 40,00 USD (dibulatkan per baris) @16000.
	if got := *rep.Rows[2].OutstandingBase; got != 176000000 {
		t.Errorf("K-7: sisa %d, ingin 176000000", got)
	}
	if rep.Total != 61000+176000000 {
		t.Errorf("total %d", rep.Total)
	}
	only := buildReceivables(book, asOf, true, loc)
	if len(only.Rows) != 1 || only.Rows[0].ID != 1 {
		t.Errorf("saringan jatuh tempo: %+v", only.Rows)
	}
}

func TestPayablesGroupAndStableNewestFirst(t *testing.T) {
	loc := jakarta(t)
	asOf := utc(t, "2026-03-31T16:59:59.999Z")
	day := utc(t, "2026-03-10T00:00:00Z")
	r := func(s string) *big.Rat { return rat(t, s) }
	txs := []*supplierTx{ // urutan baca: tanggal ↓, id ↓
		{id: 9, supplierID: 2, supplier: "S2", date: day, kind: "purchase", amount: r("100"), tax: r("11"), currency: "IDR"},
		{id: 8, supplierID: 1, supplier: "S1", date: day, kind: "purchase", amount: r("50"), tax: r("0"), currency: "IDR"},
		{id: 7, supplierID: 2, supplier: "S2", date: day, kind: "payment", amount: r("11"), tax: r("0"), currency: "IDR"},
		{id: 5, supplierID: 1, supplier: "S1", date: utc(t, "2026-03-01T00:00:00Z"), kind: "purchase",
			amount: r("10"), tax: r("0"), currency: "USD"},
	}
	rep := buildPayables(txs, asOf, false, loc)
	var ids []int64
	for _, d := range rep.Rows {
		ids = append(ids, d.ID)
	}
	if len(ids) != 3 || ids[0] != 9 || ids[1] != 8 || ids[2] != 5 {
		t.Fatalf("urutan %v, ingin [9 8 5]", ids)
	}
	if got := *rep.Rows[0].OutstandingBase; got != 10000 || !rep.Rows[0].AllocationEstimated {
		t.Errorf("TRX-9: sisa %d perkiraan %v", got, rep.Rows[0].AllocationEstimated)
	}
	if rep.Rows[0].DocumentNo != "TRX-9" || rep.Rows[2].OutstandingBase != nil || rep.Unresolved != 1 {
		t.Errorf("baris: %+v", rep.Rows)
	}
}
