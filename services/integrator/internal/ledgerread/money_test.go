package ledgerread

import (
	"encoding/json"
	"testing"
)

func TestParseCentsExact(t *testing.T) {
	cases := map[string]Cents{
		"0":                 0,
		"0.00":              0,
		"12":                1200,
		"12.3":              1230,
		"12.34":             1234,
		"-12.34":            -1234,
		"+5.01":             501,
		".5":                50,
		"12.500":            1250, // nol di belakang dari SUM numeric tetap sah
		"9999999999999.99":  999999999999999,
		"-9999999999999.99": -999999999999999,
		// Melewati plafon SATU kolom (jumlah banyak baris) tetap tepat.
		"12345678901234567.89": 1234567890123456789,
	}
	for in, want := range cases {
		got, err := ParseCents(in)
		if err != nil {
			t.Errorf("ParseCents(%q) galat: %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("ParseCents(%q) = %d, mau %d", in, got, want)
		}
	}
}

func TestParseCentsRejects(t *testing.T) {
	// Pecahan BERMAKNA melebihi skala ditolak, bukan dibulatkan: itu tanda
	// kolomnya bukan Decimal(15,2) lagi, dan paritas harus melihatnya.
	for _, in := range []string{"", "abc", "1.234", "1.2.3", "1e5", "--1", "99999999999999999999.00"} {
		if _, err := ParseCents(in); err == nil {
			t.Errorf("ParseCents(%q) mestinya galat", in)
		}
	}
}

func TestCentsStringRoundTrip(t *testing.T) {
	for _, c := range []Cents{0, 1, 9, 10, 99, 100, 1234, -1, -10, -1234, 999999999999999} {
		back, err := ParseCents(c.String())
		if err != nil || back != c {
			t.Errorf("%d → %q → %d (%v)", c, c.String(), back, err)
		}
	}
	if got := Cents(-5).String(); got != "-0.05" {
		t.Errorf("Cents(-5) = %q, mau -0.05", got)
	}
}

func TestCentsMarshalsAsString(t *testing.T) {
	// String, bukan angka JSON: sen di atas 2^53 kehilangan digit di JS.
	b, err := json.Marshal(struct{ V Cents }{V: 900719925474099312})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"V":"9007199254740993.12"}` {
		t.Errorf("json = %s", b)
	}
}
