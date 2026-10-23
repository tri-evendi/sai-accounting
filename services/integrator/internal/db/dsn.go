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
	"regexp"
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
	if err := tanpaZonaSesi(q); err != nil {
		return "", false, err
	}
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

// tanpaZonaSesi menolak DSN yang menyetel TimeZone sesi.
//
// Kolom waktu `jobs` menyimpan jam `now()` dalam TimeZone SESI (lihat "JAM
// KOLOM `jobs`" di `jobs/queue.go`), dan sisi Node tidak pernah menyetelnya —
// ia memakai zona bawaan server. Satu `?timezone=UTC` di URL Go membuat baris
// yang diklaim Go tujuh jam "lebih tua" daripada baris yang diklaim Node di
// server WIB: upkeep salah memulangkan lease yang masih hidup, tanpa galat.
// pgx meneruskan parameter kueri yang tidak dikenalnya sebagai runtime
// parameter, jadi `timezone` dan `options=-c TimeZone=…` sama-sama sampai ke
// server bila tidak ditolak di sini.
func tanpaZonaSesi(q url.Values) error {
	for k, vs := range q {
		if strings.EqualFold(k, "timezone") {
			return errors.New("DSN menyetel `timezone` — zona sesi integrator wajib zona bawaan " +
				"server yang sama dengan sisi Node (kolom waktu `jobs` adalah jam `now()` sesi)")
		}
		if strings.EqualFold(k, "options") {
			for _, v := range vs {
				if strings.Contains(strings.ToLower(v), "timezone") {
					return errors.New("DSN menyetel TimeZone lewat `options` — zona sesi integrator " +
						"wajib zona bawaan server yang sama dengan sisi Node")
				}
			}
		}
	}
	return nil
}

// EnvKendali dan EnvKendaliLangsung: DUA jalan ke basis data kendali, dan
// keduanya hidup di satu proses sejak `svc-integrator` (22 Okt 2026).
//
// Dulu `svc-tenant` menimpa `CONTROL_DATABASE_URL` di compose supaya menunjuk
// `pg` langsung, sementara `svc-interactive-go` memakai nilai `.env` (lewat
// PgBouncer). Satu proses tidak bisa punya dua nilai untuk satu nama, jadi
// jalan langsung kini bernama sendiri — nama yang SAMA dengan yang dipakai
// pagar jalur Node (`workers/runner.ts`) dan pembungkus pemimpin.
const (
	// EnvKendali: antrean & registry untuk jalur yang membaca satu PT per
	// pekerjaan. Boleh lewat PgBouncer.
	EnvKendali = "CONTROL_DATABASE_URL"
	// EnvKendaliLangsung: jalur `tenant` — pencacahan `pg_database`, pagar
	// advisory lock, dan parameter `pg_dump`. WAJIB langsung ke PostgreSQL.
	EnvKendaliLangsung = "CONTROL_DATABASE_DIRECT_URL"
)

// Kendali membuka kolam koneksi ke basis data kendali dari lingkungan
// (`CONTROL_DATABASE_URL`).
//
// Jumlah koneksinya kecil dengan alasan yang sudah tertulis di sisi Node
// (`packages/core/src/control-db.ts`): `control` juga melayani autentikasi,
// dan setiap koneksi di sini adalah koneksi yang tidak bisa dipakai basis data
// perusahaan. PostgreSQL memakai satu PROSES per koneksi, bukan thread.
func Kendali(ctx context.Context, maxConns int32) (*pgxpool.Pool, error) {
	raw := os.Getenv(EnvKendali)
	if raw == "" {
		return nil, errors.New(
			"CONTROL_DATABASE_URL belum diset. Tabel `jobs` hidup di basis data " +
				"kendali (#104), dan integrator tidak punya basis data bawaan untuk " +
				"jatuh ke sana — konteks yang hilang harus MELEMPAR")
	}
	return buka(ctx, EnvKendali, raw, maxConns)
}

// KendaliLangsung membuka kolam ke basis data kendali lewat
// `CONTROL_DATABASE_DIRECT_URL` — koneksi LANGSUNG ke PostgreSQL.
//
// Kosong MELEMPAR, dan TIDAK jatuh ke `CONTROL_DATABASE_URL`: di produksi
// nama itu menunjuk PgBouncer, dan pencacahan `pg_database` lewat pooler
// memulangkan SEBAGIAN basis data — cadangan yang ada, tampak berhasil, dan
// baru ketahuan kurang pada hari pemulihan. URL yang terbaca sebagai pooler
// juga DITOLAK (lihat LangsungKePostgres).
func KendaliLangsung(ctx context.Context, maxConns int32) (*pgxpool.Pool, error) {
	raw := os.Getenv(EnvKendaliLangsung)
	if raw == "" {
		return nil, errors.New(
			"CONTROL_DATABASE_DIRECT_URL belum diset. Jalur `tenant` mencacah " +
				"seluruh basis data dan memegang pagar advisory lock — keduanya wajib " +
				"LANGSUNG ke PostgreSQL, dan jalur ini tidak jatuh ke " +
				"CONTROL_DATABASE_URL (PgBouncer) sebagai gantinya: konteks yang " +
				"hilang harus MELEMPAR")
	}
	if err := LangsungKePostgres(raw); err != nil {
		return nil, fmt.Errorf("%s: %w", EnvKendaliLangsung, err)
	}
	return buka(ctx, EnvKendaliLangsung, raw, maxConns)
}

// poolerHost: cermin `POOLER_HOST` di `packages/db/src/session-lock.ts`. Bukan
// daftar lengkap — heuristik nama yang menangkap salah tempel yang paling
// mungkin (`pgbouncer:5432` dari `.env`).
var poolerHost = regexp.MustCompile(`(?i)bouncer|pooler|pgcat|odyssey|supavisor`)

// LangsungKePostgres menolak URL yang menyatakan atau terbaca sebagai pooler:
// `pgbouncer=true`, host bernama pooler, atau port 6432. Aturannya sama dengan
// `assertDirectUrl` sisi Node, supaya satu nilai `CONTROL_DATABASE_DIRECT_URL`
// tidak diterima satu bahasa dan ditolak yang lain.
func LangsungKePostgres(raw string) error {
	dsn, lewatPgBouncer, err := Bersih(raw)
	if err != nil {
		return err
	}
	if lewatPgBouncer {
		return errors.New("URL menyatakan pgbouncer=true — jalan ini wajib LANGSUNG ke PostgreSQL")
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("tidak bisa diurai: %w", err)
	}
	if poolerHost.MatchString(cfg.Host) {
		return fmt.Errorf("host %q adalah pooler — jalan ini wajib LANGSUNG ke PostgreSQL", cfg.Host)
	}
	if cfg.Port == 6432 {
		return errors.New("port 6432 adalah port pooler — jalan ini wajib LANGSUNG ke PostgreSQL")
	}
	return nil
}

func buka(ctx context.Context, nama, raw string, maxConns int32) (*pgxpool.Pool, error) {
	dsn, lewatPgBouncer, err := Bersih(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", nama, err)
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("%s tidak bisa diurai: %w", nama, err)
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

// Sambungan adalah parameter yang dibutuhkan PROSES ANAK (`pg_dump`).
//
// Diambil dari konfigurasi pgx yang sudah terurai, bukan diurai ulang dari
// teks: dua pengurai untuk satu URL berarti satu di antaranya akan salah pada
// sandi yang memuat `@` atau `%` — dan dua skrip di repo ini pernah gagal
// persis karena itu.
type Sambungan struct {
	Host     string
	Port     int
	User     string
	Sandi    string
	Database string
	// SSLMode dari parameter `sslmode` URL-nya, apa adanya; kosong = bawaan
	// libpq. Diteruskan ke `pg_dump` lewat PGSSLMODE: proses anak tidak
	// membaca URL, dan sambungan yang kehilangan `sslmode=require` tetap
	// tersambung — hanya tanpa TLS.
	SSLMode string
}

// SambunganKendaliLangsung menguraikan CONTROL_DATABASE_DIRECT_URL menjadi
// parameternya — sambungan yang sama dengan KendaliLangsung, untuk `pg_dump`.
func SambunganKendaliLangsung() (Sambungan, error) {
	raw := os.Getenv(EnvKendaliLangsung)
	if raw == "" {
		return Sambungan{}, errors.New("CONTROL_DATABASE_DIRECT_URL belum diset")
	}
	if err := LangsungKePostgres(raw); err != nil {
		return Sambungan{}, fmt.Errorf("%s: %w", EnvKendaliLangsung, err)
	}
	dsn, _, err := Bersih(raw)
	if err != nil {
		return Sambungan{}, fmt.Errorf("%s: %w", EnvKendaliLangsung, err)
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return Sambungan{}, fmt.Errorf("%s tidak bisa diurai: %w", EnvKendaliLangsung, err)
	}
	return Sambungan{
		Host:     cfg.Host,
		Port:     int(cfg.Port),
		User:     cfg.User,
		Sandi:    cfg.Password,
		Database: cfg.Database,
		SSLMode:  sslMode(dsn),
	}, nil
}

func sslMode(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return ""
	}
	return u.Query().Get("sslmode")
}
