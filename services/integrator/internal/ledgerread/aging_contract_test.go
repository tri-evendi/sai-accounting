package ledgerread

import (
	"encoding/json"
	"os"
	"testing"
)

// Fikstur BERSAMA dengan tests/aging-parity.test.ts: penjodohan baris kontrak
// ⇄ baris faktur tarikan (#491/#503) wajib menghasilkan sen yang SAMA di
// kedua bahasa — sisi TS menghitungnya lewat `buildContractOutstanding`.
type matchingFixture struct {
	Cases []struct {
		Name  string `json:"name"`
		Lines []struct {
			ItemID     *int64 `json:"itemId"`
			ItemName   string `json:"itemName"`
			Bags       string `json:"bags"`
			KgPerBag   string `json:"kgPerBag"`
			PricePerKg string `json:"pricePerKg"`
		} `json:"lines"`
		Invoiced []struct {
			ItemID   *int64 `json:"itemId"`
			ItemName string `json:"itemName"`
			Quantity string `json:"quantity"`
			Price    string `json:"price"`
		} `json:"invoiced"`
		InvoicedValue Cents `json:"invoicedValue"`
		OldNameOnly   Cents `json:"oldNameOnly"`
	} `json:"cases"`
}

func TestContractInvoicedValueMatchesByItemThenName(t *testing.T) {
	raw, err := os.ReadFile("testdata/aging-contract-matching.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx matchingFixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx.Cases) < 8 {
		t.Fatalf("%d kasus — fikstur terpotong?", len(fx.Cases))
	}
	for _, c := range fx.Cases {
		withIDs, nameOnly := &contractDoc{}, &contractDoc{}
		for _, l := range c.Lines {
			v := mulRat(mulRat(rat(t, l.Bags), rat(t, l.KgPerBag)), rat(t, l.PricePerKg))
			withIDs.lines = append(withIDs.lines, contractLine{itemID: l.ItemID, name: l.ItemName, value: v})
			nameOnly.lines = append(nameOnly.lines, contractLine{name: l.ItemName, value: v})
		}
		for _, l := range c.Invoiced {
			v := mulRat(rat(t, l.Quantity), rat(t, l.Price))
			withIDs.invoiced = append(withIDs.invoiced, invoicedLine{itemID: l.ItemID, name: l.ItemName, value: v})
			nameOnly.invoiced = append(nameOnly.invoiced, invoicedLine{name: l.ItemName, value: v})
		}
		if got := contractInvoicedValue(withIDs, &rounder{}); got != c.InvoicedValue {
			t.Errorf("%s: %s, ingin %s", c.Name, got, c.InvoicedValue)
		}
		// Aturan LAMA (nama saja) = baris tanpa item_id; angka dampaknya di
		// fikstur ikut terjaga, supaya badan PR tidak bisa salah sebut.
		if got := contractInvoicedValue(nameOnly, &rounder{}); got != c.OldNameOnly {
			t.Errorf("%s (nama saja): %s, ingin %s", c.Name, got, c.OldNameOnly)
		}
	}
}

func TestResolveChainKey(t *testing.T) {
	id := func(v int64) *int64 { return &v }
	keys := map[string]bool{"#6": true, "#10": true, "clove": true}
	byName := map[string][]string{"long pepper": {"#6", "#10"}, "clove": {"clove"}, "mace": {"#6"}}
	cases := []struct {
		id   *int64
		name string
		want string
	}{
		{id(6), "apa saja", "#6"},            // 1. item_id yang ada di kontrak
		{id(99), " Mace ", "#6"},             // 2. item_id asing, nama menunjuk satu baris
		{nil, "LONG  PEPPER", "long pepper"}, // 3. nama bercabang: tidak ditebak
		{nil, "Clove", "clove"},
	}
	for _, c := range cases {
		if got := resolveChainKey(c.id, c.name, keys, byName); got != c.want {
			t.Errorf("resolveChainKey(%v, %q) = %q, ingin %q", c.id, c.name, got, c.want)
		}
	}
	if chainLineKey(id(6), "X") != "#6" || chainLineKey(nil, " A  B ") != "a b" {
		t.Error("chainLineKey")
	}
}
