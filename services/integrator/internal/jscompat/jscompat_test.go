package jscompat

import (
	"math"
	"reflect"
	"sort"
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

func TestLocaleCompareMatchesJS(t *testing.T) {
	// `[...xs].sort((a, b) => a.localeCompare(b))` di Node 22 DAN Bun (keduanya
	// ICU, lokal bawaan en-US), 22 Okt 2026. Urutan byte akan memberi
	// "4101" < "4B01" < "4_01" < "4a01" — di sini "4_01" < "4101" < "4a01" < "4B01".
	want := []string{
		"", "-11", "1-10", "1.10", "1.9", "1/2", "1+2", "1~2", "1$2", "11", "110",
		"4 1", "4_01", "4-100", "4.100", "41", "410", "4101", "4101a", "4101A",
		"4a01", "4B01", "a_1", "a-1", "a1", "A1", "ab", "aB", "Ab", "AB",
	}
	got := append([]string{}, want...)
	// Diacak dulu (dibalik) supaya urutan masukan tidak membantu.
	for i, j := 0, len(got)-1; i < j; i, j = i+1, j-1 {
		got[i], got[j] = got[j], got[i]
	}
	sort.SliceStable(got, func(i, j int) bool { return LocaleCompare(got[i], got[j]) < 0 })
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("urutan LocaleCompare:\n got  %q\n mau  %q", got, want)
	}
	// Kendali ASCII diabaikan seluruhnya — setara, bukan lebih kecil.
	if c := LocaleCompare("x\u0001y", "xy"); c != 0 {
		t.Errorf("LocaleCompare(x\\u0001y, xy) = %d, mau 0", c)
	}
	if LocaleCompare("a", "a") != 0 || LocaleCompare("b", "a") != 1 || LocaleCompare("a", "B") != -1 {
		t.Error("tanda dasar LocaleCompare salah")
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
