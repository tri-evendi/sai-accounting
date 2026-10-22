// PENJAGA penyelesai instans basis data — cermin `company-url.ts` di Go.
//
// Yang dijaga satu sifat: instans yang tidak bisa diselesaikan MELEMPAR, dan
// tidak ada satu jalur pun yang berakhir di server bawaan.
package db

import (
	"strings"
	"testing"
)

func envDari(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestSambunganInstansMembacaEnvYangDISEBUTBaris(t *testing.T) {
	s, dsn, err := SambunganInstans("db2", "COMPANY_DB2_DATABASE_URL_TEMPLATE", envDari(map[string]string{
		"COMPANY_DB2_DATABASE_URL_TEMPLATE": "postgresql://sai:r%40h%25sia@pg-db2:5433/apa_saja?sslmode=require&connection_limit=3",
		"CONTROL_DATABASE_URL":              "postgres://sai:x@pg:5432/sai_control",
	}))
	if err != nil {
		t.Fatalf("galat: %v", err)
	}
	if s.Host != "pg-db2" || s.Port != 5433 || s.User != "sai" {
		t.Errorf("sambungan = %+v", s)
	}
	// Sandi dengan `@` dan `%` terurai sekali, oleh satu pengurai.
	if s.Sandi != "r@h%sia" {
		t.Errorf("sandi = %q", s.Sandi)
	}
	// Pathname template tidak berarti apa pun — pencacahan membaca `postgres`.
	if s.Database != "postgres" || !strings.Contains(dsn, "/postgres") {
		t.Errorf("basis data = %q, dsn = %s", s.Database, dsn)
	}
	if s.SSLMode != "require" || !strings.Contains(dsn, "sslmode=require") {
		t.Errorf("sslmode hilang: %q / %s", s.SSLMode, dsn)
	}
	if strings.Contains(dsn, "connection_limit") {
		t.Errorf("parameter Prisma masih ada: %s", dsn)
	}
}

func TestEnvInstansYangKOSONGMelemparTanpaJatuhKeBawaan(t *testing.T) {
	// Semua sumber instans bawaan diset; tidak satu pun boleh dipakai.
	env := envDari(map[string]string{
		"COMPANY_DATABASE_URL_TEMPLATE": "postgres://sai:x@pg:5432/t",
		"DATABASE_URL":                  "postgres://sai:x@pg:5432/t",
		"CONTROL_DATABASE_URL":          "postgres://sai:x@pg:5432/sai_control",
	})
	_, _, err := SambunganInstans("db2", "COMPANY_DB2_DATABASE_URL_TEMPLATE", env)
	if err == nil {
		t.Fatal("env instans yang kosong malah terselesaikan")
	}
	if !strings.Contains(err.Error(), "COMPANY_DB2_DATABASE_URL_TEMPLATE") {
		t.Errorf("pesan tidak menyebut env var-nya: %v", err)
	}
}

func TestNamaEnvDiLuarBentuknyaDITOLAK(t *testing.T) {
	// Tanpa ini satu baris registry bisa menunjuk CONTROL_DATABASE_URL, dan
	// "instans db2" diam-diam menjadi server bawaan.
	env := envDari(map[string]string{"CONTROL_DATABASE_URL": "postgres://sai:x@pg:5432/sai_control"})
	for _, nama := range []string{
		"CONTROL_DATABASE_URL", "DATABASE_URL", "COMPANY_DATABASE_URL_TEMPLATE",
		"company_db2_database_url_template", "COMPANY_DB2_DATABASE_URL",
	} {
		if _, _, err := SambunganInstans("db2", nama, env); err == nil {
			t.Errorf("env var %q diterima", nama)
		}
	}
}

func TestKunciInstansDiLuarBentuknyaDITOLAK(t *testing.T) {
	env := envDari(map[string]string{"COMPANY_X_DATABASE_URL_TEMPLATE": "postgres://sai:x@h:5432/p"})
	for _, k := range []string{"", "default", "DB2", "2db", "db-2", strings.Repeat("a", 33)} {
		if _, _, err := SambunganInstans(k, "COMPANY_X_DATABASE_URL_TEMPLATE", env); err == nil {
			t.Errorf("kunci %q diterima", k)
		}
	}
}

func TestURLInstansLewatPgBouncerDITOLAK(t *testing.T) {
	// Pencacahan lewat pooler memulangkan sebagian basis data.
	_, _, err := SambunganInstans("db2", "COMPANY_DB2_DATABASE_URL_TEMPLATE", envDari(map[string]string{
		"COMPANY_DB2_DATABASE_URL_TEMPLATE": "postgres://sai:x@pgbouncer-db2:6432/t?pgbouncer=true",
	}))
	if err == nil || !strings.Contains(err.Error(), "LANGSUNG") {
		t.Fatalf("URL PgBouncer diterima atau pesannya tidak menyebut sebabnya: %v", err)
	}
}

func TestMesinSelainPostgreSQLDitolak(t *testing.T) {
	_, _, err := SambunganInstans("db2", "COMPANY_DB2_DATABASE_URL_TEMPLATE", envDari(map[string]string{
		"COMPANY_DB2_DATABASE_URL_TEMPLATE": "mysql://sai:x@db:3306/t",
	}))
	if err == nil {
		t.Fatal("URL mysql diterima")
	}
}
