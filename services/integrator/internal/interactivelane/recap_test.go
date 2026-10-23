package interactivelane

import "testing"

// Tahun/bulan Realisasi vs Anggaran hanya dalam bentuk yang ditulis penerbit
// (`String(year)`, `String(month ?? 0)`); selainnya bukan permintaan pengguna.
func TestBudgetYearMonthAcceptsOnlyPublisherShape(t *testing.T) {
	ok := map[[2]string][2]int{
		{"2026", "0"}:  {2026, 0},
		{"2026", "12"}: {2026, 12},
		{"2000", "1"}:  {2000, 1},
	}
	for in, want := range ok {
		y, m, err := budgetYearMonth(in[0], in[1])
		if err != nil || y != want[0] || m != want[1] {
			t.Errorf("%v → %d %d %v", in, y, m, err)
		}
	}
	for _, in := range [][2]string{{"", "1"}, {"2026", ""}, {"2026", "13"}, {"1999", "1"}, {"2026", "03"}, {"+2026", "1"}, {"2026", "-1"}} {
		if _, _, err := budgetYearMonth(in[0], in[1]); err == nil {
			t.Errorf("%v diterima", in)
		}
	}
}

// Laporan berperiode tanpa kolom pembanding MENOLAK muatan yang membawanya.
func TestRecapReportsRejectComparison(t *testing.T) {
	m := muatanEkspor{ReportID: "cash-bank", Params: map[string]string{"compare": "preceding"}}
	if err := tanpaPembanding(m, "x"); err == nil {
		t.Error("compare diterima")
	}
	m = muatanEkspor{ReportID: "cash-bank", Params: map[string]string{}, PriorFromInstant: "2025-01-01T00:00:00Z"}
	if err := tanpaPembanding(m, "x"); err == nil {
		t.Error("instan pembanding diterima")
	}
	if err := tanpaPembanding(muatanEkspor{Params: map[string]string{"cols": "net"}}, "x"); err != nil {
		t.Error(err)
	}
}
