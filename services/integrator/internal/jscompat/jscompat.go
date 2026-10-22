// Package jscompat: tiga perilaku JavaScript yang laporan Go wajib tiru PERSIS
// karena teks keluarannya dibandingkan dengan TypeScript (tahap 1d, 09 §9).
//
// Masing-masing di sini karena padanan Go "yang wajar" BERBEDA dari JS pada
// tepiannya, dan tepian itu terlihat di berkas yang diunduh pengguna:
//
//   - `String.prototype.trim()` ≠ `strings.TrimSpace`: JS membuang U+FEFF dan
//     TIDAK membuang U+0085; Go sebaliknya.
//   - `Math.round` ≠ `math.Round`: JS membulatkan setengah ke ATAS (−2,5 → −2)
//     dan memulangkan −0 untuk −0,5 ≤ x < 0.
//   - `Intl.NumberFormat("id-ID").format` — pemisah ribuan ".", desimal ",",
//     dan −0 tercetak "-0".
package jscompat

import (
	"math"
	"strconv"
	"strings"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// isJSWhitespace: WhiteSpace + LineTerminator ECMAScript (§12.2, §12.3).
func isJSWhitespace(r rune) bool {
	switch r {
	case '\t', '\v', '\f', ' ', '\u00a0', '\ufeff', '\n', '\r', '\u2028', '\u2029',
		'\u1680', '\u202f', '\u205f', '\u3000':
		return true
	}
	return r >= '\u2000' && r <= '\u200a'
}

// Trim: padanan `String.prototype.trim()`.
func Trim(s string) string {
	return strings.TrimFunc(s, isJSWhitespace)
}

// Round: padanan `Math.round` — floor(x + 0,5), dengan −0 untuk −0,5 ≤ x < 0.
func Round(x float64) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}
	if x < 0 && x >= -0.5 {
		return math.Copysign(0, -1)
	}
	r := math.Floor(x)
	if x-r >= 0.5 {
		r++
	}
	return r
}

// FormatNumberID: padanan `new Intl.NumberFormat("id-ID").format(x)` untuk
// angka yang SUDAH berpecahan paling banyak tiga digit (bawaan Intl:
// `maximumFractionDigits: 3`). Pemisahnya dibangkitkan dari Intl sendiri
// (`contract.Number*ID`).
func FormatNumberID(x float64) string {
	neg := math.Signbit(x)
	if neg {
		x = -x
	}
	// Intl membulatkan ke 3 digit pecahan, setengah menjauhi nol.
	s := strconv.FormatFloat(x, 'f', 3, 64)
	whole, frac, _ := strings.Cut(s, ".")
	frac = strings.TrimRight(frac, "0")

	var b strings.Builder
	if neg {
		b.WriteString(contract.NumberMinusSignID)
	}
	for i, c := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteString(contract.NumberGroupSeparatorID)
		}
		b.WriteRune(c)
	}
	if frac != "" {
		b.WriteString(contract.NumberDecimalSeparatorID)
		b.WriteString(frac)
	}
	return b.String()
}
