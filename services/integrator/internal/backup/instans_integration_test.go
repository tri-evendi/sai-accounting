package backup

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Dua uji integrasi tambahan, dengan syarat dan peringatan yang sama dengan
// TestDaftarPerInstansTerhadapDuaServerSungguhan (server SEKALI PAKAI saja —
// keduanya membuat basis data `uji_cadangan_*` dan peran `uji_cadangan_*`).

// TestTanpaBarisDbInstancesTIDAKADAInstansYangDibuka membuktikan bahwa
// pemasangan tanpa satu baris `db_instances` pun berperilaku seperti sebelum
// tahap 4: pembuka instans tidak pernah dipanggil, tidak ada instans tercacah
// atau gagal, dan setiap basis data bertanda instans bawaan.
func TestTanpaBarisDbInstancesTIDAKADAInstansYangDibuka(t *testing.T) {
	urlA := os.Getenv("BACKUP_TEST_PG_URL")
	if urlA == "" {
		t.Skip("BACKUP_TEST_PG_URL tidak diset — uji integrasi dilewati")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	a := sambung(ctx, t, urlA)
	const (
		kendali = "uji_cadangan_satu_server_control"
		pt      = "uji_cadangan_satu_server_pt"
	)
	buatBasis(ctx, t, a, kendali)
	buatBasis(ctx, t, a, pt)
	ctl := sambungBasis(ctx, t, urlA, kendali)
	for _, q := range []string{
		`CREATE TABLE companies AS
		   SELECT * FROM (VALUES (1, '` + pt + `', NULL::text)) v(id, database_name, db_instance_key)`,
		// Tabel ADA tapi kosong — keadaan setiap pemasangan sesudah migration
		// kendali 0009 dan sebelum pemindahan pertama.
		`CREATE TABLE db_instances AS
		   SELECT * FROM (VALUES ('x', 'COMPANY_X_DATABASE_URL_TEMPLATE', true)) v(key, url_env_var, is_active)
		    WHERE false`,
	} {
		if _, err := ctl.Exec(ctx, q); err != nil {
			t.Fatalf("fikstur registry: %v", err)
		}
	}
	_ = ctl.Close(ctx)

	pool, err := pgxpool.New(ctx, gantiBasis(t, urlA, kendali))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	c, err := Daftar(ctx, pool, kendali, func(context.Context, Instans) (*ServerInstans, error) {
		t.Fatal("pembuka instans dipanggil padahal db_instances kosong")
		return nil, nil
	})
	if err != nil {
		t.Fatalf("Daftar: %v", err)
	}
	if len(c.Instans) != 0 || len(c.Gagal) != 0 || len(c.Hilang) != 0 {
		t.Errorf("instans=%+v gagal=%+v hilang=%v", c.Instans, c.Gagal, c.Hilang)
	}
	for _, b := range c.Basis {
		if b.Instans != "" {
			t.Errorf("basis %s bertanda instans %q", b.Nama, b.Instans)
		}
	}
}

// TestPeranInstansTanpaPgReadAllDataGAGALDiDepan: peran pemilik NOSUPERUSER
// di instans tambahan — konvensi template `company-url` — ditolak SEBELUM satu
// buku pun didump, dengan kalimat yang menyebut GRANT-nya; sesudah GRANT ia
// diterima.
func TestPeranInstansTanpaPgReadAllDataGAGALDiDepan(t *testing.T) {
	urlB := os.Getenv("BACKUP_TEST_PG_DB2_URL")
	if urlB == "" {
		t.Skip("BACKUP_TEST_PG_DB2_URL tidak diset — uji integrasi dilewati")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	b := sambung(ctx, t, urlB)
	const peran = "uji_cadangan_pemilik"
	hapus := func() {
		_, _ = b.Exec(context.Background(), `DROP ROLE IF EXISTS `+pgx.Identifier{peran}.Sanitize())
	}
	hapus()
	if _, err := b.Exec(ctx, `CREATE ROLE `+pgx.Identifier{peran}.Sanitize()+
		` LOGIN PASSWORD 'uji' NOSUPERUSER CREATEDB`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hapus)

	cfg, err := pgx.ParseConfig(urlB)
	if err != nil {
		t.Fatal(err)
	}
	template := strings.Replace(urlB, cfg.User+":"+cfg.Password+"@", peran+":uji@", 1)
	if template == urlB {
		t.Fatalf("URL uji harus berbentuk user:sandi@host: %s", urlB)
	}
	env := map[string]string{"COMPANY_DB2_DATABASE_URL_TEMPLATE": template}
	buka := BukaInstansDariLingkungan(Perkakas{PgDump: "pg_dump"}, func(k string) string { return env[k] })
	ins := Instans{Kunci: "db2", EnvVar: "COMPANY_DB2_DATABASE_URL_TEMPLATE"}

	_, err = buka(ctx, ins)
	if err == nil || !strings.Contains(err.Error(), "GRANT pg_read_all_data") ||
		!strings.Contains(err.Error(), peran) {
		t.Fatalf("galat = %v, mau penolakan yang menyebut GRANT", err)
	}

	if _, err := b.Exec(ctx, `GRANT pg_read_all_data TO `+pgx.Identifier{peran}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	s, err := buka(ctx, ins)
	if err != nil {
		t.Fatalf("sesudah GRANT: %v", err)
	}
	if pd, ok := s.Pendump.(Perkakas); !ok || pd.User != peran {
		t.Errorf("pendump = %+v", s.Pendump)
	}
}
