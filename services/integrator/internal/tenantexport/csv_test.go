package tenantexport

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

// Nilai harapan di tes ini DIUKUR dari sisi TS (Prisma 7.5 + adapter-pg atas
// PostgreSQL 17, 23 Okt 2026): `String(nilai)` / `csvValue` untuk kueri
// `$queryRawUnsafe` yang sama — bukan ditebak dari dokumentasi.
func TestDecimalStringSeperDecimalJS(t *testing.T) {
	kasus := map[string]string{
		"1.50":                    "1.5",
		"0.00":                    "0",
		"-12.300":                 "-12.3",
		"0.000001":                "0.000001",
		"1234567890123.45":        "1234567890123.45",
		"-0.50":                   "-0.5",
		"100.00":                  "100",
		"0.0000001":               "1e-7",
		"10000000000000000000000": "1e+22",
		"15000000.000":            "15000000",
		"0.10":                    "0.1",
		"7":                       "7",
		"NaN":                     "NaN",
		// 21 digit = e 20: masih desimal biasa (eksponen mulai e ≥ 21).
		"123456789012345678901": "123456789012345678901",
	}
	for in, want := range kasus {
		if got := decimalString(in); got != want {
			t.Errorf("decimalString(%q) = %q, mau %q", in, got, want)
		}
	}
}

func TestBentukTanggalSeperDateToISOString(t *testing.T) {
	kasus := []struct {
		f       formatter
		in, out string
	}{
		{timestampISO, "2026-01-02 03:04:05.123", "2026-01-02T03:04:05.123Z"},
		// milidetik DIPOTONG, tidak dibulatkan (.123956 → .123)
		{timestampISO, "2026-01-02 03:04:05.123956", "2026-01-02T03:04:05.123Z"},
		{timestampISO, "2026-01-02 03:04:05", "2026-01-02T03:04:05.000Z"},
		{timestampISO, "2026-01-02 03:04:05.1", "2026-01-02T03:04:05.100Z"},
		{timestampISO, "2026-01-01 20:04:05.12+00", "2026-01-01T20:04:05.120Z"},
		{timestampISO, "0001-01-01 00:00:00", "0001-01-01T00:00:00.000Z"},
		{dateISO, "2026-01-02", "2026-01-02T00:00:00.000Z"},
		{timeISO, "12:34:56", "1970-01-01T12:34:56.000Z"},
		{boolCell, "true", "1"},
		{boolCell, "false", "0"},
		{floatCell, "1.5", "1.5"},
		{floatCell, "1e-07", "1e-7"},
		{byteaBase64, `\x00ff10`, "AP8Q"},
		{identity, "ab   ", "ab   "},
	}
	for _, k := range kasus {
		if got := k.f(k.in); got != k.out {
			t.Errorf("%q → %q, mau %q", k.in, got, k.out)
		}
	}
}

func TestCsvEscapeRFC4180(t *testing.T) {
	kasus := map[string]string{
		"polos":            "polos",
		"a,b":              `"a,b"`,
		`kata "penting"`:   `"kata ""penting"""`,
		"baris\nbaru":      "\"baris\nbaru\"",
		"cr\rsaja":         "\"cr\rsaja\"",
		"titik;koma tab\t": "titik;koma tab\t",
	}
	for in, want := range kasus {
		if got := csvEscape(in); got != want {
			t.Errorf("csvEscape(%q) = %q, mau %q", in, got, want)
		}
	}
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	_, _ = w.WriteString(bom)
	_ = writeRow(w, []string{"id", "name"})
	_ = writeRow(w, []string{"1", "PT A, Tbk"})
	_ = w.Flush()
	// `toCsv(["id","name"], [[1, "PT A, Tbk"]])` di tests/tenant-export.test.ts
	if got, want := buf.String(), "\uFEFFid,name\r\n1,\"PT A, Tbk\"\r\n"; got != want {
		t.Fatalf("CSV %q, mau %q", got, want)
	}
}

func TestNamaEntriDokumenSeperTS(t *testing.T) {
	kasus := []struct {
		id   int64
		in   string
		want string
	}{
		{7, "kontrak.pdf", "7-kontrak.pdf"},
		{8, "../../etc/passwd", "8-__.._etc_passwd"},
		{9, "...rahasia", "9-_rahasia"},
		{10, "", "10-dokumen"},
		{11, `a\b/c.png`, "11-a_b_c.png"},
		{12, strings.Repeat("x", 130), "12-" + strings.Repeat("x", 120)},
		// 120 UNIT UTF-16, bukan rune: 😀 = dua unit.
		{13, strings.Repeat("😀", 61), "13-" + strings.Repeat("😀", 60)},
	}
	for _, k := range kasus {
		if got := archiveEntryName(k.id, k.in); got != k.want {
			t.Errorf("archiveEntryName(%d, %q) = %q, mau %q", k.id, k.in, got, k.want)
		}
	}
}

func TestJSONStringSeperJSONStringify(t *testing.T) {
	kasus := map[string]string{
		`PT "Maju" <&>`:  `"PT \"Maju\" <&>"`,
		"a\\b":           `"a\\b"`,
		"baris\nbaru\tx": `"baris\nbaru\tx"`,
		"\x01\b\f":       `"\u0001\b\f"`,
		"pemisah ok":     "\"pemisah ok\"",
	}
	for in, want := range kasus {
		if got := jsonString(in); got != want {
			t.Errorf("jsonString(%q) = %s, mau %s", in, got, want)
		}
	}
}

func TestTenantJSONBentuknyaJSONStringifyIndent2(t *testing.T) {
	at := time.Date(2026, 10, 23, 1, 2, 3, 456_000_000, time.UTC)
	tn := Tenant{Slug: "acme", Name: "Acme", Status: "active", PlanKey: "pro", CreatedAt: at}
	kosong := tenantJSON(tn, nil, at)
	want := "{\n  \"exportedAt\": \"2026-10-23T01:02:03.456Z\",\n  \"tenant\": {\n    \"slug\": \"acme\",\n" +
		"    \"name\": \"Acme\",\n    \"status\": \"active\",\n    \"planKey\": \"pro\",\n" +
		"    \"createdAt\": \"2026-10-23T01:02:03.456Z\"\n  },\n  \"companies\": []\n}"
	if kosong != want {
		t.Fatalf("tenant.json tanpa PT:\n%s\nmau\n%s", kosong, want)
	}
	satu := tenantJSON(tn, []companyRow{{Slug: "pt-a", Name: "PT A", IsActive: false}}, at)
	if !strings.Contains(satu, "  \"companies\": [\n    {\n      \"slug\": \"pt-a\",\n      \"name\": \"PT A\",\n      \"isActive\": false\n    }\n  ]\n}") {
		t.Fatalf("tenant.json satu PT:\n%s", satu)
	}
	if got := readme(tn, nil, at); !strings.Contains(got, "Perusahaan: (belum ada)\r\n") {
		t.Fatalf("BACA-SAYA tanpa PT: %q", got)
	}
}

func TestNamaBerkasTanggalBisnisJakarta(t *testing.T) {
	// 17:30 UTC = 00:30 WIB hari berikutnya — `businessISODate` TS.
	got, err := FileName("acme", time.Date(2026, 10, 22, 17, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if got != "ekspor-acme-2026-10-23.zip" {
		t.Fatalf("nama berkas %q", got)
	}
}

func TestArsipTanpaPTTetapLengkap(t *testing.T) {
	var buf bytes.Buffer
	at := time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC)
	sum, err := Write(context.Background(), &buf, Tenant{Slug: "acme", Name: "Acme", CreatedAt: at}, nil, Options{GeneratedAt: at})
	if err != nil {
		t.Fatal(err)
	}
	if sum.Companies != 0 {
		t.Fatalf("ringkasan %+v", sum)
	}
	r, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, f := range r.File {
		names = append(names, f.Name)
		rc, _ := f.Open()
		_, _ = io.Copy(io.Discard, rc)
		_ = rc.Close()
	}
	if strings.Join(names, ",") != "tenant.json,BACA-SAYA.txt" {
		t.Fatalf("entri %v", names)
	}
}
