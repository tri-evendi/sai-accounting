package backup

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
)

// BukaInstansDariLingkungan memulangkan pembuka instans yang mengambil URL
// tiap instans dari env var yang NAMANYA tercatat di `db_instances`
// (`db.SambunganInstans` memeriksa bentuknya), membaca `pg_database` server
// itu, dan menyiapkan `Perkakas` yang menyambung ke sana.
//
// `dasar` menyumbang jalur biner `pg_dump`/`pg_dumpall` saja; host, port,
// peran, dan sandinya SELALU dari instans itu sendiri. Tidak ada jalur di
// fungsi ini yang bisa berakhir di server bawaan.
func BukaInstansDariLingkungan(dasar Perkakas, getenv func(string) string) PembukaInstans {
	return func(ctx context.Context, ins Instans) (*ServerInstans, error) {
		s, dsn, err := db.SambunganInstans(ins.Kunci, ins.EnvVar, getenv)
		if err != nil {
			return nil, err
		}
		// Batas waktu sambungan: instans yang mati tidak boleh menahan
		// cadangan instans lain sampai lease pekerjaannya habis.
		cfg, err := pgx.ParseConfig(dsn)
		if err != nil {
			return nil, fmt.Errorf("%s tidak bisa diurai: %w", ins.EnvVar, err)
		}
		if cfg.ConnectTimeout == 0 {
			cfg.ConnectTimeout = 15 * time.Second
		}
		conn, err := pgx.ConnectConfig(ctx, cfg)
		if err != nil {
			return nil, fmt.Errorf("sambung ke instans %s (%s:%d): %w", ins.Kunci, s.Host, s.Port, err)
		}
		defer func() { _ = conn.Close(ctx) }()

		if err := PeriksaHakCadangan(ctx, conn, ins.Kunci, s.User); err != nil {
			return nil, err
		}

		basis, err := BasisDiServer(ctx, conn)
		if err != nil {
			return nil, fmt.Errorf("instans %s: %w", ins.Kunci, err)
		}
		var teks string
		if err := conn.QueryRow(ctx, `SHOW server_version`).Scan(&teks); err != nil {
			return nil, fmt.Errorf("instans %s: baca versi server: %w", ins.Kunci, err)
		}
		versi, err := VersiServer(teks)
		if err != nil {
			return nil, fmt.Errorf("instans %s: %w", ins.Kunci, err)
		}
		return &ServerInstans{
			Basis:       basis,
			VersiServer: versi,
			Pendump: Perkakas{
				PgDump:    dasar.PgDump,
				PgDumpall: dasar.PgDumpall,
				Host:      s.Host,
				Port:      s.Port,
				User:      s.User,
				Sandi:     s.Sandi,
				SSLMode:   s.SSLMode,
			},
		}, nil
	}
}

// ══ HAK PERAN DI INSTANS TAMBAHAN ═════════════════════════════════════════
//
// Instans tambahan dicadangkan dengan peran di template URL-nya sendiri
// (konvensi `@sai/db/company-url`: template instans tambahan sekaligus
// penyedianya). Peran itu biasanya PEMILIK buku di sana, jadi `pg_dump` tiap
// buku lolos — tetapi `pg_dumpall --globals-only` membaca `pg_authid`, dan
// pemilik NOSUPERUSER ditolak:
//
//	pg_dumpall: error: query failed: ERROR:  permission denied for table pg_authid
//
// Terukur 23 Okt 2026 terhadap postgres:17. Tanpa pemeriksaan ini galat itu
// baru muncul SESUDAH setiap buku instans itu didump, setiap malam. Jadi
// diperiksa di depan, dengan kalimat yang menyebut perbaikannya — sama dengan
// yang dipegang `sai_backup` di instans bawaan (`scripts/postgres-roles.py`).

// kueriHakCadangan: superuser, ATAU mewarisi `pg_read_all_data` (PostgreSQL
// ≥ 14). `pg_has_role(…, 'USAGE')` = hak yang benar-benar terwarisi, bukan
// sekadar keanggotaan NOINHERIT. Peran `pg_read_all_data` dicari lewat
// `pg_roles`, bukan disebut sebagai teks di `pg_has_role`, supaya server < 14
// menjawab "tidak" alih-alih galat "role does not exist".
const kueriHakCadangan = `
	SELECT r.rolsuper OR EXISTS (
	         SELECT 1 FROM pg_roles g
	          WHERE g.rolname = 'pg_read_all_data'
	            AND pg_has_role(r.oid, g.oid, 'USAGE'))
	  FROM pg_roles r
	 WHERE r.rolname = current_user`

// PenanyaBaris memenuhi `*pgx.Conn` maupun `*pgxpool.Pool`.
type PenanyaBaris interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PeriksaHakCadangan menolak peran instans yang tidak bisa mendump peran &
// hak akses servernya. Galatnya menjadi `InstansGagal` instans itu saja.
func PeriksaHakCadangan(ctx context.Context, q PenanyaBaris, kunci, peran string) error {
	var cukup bool
	if err := q.QueryRow(ctx, kueriHakCadangan).Scan(&cukup); err != nil {
		return fmt.Errorf("instans %s: periksa hak peran %s: %w", kunci, peran, err)
	}
	if !cukup {
		return fmt.Errorf(
			"instans %s: peran %q bukan superuser dan tidak mewarisi pg_read_all_data — "+
				"pg_dumpall --globals-only akan ditolak (permission denied for table pg_authid). "+
				"Di server instans itu: GRANT pg_read_all_data TO %q; "+
				"(docs/MULTI-COMPANY.md §6, \"Peran cadangan per instans\")",
			kunci, peran, peran)
	}
	return nil
}
