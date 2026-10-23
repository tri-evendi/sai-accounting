// Package ledgerread MEMBACA buku besar satu perusahaan — tahap 1d (09 §9).
//
// ══ HANYA MEMBACA, DAN ITU DITEGAKKAN DUA KALI ═════════════════════════════
// Invarian I-2: pintu posting wajib tunggal, dan pintu itu TypeScript. Paket
// ini tidak memuat satu pun INSERT/UPDATE/DELETE — `tests/services-go.test.ts`
// menolaknya dari teks — dan setiap pembacaan berjalan di dalam transaksi
// `READ ONLY`, jadi kode yang suatu hari lolos dari penjaga teks tetap ditolak
// PostgreSQL sendiri (`cannot execute INSERT in a read-only transaction`).
// Transaksi itu juga `REPEATABLE READ`: semua kueri satu laporan melihat satu
// potret buku yang sama, bukan buku yang berubah di antara dua kueri.
//
// ══ SATU KOLAM = SATU PERUSAHAAN ═══════════════════════════════════════════
// #104: buku setiap PT hidup di basis data sendiri. Reader dibuka untuk SATU
// nama basis data dan tidak bisa dialihkan ke perusahaan lain — tidak ada
// "basis data bawaan" untuk dijatuhi bila namanya hilang; nama kosong MELEMPAR.
package ledgerread

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
)

// safeDatabaseName sama dengan `SAFE_DATABASE_NAME` di
// `src/lib/company-clients.ts`. Nilainya datang dari registry `companies`,
// bukan dari pengguna — tapi ia menyusun string koneksi, dan apa pun yang
// menyusun string koneksi layak diperiksa apa pun asalnya.
var safeDatabaseName = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)

// templateEnv adalah sumber kredensial buku perusahaan, dalam urutan yang SAMA
// dengan `templateUrl()` di `src/lib/company-clients.ts`. Urutan yang berbeda
// berarti dua bahasa membaca dua server berbeda untuk satu nama basis data —
// dan paritas yang lolos di antara dua buku yang berbeda tidak membuktikan
// apa pun.
var templateEnv = []string{
	"COMPANY_DATABASE_URL_TEMPLATE",
	"DATABASE_URL",
	"CONTROL_DATABASE_URL",
}

// CompanyDSN menyusun DSN buku satu perusahaan: host & kredensial dari
// template di lingkungan, NAMA basis datanya dari argumen. Kredensial tidak
// pernah diambil dari basis data (#104).
func CompanyDSN(databaseName string, getenv func(string) string) (string, error) {
	if databaseName == "" {
		return "", errors.New(
			"nama basis data perusahaan kosong — konteks perusahaan yang hilang " +
				"MELEMPAR, tidak pernah jatuh ke basis data bawaan (#104)")
	}
	if !safeDatabaseName.MatchString(databaseName) {
		return "", fmt.Errorf("nama basis data tidak sah: %q", databaseName)
	}
	var raw, from string
	for _, k := range templateEnv {
		if v := getenv(k); v != "" {
			raw, from = v, k
			break
		}
	}
	if raw == "" {
		return "", errors.New(
			"tidak ada sumber kredensial buku perusahaan: set " +
				"COMPANY_DATABASE_URL_TEMPLATE (atau DATABASE_URL)")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%s bukan URL yang sah: %w", from, err)
	}
	u.Path = "/" + databaseName
	u.RawPath = ""
	return u.String(), nil
}

// Reader membaca buku SATU perusahaan.
type Reader struct {
	pool         *pgxpool.Pool
	databaseName string
}

// Open membuka kolam kecil ke buku satu perusahaan. Satu koneksi cukup:
// setiap laporan satu transaksi baca, dan koneksi ke basis data perusahaan
// adalah koneksi yang tidak bisa dipakai `app-customer`.
func Open(ctx context.Context, databaseName string) (*Reader, error) {
	return OpenAt(ctx, databaseName, "")
}

// instanceURLEnv: `DB_INSTANCE_URL_ENV_PATTERN` — satu pola yang dibangkitkan
// dari `contract/db-instances.yaml`, dipegang `db.PolaEnvInstans` dan dibaca
// juga oleh jalur `tenant` yang mencadangkan instans yang sama.
var instanceURLEnv = db.PolaEnvInstans

// CompanyDSNAt menyusun DSN buku di instans `db_instances` yang env var-nya
// bernama urlEnvVar; urlEnvVar kosong = instans bawaan (`CompanyDSN`).
//
// Instans yang tidak bisa diselesaikan MELEMPAR, tidak pernah jatuh ke server
// bawaan: selama pemindahan, server bawaan masih memegang salinan lama buku
// yang sama namanya, dan berkas dari salinan itu salah tanpa galat (tahap 4).
func CompanyDSNAt(databaseName, urlEnvVar string, getenv func(string) string) (string, error) {
	if urlEnvVar == "" {
		return CompanyDSN(databaseName, getenv)
	}
	if !safeDatabaseName.MatchString(databaseName) {
		return "", fmt.Errorf("nama basis data tidak sah: %q", databaseName)
	}
	if !instanceURLEnv.MatchString(urlEnvVar) {
		return "", fmt.Errorf(
			"instans menunjuk env var %q — bentuk yang sah hanya %s<KUNCI>%s",
			urlEnvVar, contract.DBInstanceURLEnvPrefix, contract.DBInstanceURLEnvSuffix)
	}
	raw := getenv(urlEnvVar)
	if raw == "" {
		return "", fmt.Errorf(
			"%s tidak diset di proses ini — buku %s TIDAK dibaca dari server bawaan sebagai gantinya",
			urlEnvVar, databaseName)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%s bukan URL yang sah: %w", urlEnvVar, err)
	}
	u.Path = "/" + databaseName
	u.RawPath = ""
	return u.String(), nil
}

// OpenAt membuka buku satu perusahaan di instansnya (lihat `CompanyDSNAt`).
func OpenAt(ctx context.Context, databaseName, urlEnvVar string) (*Reader, error) {
	raw, err := CompanyDSNAt(databaseName, urlEnvVar, os.Getenv)
	if err != nil {
		return nil, err
	}
	dsn, viaPgBouncer, err := db.Bersih(raw)
	if err != nil {
		return nil, fmt.Errorf("DSN buku %s: %w", databaseName, err)
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("DSN buku %s tidak bisa diurai: %w", databaseName, err)
	}
	cfg.MaxConns = 1
	if viaPgBouncer {
		// Alasan yang sama dengan `db.Kendali`: prepared statement tidak
		// bertahan antar-koneksi server di PgBouncer mode transaction.
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("buka buku %s: %w", databaseName, err)
	}
	return &Reader{pool: pool, databaseName: databaseName}, nil
}

// Close menutup kolamnya.
func (r *Reader) Close() { r.pool.Close() }

// DatabaseName adalah buku yang dibaca Reader ini.
func (r *Reader) DatabaseName() string { return r.databaseName }

// ReadOnly: `readOnly` untuk pembaca di luar paket ini — sapuan kesesuaian
// data (`internal/conformance`) yang SQL-nya bukan laporan. Pintunya tetap
// satu: setiap pembacaan buku dari pohon Go berjalan di transaksi READ ONLY,
// jadi kueri yang suatu hari lolos dari penjaga teks tetap ditolak PostgreSQL.
func (r *Reader) ReadOnly(ctx context.Context, fn func(pgx.Tx) error) error {
	return r.readOnly(ctx, fn)
}

// readOnly menjalankan fn di dalam transaksi READ ONLY + REPEATABLE READ, dan
// SELALU menggulungnya balik — tidak ada yang perlu di-commit dari pembacaan.
func (r *Reader) readOnly(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return fmt.Errorf("mulai transaksi baca %s: %w", r.databaseName, err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	return fn(tx)
}
