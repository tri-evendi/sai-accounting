package ledgerread

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ══ REALISASI VS ANGGARAN — PADANAN `getBudgetReport` + `getSalesTargetRealization` ═
//
// `src/lib/budget-report.ts` (pembaca) dan `src/lib/budget.ts` (aritmetika
// variansi), DISALIN — `bun run parity:budget-realization` membandingkan
// keduanya atas buku sungguhan:
//
//  1. Periode = satu bulan (`periodBounds`) atau setahun penuh (bulan 0); batas
//     instannya dihitung PENERBIT TS (`budgetPeriodRange`), bukan di sini.
//  2. Anggaran dibaca per (akun, bulan) untuk tahun itu (dan bulan itu bila
//     bukan setahun), dijumlahkan per KODE akun. Hanya akun ber-kategori
//     pendapatan atau beban yang masuk (`accountCategoryFor`) — anggaran untuk
//     akun neraca diabaikan, seperti TS.
//  3. Realisasi = baris Laba Rugi periode yang SAMA (`getIncomeStatement`,
//     jurnal penutup dikecualikan, tanpa pusat biaya) — pembaca Laba Rugi Go
//     (`BuildIncomeStatement`), bukan penjumlah kedua.
//  4. Variansi = realisasi − anggaran (sen). Persen = round2((variansi /
//     anggaran) × 100) dalam aritmetika FLOAT JavaScript — ditiru langkah demi
//     langkah, sebab persennya angka di berkas; nil bila anggaran nol.
//  5. Status: persen > ambang → over, < −ambang → under, selainnya on_target;
//     anggaran nol: variansi nol → on_target, selain itu tanda variansinya.
//     Ambang = `contract.BudgetVarianceThresholdPct` (dibangkitkan dari
//     `DEFAULT_VARIANCE_THRESHOLD_PCT`).
//  6. Baris urut kode (`localeCompare`). Total dari jumlah anggaran & realisasi
//     (bukan jumlah variansi), persennya diturunkan ulang dari total itu.
//  7. Target penjualan: Σ target periode (pelanggan/barang hanya rincian
//     rencana), dibandingkan dengan Σ baris PENDAPATAN Laba Rugi yang akunnya
//     bertipe tepat `revenue` (pendapatan lain-lain dikecualikan).

// BudgetVarianceRow: satu akun beranggaran — `BudgetVarianceRow` TS.
type BudgetVarianceRow struct {
	Code     string                   `json:"code"`
	Name     string                   `json:"name"`
	Category contract.AccountCategory `json:"category"`
	Budget   Cents                    `json:"budget"`
	Actual   Cents                    `json:"actual"`
	Variance Cents                    `json:"variance"`
	// VariancePct nil = anggaran nol (tak terdefinisi).
	VariancePct *float64                      `json:"variancePct"`
	Status      contract.BudgetVarianceStatus `json:"status"`
}

// BudgetTotals: kaki laporan — `BudgetTotals` TS.
type BudgetTotals struct {
	Budget      Cents    `json:"budget"`
	Actual      Cents    `json:"actual"`
	Variance    Cents    `json:"variance"`
	VariancePct *float64 `json:"variancePct"`
	AlertCount  int      `json:"alertCount"`
}

// SalesTargetRealization: `SalesTargetRealizationResult` TS (bagian yang
// dibaca berkas).
type SalesTargetRealization struct {
	TotalTarget Cents `json:"totalTarget"`
	ActualSales Cents `json:"actualSales"`
	Variance    Cents `json:"variance"`
	TargetCount int   `json:"targetCount"`
	HasTargets  bool  `json:"hasTargets"`
}

// BudgetRealization: Realisasi vs Anggaran satu periode.
type BudgetRealization struct {
	Year int `json:"year"`
	// Month 0 = setahun penuh.
	Month       int                    `json:"month"`
	From        time.Time              `json:"from"`
	To          time.Time              `json:"to"`
	Rows        []BudgetVarianceRow    `json:"rows"`
	Totals      BudgetTotals           `json:"totals"`
	HasBudgets  bool                   `json:"hasBudgets"`
	SalesTarget SalesTargetRealization `json:"salesTarget"`
	// UnknownTypes: kode akun bergerak (di periode) bertipe di luar kontrak —
	// dari pembaca Laba Rugi; dicatat supaya terlihat.
	UnknownTypes []string `json:"unknownTypes"`
}

// centsFloat: sen → angka JavaScript `k / 100` (pembagian float yang
// dibulatkan benar — nilai `round2` TS).
func centsFloat(c Cents) float64 { return float64(c) / 100 }

// ComputeVariance: `computeVariance` TS. Persen ditiru dalam float64 —
// setiap langkah dipaksa `float64(...)` supaya tidak dilebur menjadi FMA.
func ComputeVariance(budget, actual Cents) (Cents, *float64) {
	variance := actual - budget
	if budget == 0 {
		return variance, nil
	}
	ratio := float64(centsFloat(variance) / centsFloat(budget))
	t := float64(ratio * 100)
	pct := float64(jscompat.Round(float64(t*100)) / 100)
	if pct == 0 {
		pct = 0 // −0 JS tercetak "0"; tandanya tidak bermakna di sini
	}
	return variance, &pct
}

// ClassifyVariance: `classifyVariance` TS.
func ClassifyVariance(budget, actual Cents, thresholdPct float64) contract.BudgetVarianceStatus {
	variance, pct := ComputeVariance(budget, actual)
	if pct == nil {
		switch {
		case variance == 0:
			return contract.BudgetVarianceOnTarget
		case variance > 0:
			return contract.BudgetVarianceOver
		}
		return contract.BudgetVarianceUnder
	}
	switch {
	case *pct > thresholdPct:
		return contract.BudgetVarianceOver
	case *pct < -thresholdPct:
		return contract.BudgetVarianceUnder
	}
	return contract.BudgetVarianceOnTarget
}

// BudgetEntry: satu baris `budgets` beserta akunnya.
type BudgetEntry struct {
	AccountCode string
	AccountName string
	AccountType string
	Amount      Cents
}

// BuildBudgetRealization: `getBudgetReport` + `getSalesTargetRealization`
// atas bahan yang SUDAH dibaca. MURNI. `sums` = jumlah per akun periode
// (urut kode, jurnal penutup dikecualikan) — bahan Laba Rugi.
func BuildBudgetRealization(entries []BudgetEntry, sums []accountSums, targets []Cents, thresholdPct float64) *BudgetRealization {
	rep := &BudgetRealization{Rows: []BudgetVarianceRow{}, HasBudgets: len(entries) > 0}
	is := BuildIncomeStatement(sums)
	rep.UnknownTypes = is.UnknownTypes

	actualByCode := map[string]Cents{}
	for _, l := range is.Revenue {
		actualByCode[l.Code] = l.Amount
	}
	for _, l := range is.Expense {
		actualByCode[l.Code] = l.Amount
	}

	budgetByCode := map[string]Cents{}
	type account struct{ code, name, accountType string }
	var accounts []account
	for _, e := range entries {
		if _, seen := budgetByCode[e.AccountCode]; !seen {
			accounts = append(accounts, account{e.AccountCode, e.AccountName, e.AccountType})
		}
		budgetByCode[e.AccountCode] += e.Amount
	}
	for _, a := range accounts {
		cat, ok := contract.CategoryOf(a.accountType)
		if !ok || (cat != contract.AccountCategoryRevenue && cat != contract.AccountCategoryExpense) {
			continue
		}
		budget, actual := budgetByCode[a.code], actualByCode[a.code]
		variance, pct := ComputeVariance(budget, actual)
		rep.Rows = append(rep.Rows, BudgetVarianceRow{
			Code: a.code, Name: a.name, Category: cat,
			Budget: budget, Actual: actual, Variance: variance, VariancePct: pct,
			Status: ClassifyVariance(budget, actual, thresholdPct),
		})
	}
	sort.SliceStable(rep.Rows, func(i, j int) bool {
		return jscompat.LocaleCompare(rep.Rows[i].Code, rep.Rows[j].Code) < 0
	})
	for _, r := range rep.Rows {
		rep.Totals.Budget += r.Budget
		rep.Totals.Actual += r.Actual
		if r.Status != contract.BudgetVarianceOnTarget {
			rep.Totals.AlertCount++
		}
	}
	rep.Totals.Variance, rep.Totals.VariancePct = ComputeVariance(rep.Totals.Budget, rep.Totals.Actual)

	revenueType := map[string]bool{}
	for _, s := range sums {
		if s.accountType == string(contract.AccountTypeRevenue) {
			revenueType[s.code] = true
		}
	}
	st := &rep.SalesTarget
	for _, t := range targets {
		st.TotalTarget += t
	}
	for _, l := range is.Revenue {
		if revenueType[l.Code] {
			st.ActualSales += l.Amount
		}
	}
	st.Variance = st.ActualSales - st.TotalTarget
	st.TargetCount = len(targets)
	st.HasTargets = len(targets) > 0
	return rep
}

// $1 tahun, $2 bulan (0 = setahun penuh — `{ year }` TS tanpa saringan bulan).
const budgetEntriesSQL = `
SELECT a.code, a.name, a.type, b.amount::text
  FROM budgets b
  JOIN accounts a ON a.id = b.account_id
 WHERE b.year = $1 AND ($2::integer = 0 OR b.month = $2::integer)
 ORDER BY b.id`

const salesTargetsSQL = `
SELECT t.amount::text
  FROM sales_targets t
 WHERE t.year = $1 AND ($2::integer = 0 OR t.month = $2::integer)
 ORDER BY t.id`

// BudgetRealization: Realisasi vs Anggaran tahun `year`, bulan `month`
// (0 = setahun), atas Laba Rugi [from, to] (keduanya INKLUSIF) — semuanya di
// dalam SATU transaksi baca.
func (r *Reader) BudgetRealization(ctx context.Context, year, month int, from, to time.Time) (*BudgetRealization, error) {
	if month < 0 || month > 12 {
		return nil, fmt.Errorf("bulan %d di luar 0–12", month)
	}
	var entries []BudgetEntry
	var targets []Cents
	var sums []accountSums
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		args := []any{year, month}
		err := eachRow(ctx, tx, "anggaran", budgetEntriesSQL, args, func(rows pgx.Rows) error {
			var e BudgetEntry
			var amount string
			if err := rows.Scan(&e.AccountCode, &e.AccountName, &e.AccountType, &amount); err != nil {
				return err
			}
			var err error
			if e.Amount, err = ParseCents(amount); err != nil {
				return fmt.Errorf("anggaran akun %s: %w", e.AccountCode, err)
			}
			entries = append(entries, e)
			return nil
		})
		if err != nil {
			return err
		}
		err = eachRow(ctx, tx, "target penjualan", salesTargetsSQL, args, func(rows pgx.Rows) error {
			var amount string
			if err := rows.Scan(&amount); err != nil {
				return err
			}
			c, err := ParseCents(amount)
			if err != nil {
				return fmt.Errorf("target penjualan: %w", err)
			}
			targets = append(targets, c)
			return nil
		})
		if err != nil {
			return err
		}
		sums, err = r.nets(ctx, tx, netsFilter{from: &from, to: &to, excludeClosing: true})
		return err
	})
	if err != nil {
		return nil, err
	}
	rep := BuildBudgetRealization(entries, sums, targets, contract.BudgetVarianceThresholdPct)
	rep.Year, rep.Month, rep.From, rep.To = year, month, from.UTC(), to.UTC()
	return rep, nil
}
