package ledgerread

import (
	"encoding/json"
	"math"
	"math/big"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Berkas emas laporan stok — pola Arus Kas: buku fixture BERSAMA
// (`testdata/stock_books.json`) dihitung di sini, ditulis ke
// `testdata/<kasus>.golden.json` dengan `-update`, lalu dibaca
// `tests/stock-golden.test.ts` yang menjalankan pembaca TS atas klien palsu
// berisi buku yang sama dan membandingkannya memakai pembanding paritas
// PRODUKSI (`src/lib/stock-report-parity.ts`) — EKSAK, tanpa toleransi.
//
// Yang ditiru tes ini dari SQL hanyalah penyaring & urutannya (dan `SUM`
// NUMERIC yang TEPAT); aritmetikanya kode produksi yang sama dengan pembaca
// basis data. SQL-nya dibuktikan paritas atas buku sungguhan.

type stockFixtureItem struct {
	ID   int64   `json:"id"`
	Code string  `json:"code"`
	Name string  `json:"name"`
	Unit *string `json:"unit"`
}

type stockFixtureMovement struct {
	ID              int64     `json:"id"`
	ItemID          int64     `json:"itemId"`
	Type            string    `json:"type"`
	Quantity        string    `json:"quantity"`
	Date            time.Time `json:"date"`
	UnitCost        *string   `json:"unitCost"`
	ValueAdjustment *string   `json:"valueAdjustment"`
	Note            *string   `json:"note"`
}

type stockCase struct {
	Case string `json:"case"`
	From string `json:"from"`
	To   string `json:"to"`
	Cols string `json:"cols"`
}

type stockBook struct {
	Name            string                 `json:"name"`
	CompanyName     string                 `json:"companyName"`
	Items           []stockFixtureItem     `json:"items"`
	Movements       []stockFixtureMovement `json:"movements"`
	StockValues     []stockCase            `json:"stockValues"`
	StockMovements  []stockCase            `json:"stockMovements"`
	OpnameHistories []stockCase            `json:"opnameHistories"`
}

func loadStockBooks(t *testing.T) []stockBook {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "stock_books.json"))
	if err != nil {
		t.Fatal(err)
	}
	var books []stockBook
	if err := json.Unmarshal(raw, &books); err != nil {
		t.Fatal(err)
	}
	return books
}

func mustFloat(t *testing.T, s string) float64 {
	t.Helper()
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func optFloat(t *testing.T, s *string) *float64 {
	t.Helper()
	if s == nil {
		return nil
	}
	v := mustFloat(t, *s)
	return &v
}

// stockTotalsAt: padanan `stockTotalsSQL` — SUM NUMERIC TEPAT per (barang,
// jenis), lalu `Number()` atas hasilnya.
func (b stockBook) stockTotalsAt(t *testing.T, keep func(time.Time) bool) []StockTotalIn {
	t.Helper()
	type key struct {
		item int64
		typ  string
	}
	sums := map[key]*big.Rat{}
	var order []key
	for _, m := range b.Movements {
		if !keep(m.Date) {
			continue
		}
		q, err := parseRat(m.Quantity)
		if err != nil {
			t.Fatal(err)
		}
		k := key{m.ItemID, m.Type}
		if sums[k] == nil {
			sums[k] = new(big.Rat)
			order = append(order, k)
		}
		sums[k].Add(sums[k], q)
	}
	out := make([]StockTotalIn, 0, len(order))
	for _, k := range order {
		out = append(out, StockTotalIn{ItemID: k.item, Type: k.typ, Quantity: mustFloat(t, ratText(sums[k]))})
	}
	return out
}

func (b stockBook) stockMovementAt(t *testing.T, from, to time.Time) *StockMovementReport {
	t.Helper()
	items := make([]StockItemIn, 0, len(b.Items))
	for _, it := range b.Items {
		items = append(items, StockItemIn{ID: it.ID, Name: it.Name, Unit: it.Unit})
	}
	// `ORDER BY name, id` — urutan byte di fixture (ASCII), klien palsu TS sama.
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Name != items[j].Name {
			return items[i].Name < items[j].Name
		}
		return items[i].ID < items[j].ID
	})
	opening := b.stockTotalsAt(t, func(d time.Time) bool { return d.Before(from) })
	period := b.stockTotalsAt(t, func(d time.Time) bool { return !d.Before(from) && !d.After(to) })
	rep := BuildStockMovementReport(items, opening, period)
	rep.From, rep.To = from.UTC(), to.UTC()
	return rep
}

func (b stockBook) opnameAt(t *testing.T, from, to time.Time) *OpnameHistory {
	t.Helper()
	byID := map[int64]stockFixtureItem{}
	for _, it := range b.Items {
		byID[it.ID] = it
	}
	var ms []stockFixtureMovement
	for _, m := range b.Movements {
		if m.Note != nil && *m.Note == contract.OpnameAdjustmentNote && !m.Date.Before(from) && !m.Date.After(to) {
			ms = append(ms, m)
		}
	}
	sort.SliceStable(ms, func(i, j int) bool {
		if !ms[i].Date.Equal(ms[j].Date) {
			return ms[i].Date.After(ms[j].Date)
		}
		return ms[i].ID < ms[j].ID
	})
	in := make([]OpnameAdjustmentIn, 0, len(ms))
	for _, m := range ms {
		it := byID[m.ItemID]
		in = append(in, OpnameAdjustmentIn{
			Date: jsDate(m.Date), ItemName: it.Name, Unit: it.Unit, Type: m.Type, Quantity: mustFloat(t, m.Quantity),
		})
	}
	loc, err := BusinessLocation()
	if err != nil {
		t.Fatal(err)
	}
	h := BuildOpnameHistory(in, loc)
	h.From, h.To = from.UTC(), to.UTC()
	return h
}

func (b stockBook) stockValueAt(t *testing.T, from, to time.Time) *StockValueReport {
	t.Helper()
	items := make([]ValuationItemIn, 0, len(b.Items))
	for _, it := range b.Items {
		v := ValuationItemIn{ID: it.ID, Code: it.Code, Name: it.Name, Unit: it.Unit}
		ms := append([]stockFixtureMovement(nil), b.Movements...)
		sort.SliceStable(ms, func(i, j int) bool { return ms[i].ID < ms[j].ID })
		for _, m := range ms {
			if m.ItemID != it.ID || m.Date.After(to) {
				continue
			}
			v.Movements = append(v.Movements, ValuationMovementIn{
				Quantity: mustFloat(t, m.Quantity), Type: m.Type, DateMs: m.Date.UnixMilli(),
				UnitCost: optFloat(t, m.UnitCost), ValueAdjustment: optFloat(t, m.ValueAdjustment),
			})
		}
		items = append(items, v)
	}
	// `ORDER BY name, code`.
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Name != items[j].Name {
			return items[i].Name < items[j].Name
		}
		return items[i].Code < items[j].Code
	})
	rep := BuildStockValueReport(items, from, to)
	rep.From, rep.To = from.UTC(), to.UTC()
	return rep
}

func TestStockGoldens(t *testing.T) {
	seen := map[string]bool{}
	n := 0
	for _, b := range loadStockBooks(t) {
		run := func(c stockCase, build func(from, to time.Time) any) {
			if seen[c.Case] {
				t.Fatalf("kasus %s ganda", c.Case)
			}
			seen[c.Case] = true
			n++
			t.Run(c.Case, func(t *testing.T) {
				golden(t, c.Case, build(businessDay(t, c.From, false), businessDay(t, c.To, true)))
			})
		}
		for _, c := range b.StockValues {
			run(c, func(f, to time.Time) any { return b.stockValueAt(t, f, to) })
		}
		for _, c := range b.StockMovements {
			run(c, func(f, to time.Time) any { return b.stockMovementAt(t, f, to) })
		}
		for _, c := range b.OpnameHistories {
			run(c, func(f, to time.Time) any { return b.opnameAt(t, f, to) })
		}
	}
	if n < 15 {
		t.Fatalf("fixture stok terlalu sedikit: %d kasus", n)
	}
}

// Tepian yang dijanjikan fixture, dibuktikan langsung — bukan hanya lewat
// berkas emas yang bisa ditulis ulang tanpa dibaca.
func TestStockEdges(t *testing.T) {
	books := loadStockBooks(t)
	b := books[0]
	q1 := func() (time.Time, time.Time) {
		return businessDay(t, "2026-01-01", false), businessDay(t, "2026-03-31", true)
	}
	from, to := q1()
	sv := b.stockValueAt(t, from, to)
	row := func(code string) StockValueRow {
		for _, r := range sv.Rows {
			if r.Code == code {
				return r
			}
		}
		t.Fatalf("barang %s tidak ada di Nilai Persediaan", code)
		return StockValueRow{}
	}

	// Lada Hitam: 0,1 + 0,2 − 0,3 dalam float TS = 5,55e-17 — "bersaldo",
	// tanpa dasar biaya, jadi DIHITUNG tak berbiaya. Temuan tentang TS.
	lada := row("B006")
	if lada.ClosingQty <= 0 || lada.ClosingQty > 1e-15 || lada.ClosingValue != nil {
		t.Errorf("Lada Hitam: kts akhir %v, nilai %v", lada.ClosingQty, lada.ClosingValue)
	}
	if sv.UncostedCount < 1 {
		t.Error("sisa float tak berbiaya tidak terhitung")
	}
	// Vanili: rata-rata (2 × 1,00 + 2 × 1,01) / 4 = 1,005 → float TS 1,00.
	if got := WeightedAverageUnitCost([]ValuationMovementIn{
		{Quantity: 2, Type: "in", UnitCost: ptrF(1.00)}, {Quantity: 2, Type: "in", UnitCost: ptrF(1.01)},
	}, math.MaxInt64); got != 1 {
		t.Errorf("rata-rata setengah sen = %v, TS 1", got)
	}
	// Minyak Kelapa: saldo NEGATIF dinilai negatif.
	if m := row("B007"); m.ClosingQty != -3.5 || m.ClosingValue == nil || *m.ClosingValue != -87500 {
		t.Errorf("Minyak Kelapa: %v / %v", m.ClosingQty, m.ClosingValue)
	}
	// Biji Kakao: biaya impor menaikkan rata-rata keluar sesudahnya.
	if k := row("B008"); k.OutValue == nil || *k.OutValue <= 40*50000+10.5*50000 {
		t.Errorf("Biji Kakao: nilai keluar %v tidak memuat biaya impor", k.OutValue)
	}
	// Barang Diam tidak tampil, tetapi dihitung.
	if sv.DormantCount < 1 {
		t.Error("barang diam tidak terhitung")
	}

	// Kartu Stok: SUM NUMERIC tepat → Lada Hitam bersaldo NOL (bukan 5,55e-17).
	km := b.stockMovementAt(t, from, to)
	for _, r := range km.Rows {
		if r.Name == "Lada Hitam" && r.Closing != 0 {
			t.Errorf("Kartu Stok Lada Hitam akhir %v", r.Closing)
		}
	}
	if !km.HasProcess {
		t.Error("Q1 punya mutasi olah")
	}

	// Opname: 31 Jan 23:59:59,999 WIB dan 1 Feb 00:00 WIB adalah DUA hari.
	jan := b.opnameAt(t, businessDay(t, "2026-01-01", false), businessDay(t, "2026-01-31", true))
	if jan.SessionCount != 1 || jan.Sessions[0].DateISO != "2026-01-31" || len(jan.Sessions[0].Adjustments) != 2 {
		t.Fatalf("opname Januari: %+v", jan.Sessions)
	}
	// Seri |selisih| diurutkan localeCompare: Biji Kakao sebelum Cengkeh.
	if jan.Sessions[0].Adjustments[0].ItemName != "Biji Kakao" {
		t.Errorf("urutan seri: %+v", jan.Sessions[0].Adjustments)
	}
	q := b.opnameAt(t, from, to)
	for _, s := range q.Sessions {
		if s.DateISO != "2026-03-15" {
			continue
		}
		var names []string
		for _, a := range s.Adjustments {
			names = append(names, a.ItemName)
		}
		// `localeCompare`, bukan urutan byte ("Kopi-Luwak" < "kopi Robusta").
		want := []string{"Kopi Arabika", "kopi Robusta", "Kopi-Luwak"}
		if len(names) != 3 || names[0] != want[0] || names[1] != want[1] || names[2] != want[2] {
			t.Errorf("urutan 15 Maret = %v, mau %v", names, want)
		}
	}
}

func ptrF(v float64) *float64 { return &v }
