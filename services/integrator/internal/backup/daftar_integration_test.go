package backup

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestDaftarPerInstansTerhadapDuaServerSungguhan membaca DUA server PostgreSQL
// sekali pakai bila BACKUP_TEST_PG_URL dan BACKUP_TEST_PG_DB2_URL diset (URL
// superuser, basis data apa saja). Tanpa keduanya ia DILEWATI dengan jelas —
// gerbang `bun run go:test` tidak boleh bergantung pada basis data.
//
// JANGAN arahkan ke server produksi: tes ini membuat dan menghapus basis data
// berawalan `uji_cadangan_`. Cara menjalankannya:
//
//	docker run --rm -d --name uji-a -e POSTGRES_PASSWORD=uji -p 55431:5432 postgres:17-alpine
//	docker run --rm -d --name uji-b -e POSTGRES_PASSWORD=uji -p 55432:5432 postgres:17-alpine
//	BACKUP_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55431/postgres \
//	BACKUP_TEST_PG_DB2_URL=postgres://postgres:uji@127.0.0.1:55432/postgres \
//	  go test ./internal/backup -run Sungguhan -v
//
// Registry tiruannya dibuat dengan `CREATE TABLE … AS SELECT`, bukan dengan
// pernyataan tulis baris: `tests/services-go.test.ts` memindai SELURUH pohon
// Go — tes juga — dan daftar-izin tabel yang ditulis Go harus tetap kebenaran
// produksi (`jobs`, `backup_runs`), bukan kebenaran fikstur.
func TestDaftarPerInstansTerhadapDuaServerSungguhan(t *testing.T) {
	urlA, urlB := os.Getenv("BACKUP_TEST_PG_URL"), os.Getenv("BACKUP_TEST_PG_DB2_URL")
	if urlA == "" || urlB == "" {
		t.Skip("BACKUP_TEST_PG_URL / BACKUP_TEST_PG_DB2_URL tidak diset — uji integrasi dilewati")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	a := sambung(ctx, t, urlA)
	b := sambung(ctx, t, urlB)
	const (
		kendali = "uji_cadangan_control"
		satu    = "uji_cadangan_pt_satu"
		dua     = "uji_cadangan_pt_dua"
		tiga    = "uji_cadangan_pt_tiga"
	)
	// Server A: kendali, PT satu, dan SALINAN LAMA PT dua (sisa pemindahan).
	// Server B (db2): PT dua yang sah. PT tiga terdaftar di db2 tapi tidak ada.
	for _, n := range []string{kendali, satu, dua} {
		buatBasis(ctx, t, a, n)
	}
	buatBasis(ctx, t, b, dua)

	ctl := sambungBasis(ctx, t, urlA, kendali)
	for _, q := range []string{
		`CREATE TABLE companies AS
		   SELECT * FROM (VALUES
		     (1, '` + satu + `', NULL::text),
		     (2, '` + dua + `', 'db2'),
		     (3, '` + tiga + `', 'db2')
		   ) v(id, database_name, db_instance_key)`,
		`CREATE TABLE db_instances AS
		   SELECT * FROM (VALUES
		     ('db2', 'COMPANY_DB2_DATABASE_URL_TEMPLATE', true),
		     ('db3', 'COMPANY_DB3_DATABASE_URL_TEMPLATE', true),
		     ('lama', 'COMPANY_LAMA_DATABASE_URL_TEMPLATE', false)
		   ) v(key, url_env_var, is_active)`,
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

	// db2 diset, db3 TIDAK — dan CONTROL/COMPANY bawaan diset supaya
	// ketiadaan jatuh-ke-bawaan benar-benar teruji.
	env := map[string]string{
		"COMPANY_DB2_DATABASE_URL_TEMPLATE": gantiBasis(t, urlB, "apa_saja"),
		"COMPANY_DATABASE_URL_TEMPLATE":     urlA,
		"CONTROL_DATABASE_URL":              urlA,
	}
	c, err := Daftar(ctx, pool, kendali,
		BukaInstansDariLingkungan(Perkakas{PgDump: "pg_dump"}, func(k string) string { return env[k] }))
	if err != nil {
		t.Fatalf("Daftar: %v", err)
	}

	// `lama` nonaktif dan tidak ditempati — tidak dibuka sama sekali.
	if len(c.Instans) != 1 || c.Instans[0].Kunci != "db2" || c.Instans[0].VersiServer < 10 {
		t.Errorf("instans = %+v", c.Instans)
	}
	if len(c.Gagal) != 1 || c.Gagal[0].Kunci != "db3" ||
		!strings.Contains(c.Gagal[0].Sebab, "COMPANY_DB3_DATABASE_URL_TEMPLATE") {
		t.Errorf("gagal = %+v", c.Gagal)
	}
	if !reflect.DeepEqual(c.Hilang, []string{tiga + "@db2"}) {
		t.Errorf("hilang = %v", c.Hilang)
	}

	cari := func(nama, instans string) *Basis {
		for i := range c.Basis {
			if c.Basis[i].Nama == nama && c.Basis[i].Instans == instans {
				return &c.Basis[i]
			}
		}
		return nil
	}
	if x := cari(kendali, ""); x == nil || x.Peran != PeranKendali {
		t.Errorf("kendali = %+v", x)
	}
	if x := cari(satu, ""); x == nil || x.CompanyID == nil || *x.CompanyID != 1 {
		t.Errorf("PT satu = %+v", x)
	}
	if x := cari(dua, ""); x == nil || x.Peran != PeranLain || x.CompanyID != nil {
		t.Errorf("salinan lama PT dua di server bawaan = %+v", x)
	}
	if x := cari(dua, "db2"); x == nil || x.CompanyID == nil || *x.CompanyID != 2 {
		t.Errorf("PT dua di db2 = %+v", x)
	}
	// Pendump db2 menyambung ke server B, bukan A.
	pd, ok := c.Instans[0].Pendump.(Perkakas)
	if !ok {
		t.Fatalf("pendump db2 bertipe %T", c.Instans[0].Pendump)
	}
	cfgB, _ := pgx.ParseConfig(urlB)
	if pd.Host != cfgB.Host || pd.Port != int(cfgB.Port) {
		t.Errorf("pendump db2 menyambung ke %s:%d, mau %s:%d", pd.Host, pd.Port, cfgB.Host, cfgB.Port)
	}

	// ── Ujung ke ujung dengan `pg_dump` sungguhan ─────────────────────────
	//
	// Hanya bila BACKUP_TEST_PG_DUMP_BIN + BACKUP_TEST_PG_DUMPALL_BIN diset
	// (biner versi ≥ server; boleh pembungkus `docker run --network host
	// postgres:17-alpine pg_dump "$@"`).
	dumpBin, dumpallBin := os.Getenv("BACKUP_TEST_PG_DUMP_BIN"), os.Getenv("BACKUP_TEST_PG_DUMPALL_BIN")
	if dumpBin == "" || dumpallBin == "" {
		t.Log("BACKUP_TEST_PG_DUMP_BIN tidak diset — putaran ujung ke ujung dilewati")
		return
	}
	// PT tiga kini ADA di db2, jadi satu-satunya yang kurang adalah db3.
	buatBasis(ctx, t, b, tiga)
	cfgA, _ := pgx.ParseConfig(urlA)
	dasar := Perkakas{
		PgDump: dumpBin, PgDumpall: dumpallBin,
		Host: cfgA.Host, Port: int(cfgA.Port), User: cfgA.User, Sandi: cfgA.Password,
	}
	c, err = Daftar(ctx, pool, kendali, BukaInstansDariLingkungan(dasar, func(k string) string { return env[k] }))
	if err != nil {
		t.Fatalf("Daftar kedua: %v", err)
	}
	if len(c.Hilang) != 0 {
		t.Fatalf("hilang = %v", c.Hilang)
	}
	versi, err := dasar.VersiKlien(ctx)
	if err != nil {
		t.Fatal(err)
	}
	akar := t.TempDir()
	h, err := Jalankan(ctx, Opsi{
		Prefix: "sai", Kunci: sandiUji, Perkakas: dasar, Tujuan: NewCakram(akar),
		Cacah: c, NamaKendali: kendali, VersiServer: 17, VersiKlien: versi,
		DirKerja: t.TempDir(), DirData: t.TempDir(), Saat: time.Now().UTC(),
	})
	var gi *GalatInstans
	if !errors.As(err, &gi) || gi.Gagal[0].Kunci != "db3" || h == nil {
		t.Fatalf("putaran = %v / %+v, mau sebagian karena db3", err, h)
	}
	for _, kunci := range []string{
		KunciBasis("", satu), KunciBasis("", dua), KunciBasis("db2", dua), KunciBasis("db2", tiga),
		KunciGlobals(""), KunciGlobals("db2"),
	} {
		isi := bukaDenganOpenSSL(t, filepath.Join(akar, h.Manifest.Putaran, kunci))
		if strings.HasPrefix(kunci, "instans/") || strings.HasPrefix(kunci, "db-") {
			if strings.HasSuffix(kunci, ".dump.enc") && !bytes.HasPrefix(isi, []byte("PGDMP")) {
				t.Errorf("%s bukan dump format custom", kunci)
			}
		}
		if strings.HasSuffix(kunci, "globals.sql.enc") && !bytes.Contains(isi, []byte("CREATE ROLE")) {
			t.Errorf("%s tidak memuat peran", kunci)
		}
	}
	if p := h.Manifest.BasisPerusahaan(2); p == nil || p.Kunci != KunciBasis("db2", dua) {
		t.Errorf("objek PT 2 = %+v", p)
	}
}

func sambung(ctx context.Context, t *testing.T, url string) *pgx.Conn {
	t.Helper()
	c, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatalf("sambung %s: %v", url, err)
	}
	t.Cleanup(func() { _ = c.Close(context.Background()) })
	return c
}

func sambungBasis(ctx context.Context, t *testing.T, url, basis string) *pgx.Conn {
	t.Helper()
	c, err := pgx.Connect(ctx, gantiBasis(t, url, basis))
	if err != nil {
		t.Fatalf("sambung %s: %v", basis, err)
	}
	return c
}

func gantiBasis(t *testing.T, url, basis string) string {
	t.Helper()
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	i := strings.LastIndex(url, "/"+cfg.Database)
	if i < 0 {
		t.Fatalf("URL uji harus menyebut basis datanya: %s", url)
	}
	return url[:i] + "/" + basis + url[i+len(cfg.Database)+1:]
}

// buatBasis membuat basis data uji dan menjadwalkan penghapusannya.
func buatBasis(ctx context.Context, t *testing.T, c *pgx.Conn, nama string) {
	t.Helper()
	if !strings.HasPrefix(nama, "uji_cadangan_") {
		t.Fatalf("menolak menyentuh %s", nama)
	}
	hapus := func() {
		_, _ = c.Exec(context.Background(), `DROP DATABASE IF EXISTS `+pgx.Identifier{nama}.Sanitize()+` WITH (FORCE)`)
	}
	hapus()
	if _, err := c.Exec(ctx, `CREATE DATABASE `+pgx.Identifier{nama}.Sanitize()); err != nil {
		t.Fatalf("buat %s: %v", nama, err)
	}
	t.Cleanup(hapus)
}
