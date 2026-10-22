package ledgerread

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Cents adalah jumlah uang dalam SATUAN TERKECIL kolomnya (10^-MoneyScale
// rupiah). Bilangan bulat, tidak pernah float: penjumlahan float atas ribuan
// baris jurnal menghasilkan selisih di digit terakhir, dan "seimbang" yang
// bergantung pada urutan penjumlahan bukan "seimbang".
//
// Ruangnya cukup: int64 memuat ±9,2 × 10^18 sen = ±9,2 × 10^16 rupiah, sementara
// SATU kolom Decimal(15,2) berplafon ~10^13 rupiah.
type Cents int64

// ParseCents mengurai teks NUMERIC PostgreSQL (`-1234.50`, `0`, `12.3`)
// menjadi sen, TEPAT. Digit pecahan melebihi MoneyScale DITOLAK, bukan
// dibulatkan: nilai seperti itu berarti kolomnya bukan Decimal(15,2) lagi, dan
// pembulatan diam-diam di sini akan menyembunyikan perubahan skema itu dari
// paritas.
func ParseCents(s string) (Cents, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, errors.New("angka kosong")
	}
	neg := false
	switch s[0] {
	case '-':
		neg, s = true, s[1:]
	case '+':
		s = s[1:]
	}
	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" {
		whole = "0"
	}
	if len(frac) > contract.MoneyScale {
		// Nol di belakang tetap sah (`12.500` dari SUM bertipe numeric tanpa
		// skala) — yang ditolak hanya digit pecahan BERMAKNA.
		extra := frac[contract.MoneyScale:]
		if strings.Trim(extra, "0") != "" {
			return 0, fmt.Errorf("%q punya pecahan lebih dari %d digit", s, contract.MoneyScale)
		}
		frac = frac[:contract.MoneyScale]
	}
	frac += strings.Repeat("0", contract.MoneyScale-len(frac))
	for _, part := range []string{whole, frac} {
		for _, c := range part {
			if c < '0' || c > '9' {
				return 0, fmt.Errorf("%q bukan angka desimal", s)
			}
		}
	}
	v, err := strconv.ParseInt(whole+frac, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%q di luar jangkauan sen int64: %w", s, err)
	}
	if neg {
		v = -v
	}
	return Cents(v), nil
}

// String menulis sen sebagai desimal berskala MoneyScale (`-1234.50`), bentuk
// yang sama dengan teks NUMERIC — jadi keluaran JSON bisa diurai ulang tanpa
// kehilangan satu digit pun.
func (c Cents) String() string {
	v := int64(c)
	sign := ""
	if v < 0 {
		sign = "-"
		v = -v
	}
	digits := strconv.FormatInt(v, 10)
	if contract.MoneyScale == 0 {
		return sign + digits
	}
	if len(digits) <= contract.MoneyScale {
		digits = strings.Repeat("0", contract.MoneyScale-len(digits)+1) + digits
	}
	cut := len(digits) - contract.MoneyScale
	return sign + digits[:cut] + "." + digits[cut:]
}

// MarshalJSON menulis sen sebagai STRING desimal, bukan angka JSON: pembaca
// JavaScript mengurai angka JSON menjadi float, dan sen di atas 2^53 (~90
// triliun rupiah) kehilangan digitnya tanpa galat.
func (c Cents) MarshalJSON() ([]byte, error) {
	return []byte(strconv.Quote(c.String())), nil
}

// UnmarshalJSON membaca kebalikan MarshalJSON — string desimal, diurai TEPAT.
// Dipakai berkas emas (`testdata/*.golden.json`) yang dibaca ulang
// `internal/document`; angka JSON polos ditolak, sebab ia sudah melewati float.
func (c *Cents) UnmarshalJSON(b []byte) error {
	s, err := strconv.Unquote(string(b))
	if err != nil {
		return fmt.Errorf("sen harus string desimal, bukan %s", b)
	}
	v, err := ParseCents(s)
	if err != nil {
		return err
	}
	*c = v
	return nil
}
