package ledgerread

import (
	"strings"
	"testing"
)

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestCompanyDSNReplacesOnlyTheDatabaseName(t *testing.T) {
	got, err := CompanyDSN("sai_t3_pt_x", envOf(map[string]string{
		"COMPANY_DATABASE_URL_TEMPLATE": "postgres://u:p%40ss@pg:5432/template?pgbouncer=true",
	}))
	if err != nil {
		t.Fatal(err)
	}
	// Kredensial (termasuk `@` tersandi) dan parameter kueri utuh; hanya
	// jalurnya yang diganti.
	if got != "postgres://u:p%40ss@pg:5432/sai_t3_pt_x?pgbouncer=true" {
		t.Errorf("DSN = %s", got)
	}
}

func TestCompanyDSNFollowsTheSamePrecedenceAsTypeScript(t *testing.T) {
	// Urutan `templateUrl()` di src/lib/company-clients.ts. Urutan yang berbeda
	// = dua bahasa membaca dua server untuk satu nama basis data.
	env := map[string]string{
		"DATABASE_URL":         "postgres://a@one/x",
		"CONTROL_DATABASE_URL": "postgres://a@two/x",
	}
	got, _ := CompanyDSN("db", envOf(env))
	if !strings.Contains(got, "@one/") {
		t.Errorf("DATABASE_URL mesti mendahului CONTROL_DATABASE_URL: %s", got)
	}
	env["COMPANY_DATABASE_URL_TEMPLATE"] = "postgres://a@zero/x"
	got, _ = CompanyDSN("db", envOf(env))
	if !strings.Contains(got, "@zero/") {
		t.Errorf("COMPANY_DATABASE_URL_TEMPLATE mesti paling depan: %s", got)
	}
}

func TestCompanyDSNThrowsInsteadOfFallingBack(t *testing.T) {
	env := envOf(map[string]string{"DATABASE_URL": "postgres://a@h/sai_production"})
	// Nama kosong MELEMPAR — tidak jatuh ke basis data di template (#104).
	if _, err := CompanyDSN("", env); err == nil || !strings.Contains(err.Error(), "MELEMPAR") {
		t.Errorf("nama kosong mesti melempar: %v", err)
	}
	for _, bad := range []string{"a;b", "x/../y", "a b", strings.Repeat("a", 65)} {
		if _, err := CompanyDSN(bad, env); err == nil {
			t.Errorf("nama %q mesti ditolak", bad)
		}
	}
	if _, err := CompanyDSN("db", envOf(nil)); err == nil {
		t.Error("tanpa template mesti galat")
	}
}

func TestCompanyDSNAtInstansMemakaiEnvVarnyaSendiri(t *testing.T) {
	env := map[string]string{
		"COMPANY_DATABASE_URL_TEMPLATE":     "postgres://u:p@pgbouncer:5432/x",
		"COMPANY_DB2_DATABASE_URL_TEMPLATE": "postgres://u:p@db2:5432/x",
	}
	getenv := func(k string) string { return env[k] }

	got, err := CompanyDSNAt("sai_t1_pt", "COMPANY_DB2_DATABASE_URL_TEMPLATE", getenv)
	if err != nil || got != "postgres://u:p@db2:5432/sai_t1_pt" {
		t.Fatalf("instans db2: %q, %v", got, err)
	}
	got, err = CompanyDSNAt("sai_t1_pt", "", getenv)
	if err != nil || got != "postgres://u:p@pgbouncer:5432/sai_t1_pt" {
		t.Fatalf("instans bawaan: %q, %v", got, err)
	}
}

func TestCompanyDSNAtTidakPernahJatuhKeServerBawaan(t *testing.T) {
	getenv := func(k string) string {
		if k == "COMPANY_DATABASE_URL_TEMPLATE" {
			return "postgres://u:p@pgbouncer:5432/x"
		}
		return ""
	}
	if _, err := CompanyDSNAt("sai_t1_pt", "COMPANY_DB2_DATABASE_URL_TEMPLATE", getenv); err == nil {
		t.Fatal("env var instans kosong harus melempar, bukan membaca server bawaan")
	}
	if _, err := CompanyDSNAt("sai_t1_pt", "CONTROL_DATABASE_URL", getenv); err == nil {
		t.Fatal("env var di luar pola COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE harus ditolak")
	}
}
