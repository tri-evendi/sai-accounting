package interactivelane

import "testing"

// Muatan pembanding (#557) yang setengah-setengah DITOLAK — mencetak lembar
// satu kolom untuknya berarti menelan kolom pembanding tanpa satu galat pun.
func TestComparativePayloadIsAllOrNothing(t *testing.T) {
	params := func(compare string) map[string]string {
		if compare == "" {
			return map[string]string{"asOf": "2026-06-30"}
		}
		return map[string]string{"asOf": "2026-06-30", "compare": compare}
	}
	const instant = "2025-06-30T16:59:59.999Z"
	cases := []struct {
		name     string
		m        muatanEkspor
		instants []string
		want     bool
		wantErr  bool
	}{
		{"tanpa pembanding", muatanEkspor{Params: params("")}, []string{""}, false, false},
		{"Neraca komparatif", muatanEkspor{Params: params("previous_year"), PriorAsOfInstant: instant}, []string{instant}, true, false},
		{"Laba Rugi komparatif", muatanEkspor{Params: params("preceding")}, []string{instant, instant}, true, false},
		{"mode tanpa instan", muatanEkspor{Params: params("previous_year")}, []string{""}, false, true},
		{"instan tanpa mode", muatanEkspor{Params: params("")}, []string{instant}, false, true},
		{"separuh instan", muatanEkspor{Params: params("preceding")}, []string{instant, ""}, false, true},
		{"mode asing", muatanEkspor{Params: params("bulan_lalu")}, []string{instant}, false, true},
	}
	for _, c := range cases {
		got, err := comparative(c.m, c.instants...)
		if got != c.want || (err != nil) != c.wantErr {
			t.Errorf("%s: comparative = %v, %v; mau %v, galat %v", c.name, got, err, c.want, c.wantErr)
		}
	}
}
