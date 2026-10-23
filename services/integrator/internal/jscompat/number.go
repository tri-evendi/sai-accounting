package jscompat

import (
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

// ToFixed: padanan `x.toFixed(digits)` untuk 0 ≤ digits ≤ 20 dan |x| < 1e21
// (di luar itu JS memakai `String(x)`; pemanggil repo ini tidak pernah ke
// sana, dan cabangnya memulangkan bentuk `strconv` terdekat).
//
// Spesifikasinya (ECMA-262 §21.1.3.3): n bilangan bulat yang membuat
// n/10^digits − x sedekat mungkin ke nol, dan bila DUA n sama dekat, yang
// LEBIH BESAR. Jadi pembulatannya dibaca dari ekspansi desimal EKSAK x
// (`big.Float` — double punya ekspansi desimal berhingga), bukan dari
// `FormatFloat` yang membulatkan ke genap.
func ToFixed(x float64, digits int) string {
	if math.IsNaN(x) {
		return "NaN"
	}
	if math.Abs(x) >= 1e21 || math.IsInf(x, 0) {
		return strconv.FormatFloat(x, 'g', -1, 64)
	}
	tanda := ""
	if x < 0 { // −0 BUKAN < 0: (−0).toFixed(1) = "0.0", sama dengan JS.
		tanda = "-"
		x = -x
	}
	if x == 0 {
		x = 0 // buang tanda −0 sebelum big.Float menuliskannya
	}
	// 1100 digit pecahan > 1074 (digit terbanyak ekspansi double) — eksak.
	eksak := new(big.Float).SetFloat64(x).Text('f', 1100)
	utuh, pecah, _ := strings.Cut(eksak, ".")
	for len(pecah) < digits+1 {
		pecah += "0"
	}
	angka := []byte(utuh + pecah[:digits])
	if pecah[digits] >= '5' {
		// Seri tepat (…5000…) juga naik: "yang lebih besar".
		i := len(angka) - 1
		for ; i >= 0; i-- {
			if angka[i] == '9' {
				angka[i] = '0'
				continue
			}
			angka[i]++
			break
		}
		if i < 0 {
			angka = append([]byte{'1'}, angka...)
		}
	}
	teks := string(angka)
	if digits == 0 {
		return tanda + teks
	}
	pisah := len(teks) - digits
	return tanda + teks[:pisah] + "." + teks[pisah:]
}

// desimalJS: StrUnsignedDecimalLiteral ECMAScript bertanda opsional.
var desimalJS = regexp.MustCompile(`^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)

// Number: padanan `Number(s)` untuk teks (ECMA-262 §7.1.4.1.1 StringToNumber).
func Number(s string) float64 {
	t := Trim(s)
	if t == "" {
		return 0
	}
	switch t {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if len(t) > 2 && t[0] == '0' {
		basis := 0
		switch t[1] {
		case 'x', 'X':
			basis = 16
		case 'o', 'O':
			basis = 8
		case 'b', 'B':
			basis = 2
		}
		if basis != 0 {
			// Tanpa tanda dan tanpa `_`: JS menolak keduanya di bentuk ini,
			// `big.Int.SetString` tidak.
			if strings.ContainsAny(t[2:], "_+-") {
				return math.NaN()
			}
			n, ok := new(big.Int).SetString(t[2:], basis)
			if !ok {
				return math.NaN()
			}
			f, _ := new(big.Float).SetInt(n).Float64()
			return f
		}
	}
	if !desimalJS.MatchString(t) {
		return math.NaN()
	}
	// Bentuknya sudah sah, jadi galat di sini hanya luapan — dan nilainya
	// (±Inf atau ±0) sama dengan yang dipulangkan JS.
	f, _ := strconv.ParseFloat(t, 64)
	return f
}
