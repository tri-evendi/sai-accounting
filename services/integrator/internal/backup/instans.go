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
