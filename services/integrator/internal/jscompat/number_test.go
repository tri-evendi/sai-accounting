package jscompat

import (
	"math"
	"testing"
)

// Nilai harapan dari Node: `node -e 'console.log((x).toFixed(n))'`.
func TestToFixedSeperJS(t *testing.T) {
	kasus := []struct {
		x   float64
		n   int
		mau string
	}{
		{0.25, 1, "0.3"},    // seri tepat → yang lebih besar (Go 'f': "0.2")
		{6.25, 1, "6.3"},    // seri tepat
		{0.35, 1, "0.3"},    // 0.35 sebenarnya 0.34999… → turun
		{1.005, 2, "1.00"},  // 1.00499…
		{2.5, 0, "3"},       // seri → naik (Go 'f',0: "2")
		{9.95, 1, "9.9"},    // 9.949999…
		{99.96, 1, "100.0"}, // limpahan digit
		{0, 1, "0.0"},
		{-0.04, 1, "-0.0"}, // JS: tanda tetap ada
		{-1.25, 1, "-1.3"}, // seri pada negatif: |x| naik
		{12.3456, 3, "12.346"},
		{5, 1, "5.0"},
		{100, 1, "100.0"},
	}
	for _, k := range kasus {
		if got := ToFixed(k.x, k.n); got != k.mau {
			t.Errorf("ToFixed(%v, %d) = %q, mau %q", k.x, k.n, got, k.mau)
		}
	}
	if got := ToFixed(math.Copysign(0, -1), 1); got != "0.0" {
		t.Errorf("ToFixed(-0) = %q, mau \"0.0\"", got)
	}
}

// Nilai harapan dari Node: `node -e 'console.log(Number(s))'`.
func TestNumberSeperJS(t *testing.T) {
	kasus := []struct {
		s   string
		mau float64
	}{
		{"3", 3}, {" 4 ", 4}, {"\u00a05\ufeff", 5}, {"4.0", 4}, {"1e0", 1}, {"0x10", 16},
		{"0b11", 3}, {"0o7", 7}, {"", 0}, {"  ", 0}, {".5", 0.5}, {"5.", 5}, {"+2", 2},
		{"-3", -3}, {"Infinity", math.Inf(1)}, {"-Infinity", math.Inf(-1)}, {"2.5", 2.5},
	}
	for _, k := range kasus {
		if got := Number(k.s); got != k.mau {
			t.Errorf("Number(%q) = %v, mau %v", k.s, got, k.mau)
		}
	}
	for _, s := range []string{"abc", "4x", "inf", "1_000", "0x", "-0x10", "0x1_0", "1e", "NaN", "++1", "infinity", "0x1g"} {
		if got := Number(s); !math.IsNaN(got) {
			t.Errorf("Number(%q) = %v, mau NaN", s, got)
		}
	}
}
