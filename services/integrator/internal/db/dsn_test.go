// PENJAGA pembersih DSN.
//
// Satu-satunya bagian lapisan koneksi yang bentuk kesalahannya "gagal boot di
// produksi dengan pesan yang menyalahkan hal lain" — URL Prisma yang sama
// bekerja sempurna di sisi Node, di berkas `.env` yang sama, jadi orang
// berikutnya akan mencari di tempat yang salah. Karena murni, ia diuji tanpa
// satu pun basis data.
package db

import (
	"net/url"
	"strings"
	"testing"
)

func TestBersihMembuangParameterKhususPrisma(t *testing.T) {
	dsn, _, err := Bersih(
		"postgres://sai:rahasia@pg:5432/sai_control?connection_limit=2&schema=public&pool_timeout=10")
	if err != nil {
		t.Fatalf("galat: %v", err)
	}
	for _, p := range []string{"connection_limit", "schema", "pool_timeout"} {
		if strings.Contains(dsn, p) {
			t.Errorf("%q masih ada di DSN: %s", p, dsn)
		}
	}
}

func TestBersihMEMPERTAHANKANParameterLibpq(t *testing.T) {
	// Sambungan yang kehilangan `sslmode=require` TETAP tersambung, hanya tanpa
	// TLS. Itu sebabnya daftar di `prismaOnly` menyebut yang DIBUANG, bukan yang
	// disimpan.
	dsn, _, err := Bersih(
		"postgres://sai:rahasia@pg:5432/sai_control?sslmode=require&application_name=svc-tenant&connect_timeout=5")
	if err != nil {
		t.Fatalf("galat: %v", err)
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("hasilnya bukan URL: %v", err)
	}
	q := u.Query()
	for p, mau := range map[string]string{
		"sslmode":          "require",
		"application_name": "svc-tenant",
		"connect_timeout":  "5",
	} {
		if got := q.Get(p); got != mau {
			t.Errorf("%s = %q, mau %q", p, got, mau)
		}
	}
}

func TestBersihMempertahankanKredensialDanBasisData(t *testing.T) {
	// Sandi ber-karakter khusus: dua skrip di repo ini pernah lupa men-decode
	// persen-encoding dan gagal hanya ketika sandinya kebetulan memuat `@`.
	raw := "postgres://sai:p%40ss%25word@pg:5432/sai_control"
	dsn, _, err := Bersih(raw)
	if err != nil {
		t.Fatalf("galat: %v", err)
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("hasilnya bukan URL: %v", err)
	}
	sandi, ada := u.User.Password()
	if !ada || sandi != "p@ss%word" {
		t.Errorf("sandi = %q (ada=%v), mau %q", sandi, ada, "p@ss%word")
	}
	if u.Path != "/sai_control" {
		t.Errorf("basis data = %q", u.Path)
	}
	if u.Host != "pg:5432" {
		t.Errorf("host = %q", u.Host)
	}
}

func TestBersihMelaporkanPgBouncerDanMembuangParameternya(t *testing.T) {
	// Di belakang PgBouncer mode transaction, prepared statement yang disiapkan
	// di satu koneksi server tidak ada di koneksi berikutnya. Galatnya muncul
	// JARANG dan hanya di bawah beban.
	dsn, lewat, err := Bersih("postgres://sai:x@pgbouncer:6432/sai_control?pgbouncer=true")
	if err != nil {
		t.Fatalf("galat: %v", err)
	}
	if !lewat {
		t.Error("pgbouncer=true tidak terbaca")
	}
	/* Diperiksa di PARAMETER-nya, bukan di teks DSN: host di belakang PgBouncer
	   memang bernama `pgbouncer`, jadi pencarian teks biasa akan menuduh nama
	   host sebagai parameter yang tertinggal. */
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("hasilnya bukan URL: %v", err)
	}
	if u.Query().Has("pgbouncer") {
		t.Errorf("parameter pgbouncer masih diteruskan ke server: %s", dsn)
	}
}

func TestBersihTanpaPgBouncerTidakMelaporkannya(t *testing.T) {
	_, lewat, err := Bersih("postgres://sai:x@pg:5432/sai_control")
	if err != nil {
		t.Fatalf("galat: %v", err)
	}
	if lewat {
		t.Error("melaporkan PgBouncer padahal URL-nya tidak menyebutnya")
	}
}

func TestBersihMenolakMesinLain(t *testing.T) {
	// MariaDB sudah beku (#636) dan integrator tidak pernah mengenalnya. Yang
	// penting di sini BUKAN penolakannya melainkan pesannya: ia harus menyebut
	// mesinnya, sebab itulah yang salah.
	_, _, err := Bersih("mysql://sai:x@db:3306/sai_control")
	if err == nil {
		t.Fatal("DSN MariaDB diterima")
	}
	if !strings.Contains(err.Error(), "mysql") {
		t.Errorf("pesan galat tidak menyebut mesinnya: %v", err)
	}
}

func TestBersihMenolakYangKosong(t *testing.T) {
	for _, raw := range []string{"", "   "} {
		if _, _, err := Bersih(raw); err == nil {
			t.Errorf("DSN kosong (%q) diterima", raw)
		}
	}
}
