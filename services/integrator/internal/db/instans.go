package db

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"

	"github.com/jackc/pgx/v5"
)

// ══ INSTANS BASIS DATA TAMBAHAN (tahap 4, docs/MULTI-COMPANY.md §6) ═══════
//
// Cermin Go dari `packages/db/src/company-url.ts`. Aturannya sama, dan
// ditulis ulang di sini hanya karena dua bahasa tidak bisa berbagi satu
// fungsi:
//
//  1. Baris `db_instances` hanya menyebut NAMA env var. URL dan sandinya dari
//     environment proses, tidak pernah dari basis data.
//  2. Nama env var di luar bentuk `COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE`
//     DITOLAK — tanpa itu satu baris registry bisa menunjuk
//     `CONTROL_DATABASE_URL`, dan "instans db2" diam-diam menjadi server
//     bawaan.
//  3. Instans yang tak terselesaikan MELEMPAR. Tidak pernah jatuh ke server
//     bawaan: di sana mungkin masih ada salinan lama buku PT yang sudah
//     dipindah, dan cadangan atas salinan itu terbaca lengkap padahal bukan.

// PolaKunciInstans sama dengan `DB_INSTANCE_KEY_PATTERN` (CHECK migration 0009).
var PolaKunciInstans = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

// PolaEnvInstans sama dengan `DB_INSTANCE_URL_ENV_PATTERN`.
var PolaEnvInstans = regexp.MustCompile(`^COMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE$`)

// KunciInstansBawaan dicadangkan untuk instans bawaan, yang tidak punya baris.
const KunciInstansBawaan = "default"

// SambunganInstans menguraikan template URL sebuah instans tambahan menjadi
// parameter untuk `pg_dump` DAN DSN pgx untuk membaca `pg_database`.
//
// `getenv` disuntik supaya bisa diuji tanpa mengubah environment proses.
// Nama basis data di URL template TIDAK dipakai — sama seperti di sisi Node,
// pathname-nya diganti; di sini dengan `postgres`, basis data pemeliharaan
// yang ada di setiap server. Parameter libpq lain (`sslmode`) dipertahankan.
//
// URL yang menyatakan dirinya lewat PgBouncer (`pgbouncer=true`) DITOLAK:
// pencacahan lewat pooler memulangkan sebagian basis data, dan cadangan
// sebagian adalah bentuk yang paling berbahaya — ia ada, ia tampak berhasil.
func SambunganInstans(kunci, namaEnv string, getenv func(string) string) (Sambungan, string, error) {
	if !PolaKunciInstans.MatchString(kunci) || kunci == KunciInstansBawaan {
		return Sambungan{}, "", fmt.Errorf("kunci instans tidak sah: %q", kunci)
	}
	if !PolaEnvInstans.MatchString(namaEnv) {
		return Sambungan{}, "", fmt.Errorf(
			"instans %q menunjuk env var %q — bentuk yang sah hanya "+
				"COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE", kunci, namaEnv)
	}
	raw := getenv(namaEnv)
	if raw == "" {
		return Sambungan{}, "", errors.New(
			"instans " + kunci + " terdaftar, tetapi " + namaEnv + " tidak diset di " +
				"environment svc-integrator. Buku PT di instans itu TIDAK dicadangkan dari " +
				"server bawaan sebagai gantinya — konteks yang hilang MELEMPAR")
	}
	dsn, lewatPgBouncer, err := Bersih(raw)
	if err != nil {
		return Sambungan{}, "", fmt.Errorf("%s: %w", namaEnv, err)
	}
	if lewatPgBouncer {
		return Sambungan{}, "", fmt.Errorf(
			"%s menyatakan pgbouncer=true — cadangan wajib LANGSUNG ke PostgreSQL, "+
				"sebab pencacahan lewat pooler memulangkan sebagian basis data", namaEnv)
	}
	u, err := url.Parse(dsn)
	if err != nil {
		return Sambungan{}, "", fmt.Errorf("%s tidak bisa diurai: %w", namaEnv, err)
	}
	u.Path = "/" + basisPemeliharaan
	u.RawPath = ""
	dsn = u.String()
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return Sambungan{}, "", fmt.Errorf("%s tidak bisa diurai: %w", namaEnv, err)
	}
	return Sambungan{
		Host:     cfg.Host,
		Port:     int(cfg.Port),
		User:     cfg.User,
		Sandi:    cfg.Password,
		Database: basisPemeliharaan,
		SSLMode:  u.Query().Get("sslmode"),
	}, dsn, nil
}

// basisPemeliharaan ada di setiap server PostgreSQL; dari sanalah
// `pg_database` dibaca.
const basisPemeliharaan = "postgres"
