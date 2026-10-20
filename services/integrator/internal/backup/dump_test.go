// PENJAGA gerbang versi & perakitan argumen `pg_dump`.
package backup

import (
	"strings"
	"testing"
)

func TestPeriksaVersiKlienLebihTuaDitolak(t *testing.T) {
	/* Bentuk kegagalannya sudah terukur sekali di repo ini:
	   pg_dumpall: error: aborting because of server version mismatch
	   detail: server version: 17.11; pg_dumpall version: 15.19
	 dan ia terjadi pada cadangan PERTAMA sesudah penukaran. */
	err := PeriksaVersi(15, 17)
	if err == nil {
		t.Fatal("klien 15 terhadap server 17 diterima")
	}
	// Pesannya harus menyebut bentuk kegagalan yang akan terjadi, bukan hanya
	// angkanya: orang yang membacanya sedang mencari sebab, bukan perbandingan.
	if !strings.Contains(err.Error(), "server version mismatch") {
		t.Errorf("pesan tidak menyebut bentuk kegagalannya: %v", err)
	}
	if !strings.Contains(err.Error(), "postgresql-client") {
		t.Errorf("pesan tidak menyebut apa yang harus dinaikkan: %v", err)
	}
}

func TestPeriksaVersiKlienLebihBaruDITERIMA(t *testing.T) {
	/* Arahnya penting: klien yang lebih BARU bisa mendump server yang lebih
	   tua. Aturannya bukan "harus sama" melainkan klien ≥ server — dan gerbang
	   yang menuntut "harus sama" akan menolak image yang justru benar. */
	for _, pasangan := range [][2]int{{17, 17}, {18, 17}, {17, 15}} {
		if err := PeriksaVersi(pasangan[0], pasangan[1]); err != nil {
			t.Errorf("klien %d / server %d ditolak: %v", pasangan[0], pasangan[1], err)
		}
	}
}

func TestMayorDibacaDariTeksVersi(t *testing.T) {
	kasus := map[string]int{
		"pg_dump (PostgreSQL) 17.6\n":           17,
		"pg_dump (PostgreSQL) 15.19 (Debian)\n": 15,
		"17.11":                                 17,
		"18beta1":                               18,
	}
	for teks, mau := range kasus {
		got, err := VersiServer(teks)
		if err != nil {
			t.Errorf("%q: %v", teks, err)
			continue
		}
		if got != mau {
			t.Errorf("%q → %d, mau %d", teks, got, mau)
		}
	}
	if _, err := VersiServer("tanpa angka"); err == nil {
		t.Error("teks tanpa angka diterima")
	}
}

func TestSandiTIDAKPernahJadiArgumen(t *testing.T) {
	/* Argumen baris perintah terbaca siapa pun yang bisa menjalankan `ps` di
	   dalam container — aturan yang sama yang membuat `scripts/backup.sh`
	   memakai berkas opsi alih-alih `--password=`. */
	p := Perkakas{PgDump: "pg_dump", Host: "pg", Port: 5432, User: "sai", Sandi: "rahasia"}
	for _, a := range p.argSambungan() {
		if strings.Contains(a, "rahasia") {
			t.Errorf("sandi muncul di argumen: %q", a)
		}
	}
	var lewatEnv bool
	for _, e := range p.lingkungan() {
		if e == "PGPASSWORD=rahasia" {
			lewatEnv = true
		}
	}
	if !lewatEnv {
		t.Error("sandi tidak diserahkan lewat PGPASSWORD")
	}
}

func TestLingkunganTIDAKMewarisiLingkunganProses(t *testing.T) {
	/* `cmd.Env` disetel PENUH, bukan ditambahkan ke `os.Environ()`. Di jalur
	   `tenant`-lah satu-satunya tempat `BACKUP_ENCRYPTION_KEY` dan kredensial
	   S3 hidup, dan proses anak tidak punya alasan untuk melihatnya. */
	p := Perkakas{Sandi: "x"}
	env := p.lingkungan()
	if len(env) != 1 {
		t.Errorf("lingkungan proses anak memuat %d entri: %v", len(env), env)
	}
}
