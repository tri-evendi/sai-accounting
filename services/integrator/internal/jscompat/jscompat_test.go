package jscompat

import (
	"math"
	"testing"
)

// Nilai yang diharapkan diambil dari Node (`.trim()`, `Math.round`,
// `new Intl.NumberFormat("id-ID").format`), bukan dari intuisi Go.

func TestTrimMatchesJS(t *testing.T) {
	cases := map[string]string{
		"  a  ":         "a",
		"\ufeffa\ufeff": "a",             // JS membuang BOM; strings.TrimSpace tidak
		"\u0085a\u0085": "\u0085a\u0085", // NEL bukan spasi JS; strings.TrimSpace membuangnya
		"\u00a0a\u3000": "a",
		"\u2028a\n":     "a",
		"  KODE  Nama ": "KODE  Nama",
	}
	for in, want := range cases {
		if got := Trim(in); got != want {
			t.Errorf("Trim(%q) = %q, mau %q", in, got, want)
		}
	}
}

func TestRoundMatchesJS(t *testing.T) {
	cases := map[float64]float64{2.5: 3, -2.5: -2, -12.5: -12, 0.49: 0, 1.5: 2, -1.5: -1, 319.5: 320}
	for in, want := range cases {
		if got := Round(in); got != want {
			t.Errorf("Round(%v) = %v, mau %v", in, got, want)
		}
	}
	for _, in := range []float64{-0.1, -0.5} {
		if got := Round(in); got != 0 || !math.Signbit(got) {
			t.Errorf("Round(%v) = %v, mau -0", in, got)
		}
	}
}

func TestFormatNumberIDMatchesIntl(t *testing.T) {
	cases := map[float64]string{
		0: "0", 31.9: "31,9", 1234.5: "1.234,5", -12.5: "-12,5",
		12345678.25: "12.345.678,25", 100: "100", 999: "999", 1000: "1.000",
		math.Copysign(0, -1): "-0",
	}
	for in, want := range cases {
		if got := FormatNumberID(in); got != want {
			t.Errorf("FormatNumberID(%v) = %q, mau %q", in, got, want)
		}
	}
}
