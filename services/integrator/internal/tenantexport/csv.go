package tenantexport

import (
	"bufio"
	"encoding/base64"
	"encoding/hex"
	"regexp"
	"strconv"
	"strings"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ══ CSV — PADANAN BYTE-DEMI-BYTE `src/lib/export-csv.ts` ═══════════════════
//
// Sisi TS tidak menulis CSV dari teks PostgreSQL: ia menulis `String(nilai)`
// dari nilai yang dipulangkan Prisma (`@prisma/adapter-pg`) untuk
// `$queryRawUnsafe`. Maka yang disalin di sini BUKAN keluaran PostgreSQL,
// melainkan bentuk JS setiap tipe — diukur atas PostgreSQL 17 + Prisma 7.5
// (23 Okt 2026), bukan ditebak:
//
//	numeric      → `Decimal.toString()` (decimal.js): nol di belakang dibuang,
//	               eksponen bila e ≤ −7 atau e ≥ 21 ("1.50" → "1.5", "0.00" → "0")
//	timestamp    → `Date.toISOString()`: jam dinding DIANGGAP UTC, milidetik
//	               DIPOTONG (bukan dibulatkan), akhiran "Z"
//	timestamptz  → instan yang sama di UTC
//	date         → "YYYY-MM-DDT00:00:00.000Z"
//	time         → "1970-01-01T<jam>.<ms>Z"
//	boolean      → "1" / "0"
//	bigint       → digit apa adanya
//	real/double  → `Number.prototype.toString()` (`jscompat.NumberString`)
//	bytea        → base64 (sisi TS: `csvValue` atas `Uint8Array`)
//	teks lainnya → apa adanya, termasuk `char(n)` yang berpadding
//
// Teks PostgreSQL dibaca dengan setelan sesi yang DIPAKU (`setelanSesi`):
// tanpa itu bentuk tanggal ikut `DateStyle` server dan zona `timestamptz` ikut
// `TimeZone` sesi — dua setelan yang bisa berbeda antara mesin uji dan
// produksi tanpa satu galat pun.
//
// Tipe di luar daftar di atas (json, array, interval, …) TIDAK ada di skema
// buku hari ini; bila suatu hari muncul, teks PostgreSQL-nya ditulis apa
// adanya dan `bun run parity:tenant-export` yang akan menyebut selisihnya —
// bukan ekspor yang gagal, sebab hak unduh data adalah kewajiban hukum.

// setelanSesi: dijalankan di awal transaksi baca setiap buku (`SET LOCAL`
// hidup sampai transaksinya berakhir, dan transaksinya selalu digulung balik).
var setelanSesi = []string{
	`SET LOCAL datestyle = 'ISO, YMD'`,
	`SET LOCAL timezone = 'UTC'`,
	`SET LOCAL bytea_output = 'hex'`,
	`SET LOCAL extra_float_digits = 3`,
}

// formatter mengubah teks PostgreSQL satu kolom menjadi teks sel CSV
// (sebelum di-escape).
type formatter func(string) string

// formatterFor memilih formatter dari `information_schema.columns.data_type`.
func formatterFor(dataType string) formatter {
	switch dataType {
	case "numeric":
		return decimalString
	case "timestamp without time zone", "timestamp with time zone":
		return timestampISO
	case "date":
		return dateISO
	case "time without time zone":
		return timeISO
	case "boolean":
		return boolCell
	case "real", "double precision":
		return floatCell
	case "bytea":
		return byteaBase64
	}
	return identity
}

func identity(s string) string { return s }

func boolCell(s string) string {
	switch s {
	case "true", "t":
		return "1"
	case "false", "f":
		return "0"
	}
	return s
}

func floatCell(s string) string {
	switch s {
	case "NaN":
		return "NaN"
	case "Infinity":
		return "Infinity"
	case "-Infinity":
		return "-Infinity"
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return s
	}
	return jscompat.NumberString(f)
}

func byteaBase64(s string) string {
	if !strings.HasPrefix(s, `\x`) {
		return s
	}
	b, err := hex.DecodeString(s[2:])
	if err != nil {
		return s
	}
	return base64.StdEncoding.EncodeToString(b)
}

// teksStempel: `YYYY-MM-DD HH:MM:SS[.ffffff][+ZZ[:ZZ]]` — keluaran `DateStyle
// ISO` dengan `TimeZone UTC`. Tahun empat digit saja: SM (" BC") dan tahun
// > 9999 dibiarkan apa adanya (JS menulisnya ±YYYYYY; tidak ada di buku mana pun).
var teksStempel = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(\+00(?::00)?)?$`)

func milidetik(pecahan string) string {
	return (pecahan + "000")[:3]
}

func timestampISO(s string) string {
	m := teksStempel.FindStringSubmatch(s)
	if m == nil {
		return s
	}
	return m[1] + "T" + m[2] + "." + milidetik(m[3]) + "Z"
}

var teksTanggal = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func dateISO(s string) string {
	if !teksTanggal.MatchString(s) {
		return s
	}
	return s + "T00:00:00.000Z"
}

var teksJam = regexp.MustCompile(`^(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$`)

func timeISO(s string) string {
	m := teksJam.FindStringSubmatch(s)
	if m == nil {
		return s
	}
	return "1970-01-01T" + m[1] + "." + milidetik(m[2]) + "Z"
}

// decimalString: padanan `new Decimal(s).toString()` (decimal.js, bawaan
// `toExpNeg = -7`, `toExpPos = 21`) — bentuk yang ditulis sisi TS untuk setiap
// kolom `numeric`. Angka uang TIDAK pernah lewat float di sisi mana pun.
func decimalString(s string) string {
	if s == "NaN" {
		return "NaN"
	}
	neg := strings.HasPrefix(s, "-")
	body := strings.TrimPrefix(s, "-")
	whole, frac, _ := strings.Cut(body, ".")
	if whole == "" || strings.Trim(whole+frac, "0123456789") != "" {
		return s
	}
	digits := strings.TrimLeft(whole+frac, "0")
	if digits == "" {
		return "0"
	}
	// Eksponen digit signifikan pertama: posisi relatif terhadap titik.
	lead := len(whole+frac) - len(digits) // nol di depan yang dibuang
	e := len(whole) - lead - 1
	digits = strings.TrimRight(digits, "0")

	var out string
	switch {
	case e <= -7 || e >= 21:
		out = digits[:1]
		if len(digits) > 1 {
			out += "." + digits[1:]
		}
		if e < 0 {
			out += "e-" + strconv.Itoa(-e)
		} else {
			out += "e+" + strconv.Itoa(e)
		}
	case e < 0:
		out = "0." + strings.Repeat("0", -e-1) + digits
	case e+1 >= len(digits):
		out = digits + strings.Repeat("0", e+1-len(digits))
	default:
		out = digits[:e+1] + "." + digits[e+1:]
	}
	if neg {
		return "-" + out
	}
	return out
}

// csvEscape: `csvEscape` TS — RFC 4180, hanya bila perlu.
func csvEscape(text string) string {
	if strings.ContainsAny(text, "\",\n\r") {
		return `"` + strings.ReplaceAll(text, `"`, `""`) + `"`
	}
	return text
}

// bom: tanpa BOM, Excel versi Indonesia menebak encoding dan merusak setiap
// huruf non-ASCII — alasan yang sama dengan `toCsv`.
const bom = "\uFEFF"

// writeRow menulis satu baris CSV (sudah di-escape) diakhiri CRLF.
func writeRow(w *bufio.Writer, cells []string) error {
	for i, c := range cells {
		if i > 0 {
			if err := w.WriteByte(','); err != nil {
				return err
			}
		}
		if _, err := w.WriteString(csvEscape(c)); err != nil {
			return err
		}
	}
	_, err := w.WriteString("\r\n")
	return err
}
