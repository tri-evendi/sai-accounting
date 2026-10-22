package backup

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// Perkakas adalah biner `pg_dump`/`pg_dumpall` beserta kredensial servernya.
//
// Dijalankan sebagai PROSES dan bukan ditulis ulang: format dump PostgreSQL
// adalah format yang hanya perkakas resminya yang berhak mengklaim bisa
// menulis, dan pemulihan memakai `pg_restore` yang sama. Alasan yang sama
// dengan `awscli` di Dockerfile — protokol yang sudah dipakai jutaan orang
// tidak layak ditulis ulang.
type Perkakas struct {
	PgDump    string
	PgDumpall string
	Host      string
	Port      int
	User      string
	Sandi     string
	// SSLMode diteruskan sebagai PGSSLMODE bila diset; kosong = bawaan libpq.
	SSLMode string
}

// Pernyataan waktu-kompilasi: `Perkakas` memenuhi `Pendump`. Tanpa baris ini,
// ketidakcocokan tanda tangan baru terbaca di tempat ia disuntikkan — jauh dari
// berkas yang salah.
var _ Pendump = Perkakas{}

// lingkungan menyerahkan sandi lewat PGPASSWORD, bukan lewat argumen.
//
// Argumen baris perintah terbaca siapa pun yang bisa menjalankan `ps` di dalam
// container — aturan yang sama yang membuat `scripts/backup.sh` memakai berkas
// opsi alih-alih `--password=`.
func (p Perkakas) lingkungan() []string {
	env := []string{"PGPASSWORD=" + p.Sandi}
	if p.SSLMode != "" {
		env = append(env, "PGSSLMODE="+p.SSLMode)
	}
	return env
}

func (p Perkakas) argSambungan() []string {
	return []string{
		"--host=" + p.Host,
		"--port=" + strconv.Itoa(p.Port),
		"--username=" + p.User,
	}
}

// DumpBasis menulis dump SATU basis data ke w, dalam format custom (`-Fc`).
//
// ══ `-Fc`, BUKAN SQL TEKS, DAN ITU YANG MEMBUKA PEMULIHAN PER TENANT ═══════
// Format custom bisa dipulihkan SEBAGIAN: `pg_restore --table=invoices` pada
// satu basis data, tanpa menyentuh yang lain dan tanpa mengurai gigabyte teks
// lebih dulu. Dump teks hanya bisa dijalankan seluruhnya, dan "pulihkan tabel
// ini saja" berubah menjadi menyunting berkas SQL raksasa dengan tangan pada
// hari yang paling buruk untuk melakukannya.
//
// Ia juga sudah terkompresi, jadi tidak ada `gzip` kedua di jalur ini.
func (p Perkakas) DumpBasis(ctx context.Context, nama string, w io.Writer) error {
	arg := append(p.argSambungan(),
		"--format=custom",
		// `--no-owner --no-acl`: pemulihan ke server BAYANGAN (latihan kuartalan,
		// `prove-backup-restore`) jarang punya peran yang sama. Dump yang menuntut
		// peran yang tidak ada gagal di tengah pemulihan — dan peran serta hak
		// aksesnya sudah ikut di `globals.sql`, yang memang tempatnya.
		"--no-owner", "--no-acl",
		"--dbname="+nama,
	)
	return p.jalankan(ctx, p.PgDump, arg, w, fmt.Sprintf("pg_dump %s", nama))
}

// DumpGlobals menulis peran, hak akses, dan setelan tingkat server.
//
// Satu objek untuk seluruh pemasangan, dan ia WAJIB ada: dump per basis data
// tidak memuat satu pun peran, jadi pemasangan yang dipulihkan dari dump-dump
// itu saja akan berisi data lengkap yang tidak bisa dimasuki siapa pun.
func (p Perkakas) DumpGlobals(ctx context.Context, w io.Writer) error {
	arg := append(p.argSambungan(), "--globals-only", "--clean", "--if-exists")
	return p.jalankan(ctx, p.PgDumpall, arg, w, "pg_dumpall --globals-only")
}

func (p Perkakas) jalankan(ctx context.Context, biner string, arg []string, w io.Writer, label string) error {
	cmd := exec.CommandContext(ctx, biner, arg...) //nolint:gosec // biner & arg dirakit di sini, bukan dari muatan
	cmd.Env = p.lingkungan()
	cmd.Stdout = w
	var galat strings.Builder
	cmd.Stderr = &galat
	if err := cmd.Run(); err != nil {
		// stderr-nya dibawa apa adanya: pesan `pg_dump` menyebutkan SEBAB
		// (versi tidak cocok, basis data tidak ada, izin kurang), dan tanpa itu
		// yang tercatat hanya "exit status 1".
		return fmt.Errorf("%s gagal: %w — %s", label, err, strings.TrimSpace(galat.String()))
	}
	return nil
}

// VersiKlien memulangkan versi mayor `pg_dump` di mesin ini.
func (p Perkakas) VersiKlien(ctx context.Context) (int, error) {
	out, err := exec.CommandContext(ctx, p.PgDump, "--version").Output() //nolint:gosec // jalur biner dari konfigurasi
	if err != nil {
		return 0, fmt.Errorf("pg_dump --version: %w", err)
	}
	return mayor(string(out))
}

var polaMayor = regexp.MustCompile(`(\d+)`)

// mayor menarik versi mayor dari teks seperti "pg_dump (PostgreSQL) 17.6".
func mayor(teks string) (int, error) {
	m := polaMayor.FindStringSubmatch(teks)
	if m == nil {
		return 0, fmt.Errorf("tidak menemukan nomor versi di %q", strings.TrimSpace(teks))
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		return 0, fmt.Errorf("versi %q bukan bilangan: %w", m[1], err)
	}
	return n, nil
}

// ══ GERBANG VERSI DI SAAT JALAN, BUKAN HANYA DI DOCKERFILE ═════════════════
//
// `tests/pg-client-version.test.ts` sudah menjaga bahwa Dockerfile memasang
// klien yang tidak lebih tua daripada server di compose. Itu menjaga NIAT.
// Yang dijaga di bawah ini KENYATAAN: image yang dibangun dari Dockerfile lain,
// mesin on-premise yang servernya dinaikkan tanpa image ikut naik, atau
// `pg_dump` yang kebetulan lebih tua di PATH.
//
// Bentuk kegagalannya tanpa gerbang ini sudah terukur sekali di repo ini:
//
//	pg_dumpall: error: aborting because of server version mismatch
//	detail: server version: 17.11; pg_dumpall version: 15.19
//
// Dan ia terjadi pada cadangan PERTAMA sesudah penukaran — waktu terburuk yang
// mungkin. Arahnya penting: klien yang lebih BARU bisa mendump server yang
// lebih tua, jadi aturannya bukan "harus sama" melainkan klien ≥ server.

// PeriksaVersi menolak klien yang lebih tua daripada servernya.
//
// Murni terhadap angkanya supaya bisa diuji tanpa server maupun biner.
func PeriksaVersi(klien, server int) error {
	if klien < server {
		return fmt.Errorf(
			"pg_dump %d lebih tua daripada server %d — ia akan MENOLAK dengan "+
				"\"aborting because of server version mismatch\", dan penolakan itu "+
				"terjadi pada cadangan pertama sesudah server dinaikkan. "+
				"Naikkan postgresql-client di image jalur `tenant`",
			klien, server)
	}
	return nil
}

// VersiServer membaca `server_version` dari server yang sedang tersambung.
func VersiServer(teks string) (int, error) { return mayor(teks) }
