package ledgerread

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ══ LAPORAN STOK — PADANAN `src/lib/stock-report.ts` ═══════════════════════
//
// Tiga laporan tahap 1d yang membaca `stock_movements`, bukan jurnal:
//
//   - Nilai Persediaan per periode (`getStockValuePeriodReport` →
//     `buildStockValuePeriodReport`, #492): kuantitas & nilai awal, masuk,
//     keluar, akhir per barang, rata-rata tertimbang BERTANGGAL
//     (`weightedAverageUnitCost`, termasuk `cost_adjust` biaya impor #495).
//   - Riwayat Stok / Kartu Stok (`getStockMovementReport` →
//     `buildStockMovementReport`, #126): saldo awal + masuk − keluar = akhir;
//     `process` dihitung di kolomnya sendiri, tidak pernah mengurangi saldo
//     (#111).
//   - Riwayat Hitung Ulang Stok (`getOpnameHistory` → `buildOpnameHistory`,
//     #129): gerakan bercatatan `contract.OpnameAdjustmentNote`, dikelompokkan
//     per HARI KALENDER JAKARTA.
//
// Aturannya DISALIN, bukan dirancang ulang — `bun run parity:stock-value` dst.
// membandingkan keduanya atas buku sungguhan.
//
// ══ FLOAT64, DALAM URUTAN OPERASI YANG SAMA — BUKAN SEN EKSAK ═════════════
// Berbeda dari Neraca Saldo (sen int64) dan Umur Piutang (rasional), ketiga
// laporan ini ditiru dalam float64. Sebabnya: aritmetika TS di sini SELURUHNYA
// float tanpa titik pembulatan di sisi kuantitas — `Number(quantity)` dijumlah
// apa adanya, jadi 0,1 + 0,2 − 0,3 adalah 5,55e-17, bukan nol, dan nilai itu
// MENENTUKAN apakah sebuah barang "tak bergerak" atau "bersaldo tanpa dasar
// biaya". Aritmetika eksak akan memberi jawaban yang lebih benar dan berbeda
// dari berkas TS. Dengan IEEE 754 binary64 di kedua bahasa, urutan operasi yang
// sama memberi BIT yang sama; paritas membandingkan angkanya EKSAK.
//
// Dua hal yang dijaga supaya urutannya memang sama:
//
//  1. Tidak ada FMA: setiap hasil kali yang dijumlahkan dibungkus `float64(…)`
//     (spesifikasi Go: konversi eksplisit membulatkan), supaya kompilator di
//     arsitektur ber-FMA (arm64) tidak melebur `a + b*c` menjadi satu
//     pembulatan.
//  2. Urutan baris SAMA dengan Prisma: barang `ORDER BY name, id` (Kartu Stok)
//     / `name, code` (Nilai Persediaan); gerakan per barang `ORDER BY id`
//     (`orderBy: { id: "asc" }` di TS sejak tahap 1d — sebelumnya tanpa urutan,
//     jadi urutan penjumlahannya diserahkan ke rencana kueri); opname
//     `ORDER BY date DESC, id ASC`.
//
// `Number(Decimal)` TS = `strconv.ParseFloat` atas teks NUMERIC: keduanya
// membulatkan desimal ke double terdekat. Tanggal dipotong ke MILIDETIK, seperti
// `Date` JS.

// ── Riwayat Stok / Kartu Stok ──────────────────────────────────────────────

// StockTotalIn: satu baris GROUP BY (barang × jenis) — `StockTotalRow` TS.
type StockTotalIn struct {
	ItemID   int64
	Type     string
	Quantity float64
}

// StockItemIn: master barang Kartu Stok — `StockMovementItem` TS.
type StockItemIn struct {
	ID   int64
	Name string
	Unit *string
}

// StockMovementRow: satu baris Kartu Stok — `StockMovementRow` TS.
type StockMovementRow struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Unit      *string `json:"unit"`
	Opening   float64 `json:"opening"`
	MovedIn   float64 `json:"movedIn"`
	MovedOut  float64 `json:"movedOut"`
	Processed float64 `json:"processed"`
	Closing   float64 `json:"closing"`
}

// StockMovementReport: bentuk `StockMovementReport` TS (+ batas periode).
type StockMovementReport struct {
	From           time.Time          `json:"from"`
	To             time.Time          `json:"to"`
	Rows           []StockMovementRow `json:"rows"`
	TotalOpening   float64            `json:"totalOpening"`
	TotalIn        float64            `json:"totalIn"`
	TotalOut       float64            `json:"totalOut"`
	TotalProcessed float64            `json:"totalProcessed"`
	TotalClosing   float64            `json:"totalClosing"`
	HasProcess     bool               `json:"hasProcess"`
	DormantCount   int                `json:"dormantCount"`
}

type stockTally struct{ in, out, process float64 }

// tallyStock: `tally()` TS — jenis DISEBUT satu per satu; jenis lain
// (`cost_adjust`, atau yang belum dikenal) dilewati, tidak pernah terbaca
// sebagai keluar (#111).
func tallyStock(totals []StockTotalIn) map[int64]*stockTally {
	by := map[int64]*stockTally{}
	for _, r := range totals {
		e := by[r.ItemID]
		if e == nil {
			e = &stockTally{}
			by[r.ItemID] = e
		}
		switch contract.StockMovementType(r.Type) {
		case contract.StockMovementTypeIn:
			e.in += r.Quantity
		case contract.StockMovementTypeOut:
			e.out += r.Quantity
		case contract.StockMovementTypeProcess:
			e.process += r.Quantity
		}
	}
	return by
}

// BuildStockMovementReport: `buildStockMovementReport` TS. MURNI. `opening` =
// gerakan SEBELUM periode, `period` = di dalamnya; barang tanpa saldo awal dan
// tanpa gerakan dibuang dari baris tetapi dihitung.
func BuildStockMovementReport(items []StockItemIn, opening, period []StockTotalIn) *StockMovementReport {
	o, p := tallyStock(opening), tallyStock(period)
	rep := &StockMovementReport{Rows: []StockMovementRow{}}
	for _, it := range items {
		ot, pt := o[it.ID], p[it.ID]
		if ot == nil {
			ot = &stockTally{}
		}
		if pt == nil {
			pt = &stockTally{}
		}
		openingBalance := ot.in - ot.out
		closing := openingBalance + pt.in - pt.out
		if openingBalance == 0 && pt.in == 0 && pt.out == 0 && pt.process == 0 {
			rep.DormantCount++
			continue
		}
		rep.Rows = append(rep.Rows, StockMovementRow{
			ID: it.ID, Name: it.Name, Unit: it.Unit,
			Opening: openingBalance, MovedIn: pt.in, MovedOut: pt.out,
			Processed: pt.process, Closing: closing,
		})
	}
	// `rows.reduce((s, r) => s + pick(r), 0)` — urutan baris.
	for _, r := range rep.Rows {
		rep.TotalOpening += r.Opening
		rep.TotalIn += r.MovedIn
		rep.TotalOut += r.MovedOut
		rep.TotalProcessed += r.Processed
		rep.TotalClosing += r.Closing
		if r.Processed != 0 {
			rep.HasProcess = true
		}
	}
	return rep
}

const stockItemsSQL = `SELECT id, name, unit FROM items ORDER BY name ASC, id ASC`

// stockTotalsSQL: Σ kuantitas per (barang, jenis). Batas teks UTC
// `::timestamp` (alasan di `trialBalanceSQL`); `$1` NULL = tanpa batas bawah.
// `before` = EKSKLUSIF (`{ lt: from }`), selain itu [from, to] INKLUSIF.
const stockTotalsSQL = `
SELECT item_id, type, SUM(quantity)::text
  FROM stock_movements
 WHERE ($1::timestamp IS NULL OR date < $1::timestamp)
   AND ($2::timestamp IS NULL OR date >= $2::timestamp)
   AND ($3::timestamp IS NULL OR date <= $3::timestamp)
 GROUP BY item_id, type`

func parseQuantity(s string) (float64, error) {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("kuantitas %q bukan angka: %w", s, err)
	}
	return v, nil
}

func stockTotals(ctx context.Context, tx pgx.Tx, before, from, to *time.Time) ([]StockTotalIn, error) {
	rows, err := tx.Query(ctx, stockTotalsSQL, tsParam(before), tsParam(from), tsParam(to))
	if err != nil {
		return nil, fmt.Errorf("kueri jumlah gerakan stok: %w", err)
	}
	defer rows.Close()
	var out []StockTotalIn
	for rows.Next() {
		var r StockTotalIn
		var q string
		if err := rows.Scan(&r.ItemID, &r.Type, &q); err != nil {
			return nil, fmt.Errorf("baca jumlah gerakan stok: %w", err)
		}
		if r.Quantity, err = parseQuantity(q); err != nil {
			return nil, fmt.Errorf("barang %d %s: %w", r.ItemID, r.Type, err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// StockMovement menghitung Kartu Stok [from, to] (INKLUSIF) di dalam SATU
// transaksi baca.
func (r *Reader) StockMovement(ctx context.Context, from, to time.Time) (*StockMovementReport, error) {
	var items []StockItemIn
	var opening, period []StockTotalIn
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		if items, err = stockItems(ctx, tx); err != nil {
			return err
		}
		if opening, err = stockTotals(ctx, tx, &from, nil, nil); err != nil {
			return err
		}
		period, err = stockTotals(ctx, tx, nil, &from, &to)
		return err
	})
	if err != nil {
		return nil, err
	}
	rep := BuildStockMovementReport(items, opening, period)
	rep.From, rep.To = from.UTC(), to.UTC()
	return rep, nil
}

func stockItems(ctx context.Context, tx pgx.Tx) ([]StockItemIn, error) {
	rows, err := tx.Query(ctx, stockItemsSQL)
	if err != nil {
		return nil, fmt.Errorf("kueri barang: %w", err)
	}
	defer rows.Close()
	var out []StockItemIn
	for rows.Next() {
		var it StockItemIn
		if err := rows.Scan(&it.ID, &it.Name, &it.Unit); err != nil {
			return nil, fmt.Errorf("baca barang: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// ── Riwayat Hitung Ulang Stok ──────────────────────────────────────────────

// OpnameAdjustmentIn: satu gerakan penyesuaian opname — `OpnameAdjustmentInput`.
type OpnameAdjustmentIn struct {
	Date     time.Time
	ItemName string
	Unit     *string
	Type     string
	Quantity float64
}

// OpnameAdjustment: satu penyesuaian bertanda (+ lebih, − susut).
type OpnameAdjustment struct {
	ItemName string  `json:"itemName"`
	Unit     *string `json:"unit"`
	Variance float64 `json:"variance"`
}

// OpnameSession: satu hari hitung ulang.
type OpnameSession struct {
	DateISO     string             `json:"dateISO"`
	Adjustments []OpnameAdjustment `json:"adjustments"`
	Increase    float64            `json:"increase"`
	Decrease    float64            `json:"decrease"`
}

// OpnameHistory: bentuk `OpnameHistory` TS (+ batas periode).
type OpnameHistory struct {
	From            time.Time       `json:"from"`
	To              time.Time       `json:"to"`
	Sessions        []OpnameSession `json:"sessions"`
	SessionCount    int             `json:"sessionCount"`
	AdjustmentCount int             `json:"adjustmentCount"`
	TotalIncrease   float64         `json:"totalIncrease"`
	TotalDecrease   float64         `json:"totalDecrease"`
	NetVariance     float64         `json:"netVariance"`
}

// BuildOpnameHistory: `buildOpnameHistory` TS. MURNI. `rows` dalam urutan
// pembaca (tanggal ↓, id ↑); hari = tanggal kalender di `loc` (Jakarta).
func BuildOpnameHistory(rows []OpnameAdjustmentIn, loc *time.Location) *OpnameHistory {
	byDay := map[string][]OpnameAdjustment{}
	var days []string
	for _, r := range rows {
		var v float64
		switch contract.StockMovementType(r.Type) {
		case contract.StockMovementTypeIn:
			v = r.Quantity
		case contract.StockMovementTypeOut:
			v = -r.Quantity
		default:
			continue
		}
		key := r.Date.In(loc).Format("2006-01-02")
		if _, ada := byDay[key]; !ada {
			days = append(days, key)
		}
		byDay[key] = append(byDay[key], OpnameAdjustment{ItemName: r.ItemName, Unit: r.Unit, Variance: v})
	}

	h := &OpnameHistory{Sessions: []OpnameSession{}}
	for _, day := range days {
		adj := byDay[day]
		s := OpnameSession{DateISO: day}
		// Jumlah atas urutan ASLI (sebelum diurutkan), seperti TS.
		for _, a := range adj {
			if a.Variance > 0 {
				s.Increase += a.Variance
			}
		}
		for _, a := range adj {
			if a.Variance < 0 {
				s.Decrease -= a.Variance
			}
		}
		// `Math.abs(b.v) - Math.abs(a.v) || a.itemName.localeCompare(b.itemName)`
		// — urutan stabil, seperti `Array.prototype.sort`.
		sorted := append([]OpnameAdjustment(nil), adj...)
		sort.SliceStable(sorted, func(i, j int) bool {
			d := math.Abs(sorted[j].Variance) - math.Abs(sorted[i].Variance)
			if d != 0 {
				return d < 0
			}
			return jscompat.LocaleCompare(sorted[i].ItemName, sorted[j].ItemName) < 0
		})
		s.Adjustments = sorted
		h.Sessions = append(h.Sessions, s)
	}
	// Terbaru dulu. Kunci hari unik dan berbentuk sama, jadi urutan teks =
	// `localeCompare` TS.
	sort.SliceStable(h.Sessions, func(i, j int) bool { return h.Sessions[i].DateISO > h.Sessions[j].DateISO })

	for _, s := range h.Sessions {
		h.TotalIncrease += s.Increase
		h.TotalDecrease += s.Decrease
		h.AdjustmentCount += len(s.Adjustments)
	}
	h.SessionCount = len(h.Sessions)
	h.NetVariance = h.TotalIncrease - h.TotalDecrease
	return h
}

// opnameSQL: `note` DICOCOKKAN PERSIS (bukan `contains`), batas [from, to]
// INKLUSIF, urutan `[date desc, id asc]` TS.
const opnameSQL = `
SELECT sm.date, sm.type, sm.quantity::text, i.name, i.unit
  FROM stock_movements sm
  JOIN items i ON i.id = sm.item_id
 WHERE sm.note = $1
   AND sm.date >= $2::timestamp
   AND sm.date <= $3::timestamp
 ORDER BY sm.date DESC, sm.id ASC`

// OpnameHistory membaca Riwayat Hitung Ulang Stok [from, to] (INKLUSIF).
func (r *Reader) OpnameHistory(ctx context.Context, from, to time.Time) (*OpnameHistory, error) {
	loc, err := BusinessLocation()
	if err != nil {
		return nil, err
	}
	var in []OpnameAdjustmentIn
	err = r.readOnly(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, opnameSQL, contract.OpnameAdjustmentNote, tsParam(&from), tsParam(&to))
		if err != nil {
			return fmt.Errorf("kueri penyesuaian opname: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var a OpnameAdjustmentIn
			var q string
			if err := rows.Scan(&a.Date, &a.Type, &q, &a.ItemName, &a.Unit); err != nil {
				return fmt.Errorf("baca penyesuaian opname: %w", err)
			}
			a.Date = jsDate(a.Date)
			if a.Quantity, err = parseQuantity(q); err != nil {
				return fmt.Errorf("opname %s: %w", a.ItemName, err)
			}
			in = append(in, a)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	h := BuildOpnameHistory(in, loc)
	h.From, h.To = from.UTC(), to.UTC()
	return h, nil
}

// jsDate: instan seperti `Date` JS — UTC, dipotong ke milidetik.
func jsDate(t time.Time) time.Time {
	return time.UnixMilli(t.UnixMilli()).UTC()
}

// ── Nilai Persediaan per periode ───────────────────────────────────────────

// ValuationMovementIn: gerakan sebagaimana dibutuhkan penilaian —
// `ValuationMovement` TS. Nil = kolom NULL.
type ValuationMovementIn struct {
	Quantity        float64
	Type            string
	DateMs          int64
	UnitCost        *float64
	ValueAdjustment *float64
}

// ValuationItemIn: barang beserta SELURUH gerakannya sampai ujung periode.
type ValuationItemIn struct {
	ID        int64
	Code      string
	Name      string
	Unit      *string
	Movements []ValuationMovementIn
}

// StockValueRow: satu baris Nilai Persediaan — `StockValuePeriodRow` TS. Nilai
// nil = tanpa dasar biaya, BUKAN nol.
type StockValueRow struct {
	ID           int64    `json:"id"`
	Code         string   `json:"code"`
	Name         string   `json:"name"`
	Unit         *string  `json:"unit"`
	OpeningQty   float64  `json:"openingQty"`
	InQty        float64  `json:"inQty"`
	OutQty       float64  `json:"outQty"`
	ClosingQty   float64  `json:"closingQty"`
	OpeningValue *float64 `json:"openingValue"`
	InValue      *float64 `json:"inValue"`
	OutValue     *float64 `json:"outValue"`
	ClosingValue *float64 `json:"closingValue"`
	Revaluation  float64  `json:"revaluation"`
}

// StockValueReport: bentuk `StockValuePeriodReport` TS (+ batas periode).
type StockValueReport struct {
	From              time.Time       `json:"from"`
	To                time.Time       `json:"to"`
	Rows              []StockValueRow `json:"rows"`
	TotalOpeningValue float64         `json:"totalOpeningValue"`
	TotalInValue      float64         `json:"totalInValue"`
	TotalOutValue     float64         `json:"totalOutValue"`
	TotalClosingValue float64         `json:"totalClosingValue"`
	TotalRevaluation  float64         `json:"totalRevaluation"`
	UncostedCount     int             `json:"uncostedCount"`
	DormantCount      int             `json:"dormantCount"`
}

// Round2JS: `round2` `src/lib/reconciliation.ts` (`Math.round(n * 100) /
// 100`) atas float64 — pembulatan NILAI di `stock-value-report.ts`.
func Round2JS(n float64) float64 {
	return jscompat.Round(n*100) / 100
}

// jsEpsilon: `Number.EPSILON` (2^-52).
const jsEpsilon = 0x1p-52

// Round2PostingJS: `round2` `@sai/core/money-format` — `Math.round((n +
// Number.EPSILON) * 100) / 100`, pembulatan MESIN POSTING yang dipakai
// `weightedAverageUnitCost`. BUKAN fungsi yang sama dengan Round2JS: laporan
// ini memakai keduanya (rata-rata lewat yang ini, nilai lewat yang itu), dan
// keduanya berbeda tepat pada nilai setengah sen yang tersimpan sedikit di
// bawahnya (1,005 → 1,01 di sini, 1,00 di sana).
func Round2PostingJS(n float64) float64 {
	return jscompat.Round(float64(n+jsEpsilon)*100) / 100
}

// WeightedAverageUnitCost: `weightedAverageUnitCost` TS atas gerakan
// bertanggal ≤ asOfMs (`unitCostAsOf` memfilter lalu memanggilnya — urutan
// gerakan dipertahankan). `cost_adjust` menambah sisi NILAI saja; `in` tanpa
// biaya atau berkuantitas ≤ 0 dilewati. 0 bila tak ada yang bercosting.
func WeightedAverageUnitCost(ms []ValuationMovementIn, asOfMs int64) float64 {
	var qty, value float64
	for _, m := range ms {
		if m.DateMs > asOfMs {
			continue
		}
		if contract.StockMovementType(m.Type) == contract.StockMovementTypeCostAdjust {
			if m.ValueAdjustment != nil {
				value += *m.ValueAdjustment
			}
			continue
		}
		if contract.StockMovementType(m.Type) != contract.StockMovementTypeIn || m.UnitCost == nil {
			continue
		}
		q := m.Quantity
		if q <= 0 {
			continue
		}
		qty += q
		value += float64(q * *m.UnitCost)
	}
	if qty <= 0 {
		return 0
	}
	return Round2PostingJS(value / qty)
}

// unitCostAsOf: rata-rata pada sebuah saat, atau nil bila tak ada dasar biaya.
func unitCostAsOf(ms []ValuationMovementIn, asOfMs int64) *float64 {
	avg := WeightedAverageUnitCost(ms, asOfMs)
	if avg > 0 {
		return &avg
	}
	return nil
}

func valueOf(qty float64, cost *float64) *float64 {
	if cost == nil {
		return nil
	}
	v := Round2JS(float64(qty * *cost))
	return &v
}

func orZero(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

// BuildStockValueReport: `buildStockValuePeriodReport` TS untuk [from, to]
// INKLUSIF. MURNI.
func BuildStockValueReport(items []ValuationItemIn, from, to time.Time) *StockValueReport {
	fromMs, toMs := from.UnixMilli(), to.UnixMilli()
	beforeMs := fromMs - 1
	rep := &StockValueReport{Rows: []StockValueRow{}}

	for _, it := range items {
		var openIn, openOut, inQty, outQty float64
		for _, m := range it.Movements {
			t := contract.StockMovementType(m.Type)
			switch {
			case m.DateMs < fromMs && t == contract.StockMovementTypeIn:
				openIn += m.Quantity
			case m.DateMs < fromMs && t == contract.StockMovementTypeOut:
				openOut += m.Quantity
			case m.DateMs >= fromMs && m.DateMs <= toMs && t == contract.StockMovementTypeIn:
				inQty += m.Quantity
			case m.DateMs >= fromMs && m.DateMs <= toMs && t == contract.StockMovementTypeOut:
				outQty += m.Quantity
			}
		}
		openingQty := openIn - openOut
		closingQty := openingQty + inQty - outQty
		if openingQty == 0 && inQty == 0 && outQty == 0 {
			rep.DormantCount++
			continue
		}

		openingValue := valueOf(openingQty, unitCostAsOf(it.Movements, beforeMs))
		closingCost := unitCostAsOf(it.Movements, toMs)
		closingValue := valueOf(closingQty, closingCost)

		var inValue, outValue *float64
		for _, m := range it.Movements {
			if m.DateMs < fromMs || m.DateMs > toMs {
				continue
			}
			if contract.StockMovementType(m.Type) != contract.StockMovementTypeIn || m.UnitCost == nil {
				continue
			}
			v := Round2JS(orZero(inValue) + float64(m.Quantity**m.UnitCost))
			inValue = &v
		}
		for _, m := range it.Movements {
			if m.DateMs < fromMs || m.DateMs > toMs {
				continue
			}
			if contract.StockMovementType(m.Type) != contract.StockMovementTypeOut {
				continue
			}
			cost := unitCostAsOf(it.Movements, m.DateMs)
			if cost == nil {
				continue
			}
			v := Round2JS(orZero(outValue) + float64(m.Quantity**cost))
			outValue = &v
		}

		var revaluation float64
		if closingValue != nil {
			revaluation = Round2JS(*closingValue - ((orZero(openingValue) + orZero(inValue)) - orZero(outValue)))
		}
		if closingQty > 0 && closingCost == nil {
			rep.UncostedCount++
		}
		rep.Rows = append(rep.Rows, StockValueRow{
			ID: it.ID, Code: it.Code, Name: it.Name, Unit: it.Unit,
			OpeningQty: openingQty, InQty: inQty, OutQty: outQty, ClosingQty: closingQty,
			OpeningValue: openingValue, InValue: inValue, OutValue: outValue, ClosingValue: closingValue,
			Revaluation: revaluation,
		})
	}

	sum := func(pick func(StockValueRow) float64) float64 {
		var s float64
		for _, r := range rep.Rows {
			s += pick(r)
		}
		return Round2JS(s)
	}
	rep.TotalOpeningValue = sum(func(r StockValueRow) float64 { return orZero(r.OpeningValue) })
	rep.TotalInValue = sum(func(r StockValueRow) float64 { return orZero(r.InValue) })
	rep.TotalOutValue = sum(func(r StockValueRow) float64 { return orZero(r.OutValue) })
	rep.TotalClosingValue = sum(func(r StockValueRow) float64 { return orZero(r.ClosingValue) })
	rep.TotalRevaluation = sum(func(r StockValueRow) float64 { return r.Revaluation })
	return rep
}

const valuationItemsSQL = `SELECT id, code, name, unit FROM items ORDER BY name ASC, code ASC`

// valuationMovementsSQL: gerakan sampai UJUNG periode (INKLUSIF), per barang
// `ORDER BY id` — urutan penjumlahan TS (`orderBy: { id: "asc" }`).
const valuationMovementsSQL = `
SELECT item_id, quantity::text, type, date, unit_cost::text, value_adjustment::text
  FROM stock_movements
 WHERE date <= $1::timestamp
 ORDER BY item_id, id`

func optionalFloat(s *string) (*float64, error) {
	if s == nil {
		return nil, nil
	}
	v, err := strconv.ParseFloat(*s, 64)
	if err != nil {
		return nil, fmt.Errorf("%q bukan angka: %w", *s, err)
	}
	return &v, nil
}

// StockValue menghitung Nilai Persediaan [from, to] (INKLUSIF) di dalam SATU
// transaksi baca.
func (r *Reader) StockValue(ctx context.Context, from, to time.Time) (*StockValueReport, error) {
	var items []ValuationItemIn
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, valuationItemsSQL)
		if err != nil {
			return fmt.Errorf("kueri barang: %w", err)
		}
		index := map[int64]int{}
		for rows.Next() {
			var it ValuationItemIn
			if err := rows.Scan(&it.ID, &it.Code, &it.Name, &it.Unit); err != nil {
				rows.Close()
				return fmt.Errorf("baca barang: %w", err)
			}
			index[it.ID] = len(items)
			items = append(items, it)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		ms, err := tx.Query(ctx, valuationMovementsSQL, tsParam(&to))
		if err != nil {
			return fmt.Errorf("kueri gerakan stok: %w", err)
		}
		defer ms.Close()
		for ms.Next() {
			var itemID int64
			var q string
			var date time.Time
			var cost, adj *string
			var m ValuationMovementIn
			if err := ms.Scan(&itemID, &q, &m.Type, &date, &cost, &adj); err != nil {
				return fmt.Errorf("baca gerakan stok: %w", err)
			}
			if m.Quantity, err = parseQuantity(q); err != nil {
				return fmt.Errorf("barang %d: %w", itemID, err)
			}
			if m.UnitCost, err = optionalFloat(cost); err != nil {
				return fmt.Errorf("barang %d unit_cost: %w", itemID, err)
			}
			if m.ValueAdjustment, err = optionalFloat(adj); err != nil {
				return fmt.Errorf("barang %d value_adjustment: %w", itemID, err)
			}
			m.DateMs = date.UnixMilli()
			i, ada := index[itemID]
			if !ada {
				return fmt.Errorf("gerakan stok ke barang %d yang tak ada", itemID)
			}
			items[i].Movements = append(items[i].Movements, m)
		}
		return ms.Err()
	})
	if err != nil {
		return nil, err
	}
	rep := BuildStockValueReport(items, from, to)
	rep.From, rep.To = from.UTC(), to.UTC()
	return rep, nil
}
