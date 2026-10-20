// Package db membuka kolam koneksi ke basis data KENDALI.
//
// Hanya `control` — dan itu batas yang disengaja. Jalur yang perlu membaca buku
// sebuah perusahaan membuka koneksinya sendiri ke basis data perusahaan itu
// (#104: satu basis data per PT), jadi paket ini tidak pernah memegang satu
// koneksi yang bisa menyentuh dua perusahaan sekaligus.
package db

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// prismaOnly adalah parameter kueri yang dimengerti Prisma dan TIDAK dimengerti
// libpq.
//
// Ini bukan kerapian. pgx meneruskan parameter kueri yang tidak dikenalnya ke
// server sebagai runtime parameter, dan PostgreSQL menolak yang tidak ada —
// jadi satu `?connection_limit=2` yang tertinggal di `.env` membuat integrator
// GAGAL BOOT dengan pesan yang menyebut nama parameter, bukan menyebut bahwa
// URL-nya ditulis untuk Prisma. URL yang sama bekerja sempurna di sisi Node, di
// berkas `.env` yang sama, jadi orang berikutnya akan mencari di tempat yang
// salah.
// Daftar ini sempit DENGAN SENGAJA: ia menyebut yang dibuang, bukan yang
// disimpan. Daftar yang menyebut yang disimpan akan membuang `sslmode`,
// `application_name`, atau `connect_timeout` yang sah pada hari seseorang
// menambahkannya — dan sambungan yang kehilangan `sslmode=require` tetap
// tersambung, hanya tanpa TLS.
var prismaOnly = []string{
	"connection_limit",
	"pool_timeout",
	"socket_timeout",
	"schema",
	"sslaccept",
}

// pgBouncerParam ditulis Prisma untuk mematikan prepared statement. Nilainya
// tetap DIBACA setelah dibuang dari URL — lihat Open.
const pgBouncerParam = "pgbouncer"

// Bersih memulangkan DSN yang bisa diurai libpq, beserta apakah URL-nya
// menyatakan ia berbicara dengan PgBouncer.
//
// Murni: tanpa IO, jadi ia bisa diuji tanpa basis data. Itu disengaja — ini
// satu-satunya tempat di pohon Go yang bentuk kesalahannya "gagal boot di
// produksi dengan pesan yang menyalahkan hal lain".
func Bersih(raw string) (dsn string, lewatPgBouncer bool, err error) {
	if strings.TrimSpace(raw) == "" {
		return "", false, errors.New("DSN kosong")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", false, fmt.Errorf("DSN bukan URL yang sah: %w", err)
	}
	switch u.Scheme {
	case "postgres", "postgresql":
	default:
		// MariaDB sudah beku (#636) dan integrator tidak pernah mengenalnya.
		// Pesan ini menyebut mesinnya, karena itulah yang salah — bukan sintaks.
		return "", false, fmt.Errorf(
			"DSN bermesin %q — integrator hanya mengenal PostgreSQL", u.Scheme)
	}

	q := u.Query()
	if q.Get(pgBouncerParam) == "true" {
		lewatPgBouncer = true
	}
	q.Del(pgBouncerParam)
	for _, k := range prismaOnly {
		q.Del(k)
	}
	u.RawQuery = q.Encode()
	return u.String(), lewatPgBouncer, nil
}

// Kendali membuka kolam koneksi ke basis data kendali dari lingkungan.
//
// Jumlah koneksinya kecil dengan alasan yang sudah tertulis di sisi Node
// (`packages/core/src/control-db.ts`): `control` juga melayani autentikasi,
// dan setiap koneksi di sini adalah koneksi yang tidak bisa dipakai basis data
// perusahaan. PostgreSQL memakai satu PROSES per koneksi, bukan thread.
func Kendali(ctx context.Context, maxConns int32) (*pgxpool.Pool, error) {
	raw := os.Getenv("CONTROL_DATABASE_URL")
	if raw == "" {
		return nil, errors.New(
			"CONTROL_DATABASE_URL belum diset. Tabel `jobs` hidup di basis data " +
				"kendali (#104), dan integrator tidak punya basis data bawaan untuk " +
				"jatuh ke sana — konteks yang hilang harus MELEMPAR")
	}
	dsn, lewatPgBouncer, err := Bersih(raw)
	if err != nil {
		return nil, fmt.Errorf("CONTROL_DATABASE_URL: %w", err)
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("CONTROL_DATABASE_URL tidak bisa diurai: %w", err)
	}
	cfg.MaxConns = maxConns

	if lewatPgBouncer {
		// Di belakang PgBouncer dalam mode transaction, prepared statement yang
		// disiapkan di satu koneksi server tidak ada di koneksi berikutnya —
		// galatnya "prepared statement does not exist", muncul JARANG dan hanya
		// di bawah beban, yaitu persis kelas galat yang paling mahal untuk
		// didiagnosis belakangan.
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	}

	return pgxpool.NewWithConfig(ctx, cfg)
}
