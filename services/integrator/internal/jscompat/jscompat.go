// Package jscompat: perilaku JavaScript yang laporan Go wajib tiru PERSIS
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
//   - `Number.prototype.toFixed` ≠ `strconv.FormatFloat(x, 'f', n)`: JS
//     memilih n yang LEBIH BESAR pada seri tepat (0,25 → "0.3"), Go
//     membulatkan ke genap (0,25 → "0.2"). Kalimat temuan materialitas
//     ("6.3% dari total beban") dibandingkan paritas kesesuaian data.
//   - `Number(teks)` — cara JS membaca env var (`CONFORMANCE_CONCURRENCY`)
//     dan argumen (`--ambang-penampung`): spasi JS dibuang, kosong = 0,
//     `0x`/`0o`/`0b`, `Infinity`, selain itu NaN. `strconv` menerima bentuk
//     lain (`inf`, `1_000`) dan menolak yang JS terima (`" 4 "`).
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

// IsWhitespace: kelas `\s` RegExp JS — WhiteSpace + LineTerminator, sama
// dengan yang dibuang `Trim`.
func IsWhitespace(r rune) bool { return isJSWhitespace(r) }

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

// collationWeight: bobot dasar & tersier satu rune untuk LocaleCompare.
// ignorable = true untuk kendali ASCII (U+0000–U+001F, U+007F), yang di UCA
// akar diabaikan seluruhnya.
type collationWeight struct {
	primary, tertiary int
	ignorable         bool
}

var asciiWeights = func() map[rune]collationWeight {
	w := map[rune]collationWeight{}
	for p, group := range contract.LocaleCompareASCII {
		t := 0
		for _, r := range group {
			w[r] = collationWeight{primary: p, tertiary: t}
			t++
		}
	}
	return w
}()

func weightOf(r rune) collationWeight {
	if w, ok := asciiWeights[r]; ok {
		return w
	}
	if r < 0x20 || r == 0x7f {
		return collationWeight{ignorable: true}
	}
	// Di luar ASCII cetak: SESUDAH semua huruf ASCII, menurut titik kode. Ini
	// PERKIRAAN, bukan UCA — kode akun di buku ini ASCII; kode yang tidak
	// ASCII akan terlihat sebagai selisih urutan di paritas isi berkas, bukan
	// lolos diam-diam.
	return collationWeight{primary: len(contract.LocaleCompareASCII) + int(r)}
}

func collationWeights(s string) []collationWeight {
	out := make([]collationWeight, 0, len(s))
	for _, r := range s {
		if w := weightOf(r); !w.ignorable {
			out = append(out, w)
		}
	}
	return out
}

// LocaleCompare: padanan tanda `a.localeCompare(b)` (Intl.Collator bawaan,
// lokal akar/en) untuk teks ASCII — dipakai mengurutkan baris yang HANYA ada
// di periode pembanding (`compareLines`, #557). Perbandingan bertingkat UCA:
// seluruh bobot DASAR lebih dulu (spasi < tanda baca < angka < huruf; huruf
// besar/kecil setara), baru bobot TERSIER (huruf kecil sebelum besar). Bukan
// urutan byte: "4_01" < "4101" < "4a01" < "4B01".
//
// Tabelnya dibangkitkan dari Intl.Collator (`contract.LocaleCompareASCII`).
func LocaleCompare(a, b string) int {
	wa, wb := collationWeights(a), collationWeights(b)
	for _, tertiary := range []bool{false, true} {
		for i := 0; i < len(wa) && i < len(wb); i++ {
			x, y := wa[i].primary, wb[i].primary
			if tertiary {
				x, y = wa[i].tertiary, wb[i].tertiary
			}
			if x != y {
				if x < y {
					return -1
				}
				return 1
			}
		}
		if len(wa) != len(wb) {
			if len(wa) < len(wb) {
				return -1
			}
			return 1
		}
	}
	return 0
}

// NumberString: padanan `String(x)` (`Number.prototype.toString()`) untuk
// float64 — bentuk angka yang ditulis ExcelJS ke sel lembar sebar TS.
// `strconv` menulis eksponen berbeda ("1e-07", "1e+06"); JS menulis desimal
// biasa untuk 1e-7 ≤ |x| < 1e21 dan eksponen tanpa nol di depan ("1e-7",
// "1e+21") di luar itu. −0 → "0", seperti JS.
func NumberString(x float64) string {
	switch {
	case math.IsNaN(x):
		return "NaN"
	case math.IsInf(x, 1):
		return "Infinity"
	case math.IsInf(x, -1):
		return "-Infinity"
	case x == 0:
		return "0"
	case x < 0:
		return "-" + NumberString(-x)
	}
	// Digit terpendek yang membulat-balik + eksponen: "d.ddde±XX".
	e := strconv.FormatFloat(x, 'e', -1, 64)
	mant, expText, _ := strings.Cut(e, "e")
	digits := strings.Replace(mant, ".", "", 1)
	exp, _ := strconv.Atoi(expText)
	k, n := len(digits), exp+1
	switch {
	case k <= n && n <= 21:
		return digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		return digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		return "0." + strings.Repeat("0", -n) + digits
	}
	sign, abs := "+", n-1
	if abs < 0 {
		sign, abs = "-", -abs
	}
	head := digits[:1]
	if k > 1 {
		head += "." + digits[1:]
	}
	return head + "e" + sign + strconv.Itoa(abs)
}
