package registry

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

// barisTiruan: satu baris `companies` LEFT JOIN `db_instances`.
type barisTiruan struct {
	instanceKey, urlEnvVar *string
	err                    error
}

func (b barisTiruan) Scan(dest ...any) error {
	if b.err != nil {
		return b.err
	}
	*dest[0].(*int32) = 7
	*dest[1].(*string) = "pt-b"
	*dest[2].(*string) = "PT B"
	*dest[3].(*string) = "sai_pt_b"
	*dest[4].(*bool) = true
	*dest[5].(**string) = b.instanceKey
	*dest[6].(**string) = b.urlEnvVar
	return nil
}

func ptr(s string) *string { return &s }

func TestInstansBawaanTanpaEnvVar(t *testing.T) {
	c, err := scanCompany(barisTiruan{})
	if err != nil {
		t.Fatal(err)
	}
	if c.InstanceURLEnvVar != "" || c.DatabaseName != "sai_pt_b" {
		t.Fatalf("baris bawaan terbaca %+v", c)
	}
}

func TestInstansTambahanMembawaEnvVarnya(t *testing.T) {
	c, err := scanCompany(barisTiruan{instanceKey: ptr("db2"), urlEnvVar: ptr("COMPANY_DB2_DATABASE_URL_TEMPLATE")})
	if err != nil {
		t.Fatal(err)
	}
	if c.InstanceURLEnvVar != "COMPANY_DB2_DATABASE_URL_TEMPLATE" {
		t.Fatalf("env var instans hilang: %+v", c)
	}
}

func TestKunciInstansTanpaBarisMelempar(t *testing.T) {
	// `db_instance_key` diset, tapi LEFT JOIN tidak menemukan `db_instances`:
	// membacanya sebagai instans bawaan = membaca salinan yang salah.
	if _, err := scanCompany(barisTiruan{instanceKey: ptr("db2")}); err == nil {
		t.Fatal("kunci instans tanpa baris db_instances tidak melempar")
	}
}

func TestTidakAdaBarisTetapErrNoRows(t *testing.T) {
	// Lookup* mengandalkan errors.Is(err, pgx.ErrNoRows) untuk pesan #104.
	if _, err := scanCompany(barisTiruan{err: pgx.ErrNoRows}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("galat %v kehilangan ErrNoRows", err)
	}
}
