// Package tenantlane: pelari jalur `tenant` — cadangan per basis data
// (rancangan §3.2, §6).
//
// Dijalankan `cmd/integrator` (service `svc-integrator`, bersama jalur
// `interactive` sisi Go di proses yang sama) dan `cmd/tenant` saat
// mengembangkan.
//
// ══ RAHASIA CADANGAN — DAN DI MANA IA SEKARANG HIDUP ══════════════════════
// `BACKUP_ENCRYPTION_KEY` dan kredensial S3 dibaca DI SINI. Sampai 22 Okt 2026
// jalur ini punya container sendiri justru supaya rahasia itu tidak berbagi
// proses dengan jalur yang memproses masukan pengguna. Keputusan pemilik
// "1 image = 1 container" mengakhirinya: kini ia seproses dengan
// `interactivelane`. Risiko yang diterima dan syarat memisahkannya lagi:
// docs/arsitektur/09-RANCANGAN-LAYANAN.md §3.2.
//
// ══ JALUR INI TIDAK MENGKLAIM `tenant.conformance`, DAN ITU DISENGAJA ══════
// Kontrak menaruh `tenant.backup` dan `tenant.conformance` di satu jalur, dan
// keadaan akhirnya memang satu proses. Tapi dua dari sebelas pemeriksaan
// kesesuaian data MENGHITUNG angka akuntansi — pagar materialitas (#444/#445)
// membandingkan tiap akun beban dengan TOTAL seluruh akun, dan memakai daftar
// nama penampung. §3.3 menahan Go di depan garis itu sampai ada pemicu
// TERUKUR, dan memindahkannya sekarang berarti melakukan di tahap 1b apa yang
// §9 cadangkan untuk 1d.
//
// Jadi `tenant.conformance` tetap TypeScript (`scripts/check-data-conformance.ts`,
// peran `conformance` di `svc-worker`), dan pelari ini mengklaim HANYA `kind`
// yang punya handler di sini. Yang menjaga supaya itu bukan lubang:
// `tests/kind-punya-pengklaim.test.ts` menolak `kind` yang DITERBITKAN tanpa
// pengklaim — dan `tenant.conformance` tidak diterbitkan siapa pun.
//
// ══ SAMBUNGAN: LANGSUNG KE `pg`, BUKAN `CONTROL_DATABASE_URL` ══════════════
// Jalur ini mencacah `pg_database`, memegang pagar advisory lock, dan
// menyerahkan parameter sambungannya ke `pg_dump` — ketiganya lewat
// `CONTROL_DATABASE_DIRECT_URL` (`db.KendaliLangsung`). `CONTROL_DATABASE_URL`
// di proses yang sama milik jalur `interactive` dan menunjuk PgBouncer.
package tenantlane

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/backup"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/trail"
)

// Run menguras jalur `tenant` sampai SIGTERM/SIGINT atau sampai `stop`
// selesai (boleh nil). Pulang nil tanpa bekerja bila instans lain memegang
// pagarnya — pemanggil yang memutuskan apakah itu berarti berhenti.
func Run(ctx, stop context.Context) error {
	// Dua koneksi: satu untuk pelari, satu untuk pagar advisory lock yang
	// dipegang selama proses hidup. Jalur ini tunggal-instans.
	kolam, err := db.KendaliLangsung(ctx, 2)
	if err != nil {
		return err
	}
	defer kolam.Close()

	pelari := &jobs.Runner{
		Lane:  contract.LaneTenant,
		Queue: jobs.New(kolam),
		Handlers: map[contract.JobKind]jobs.Handler{
			contract.KindTenantBackup: handlerCadangan(kolam),
		},
		Stop: stop,
	}
	return pelari.Run(ctx)
}

// handlerCadangan menjalankan satu putaran cadangan penuh.
//
// Muatan pekerjaannya TIDAK dibaca, dan itu disengaja: daftar basis data yang
// dibekukan saat pekerjaan DITERBITKAN akan melewatkan PT yang didaftarkan
// antara penerbitan dan pelaksanaan — dan putaran berikutnya tidak akan tahu
// bahwa yang kemarin tidak lengkap. Pencacahan terjadi saat PELAKSANAAN.
func handlerCadangan(kolam *pgxpool.Pool) jobs.Handler {
	return func(c jobs.Ctx) (*string, error) {
		mulai := time.Now().UTC()

		hasil, err := satuPutaran(c, kolam, mulai)
		if err != nil && hasil != nil {
			// Putaran SEBAGIAN (tahap 4): satu instans tambahan gagal, instans
			// lain terkirim. Jejaknya `error` — permukaan kesehatan dan
			// `watch:health` wajib berbunyi — tapi tetap menyebut putaran dan
			// ukurannya, sebab objek yang terkirim itu nyata dan bisa dipulihkan.
			sebab := err.Error()
			putaran := hasil.Manifest.Putaran
			ukuran := hasil.TotalByte
			rekam(c.Ctx, kolam, trail.PutaranCadangan{
				MulaiPada: mulai, SelesaiPada: time.Now().UTC(),
				Status: hasil.Status, Galat: &sebab, Artifact: &putaran, SizeBytes: &ukuran,
			})
			return nil, err
		}
		if err != nil {
			// Jejaknya ditulis untuk KEGAGALAN juga, dan itu bagian yang paling
			// mudah terlupa: tanpa baris `error`, sebuah putaran yang gagal
			// terbaca sama dengan putaran yang tidak pernah dijadwalkan.
			sebab := err.Error()
			rekam(c.Ctx, kolam, trail.PutaranCadangan{
				MulaiPada: mulai, SelesaiPada: time.Now().UTC(),
				Status: "error", Galat: &sebab,
			})
			return nil, err
		}

		putaran := hasil.Manifest.Putaran
		ukuran := hasil.TotalByte
		rekam(c.Ctx, kolam, trail.PutaranCadangan{
			MulaiPada: mulai, SelesaiPada: time.Now().UTC(),
			Status: hasil.Status, Artifact: &putaran, SizeBytes: &ukuran,
		})

		log.Printf("[tenant] putaran %s selesai: %d objek, %d byte, status %s",
			putaran, len(hasil.Manifest.Objek), ukuran, hasil.Status)

		// `result_ref` adalah KUNCI objek, bukan tautan: yang dipulangkan jalur
		// ke manifest putaran ini, dan memegangnya bukan izin untuk membacanya.
		ref := putaran + "/" + backup.NamaManifest
		return &ref, nil
	}
}

func satuPutaran(c jobs.Ctx, kolam *pgxpool.Pool, mulai time.Time) (*backup.Hasil, error) {
	sambungan, err := db.SambunganKendaliLangsung()
	if err != nil {
		return nil, err
	}

	perkakas := backup.Perkakas{
		PgDump:    envAtau("PG_DUMP_BIN", "pg_dump"),
		PgDumpall: envAtau("PG_DUMPALL_BIN", "pg_dumpall"),
		Host:      sambungan.Host,
		Port:      sambungan.Port,
		User:      sambungan.User,
		Sandi:     sambungan.Sandi,
		SSLMode:   sambungan.SSLMode,
	}

	versiKlien, err := perkakas.VersiKlien(c.Ctx)
	if err != nil {
		return nil, err
	}

	var teksServer string
	if err := kolam.QueryRow(c.Ctx, `SHOW server_version`).Scan(&teksServer); err != nil {
		return nil, fmt.Errorf("baca versi server: %w", err)
	}
	versiServer, err := backup.VersiServer(teksServer)
	if err != nil {
		return nil, err
	}

	// Instans tambahan (tahap 4): URL-nya dari env var yang NAMANYA tercatat di
	// `db_instances` — svc-integrator wajib menerima env var itu, sama seperti
	// setiap layanan lain yang membuka buku (docs/MULTI-COMPANY.md §6).
	cacah, err := backup.Daftar(c.Ctx, kolam, sambungan.Database,
		backup.BukaInstansDariLingkungan(perkakas, os.Getenv))
	if err != nil {
		return nil, err
	}

	tujuan, err := backup.TujuanDariLingkungan(c.Ctx)
	if err != nil {
		return nil, err
	}

	return backup.Jalankan(c.Ctx, backup.Opsi{
		Prefix:      envAtau("BACKUP_PREFIX", "sai"),
		Kunci:       os.Getenv("BACKUP_ENCRYPTION_KEY"),
		Perkakas:    perkakas,
		Tujuan:      tujuan,
		Cacah:       cacah,
		NamaKendali: sambungan.Database,
		VersiServer: versiServer,
		VersiKlien:  versiKlien,
		RetensiHari: angkaEnv("BACKUP_RETENTION_DAYS", 30),
		DirKerja:    envAtau("BACKUP_WORK_DIR", "/tmp/backup"),
		DirData:     envAtau("BACKUP_DATA_DIR", "/app/data"),
		Saat:        mulai,
		Catat:       func(pesan string) { log.Printf("[tenant] %s", pesan) },
		Kemajuan:    c.Progress,
	})
}

// rekam MENELAN galatnya, dengan sengaja — lihat `trail.RekamCadangan`.
func rekam(ctx context.Context, kolam *pgxpool.Pool, p trail.PutaranCadangan) {
	if err := trail.RekamCadangan(ctx, kolam, p); err != nil {
		log.Printf("[tenant] ⚠ putaran tidak tercatat (cadangannya TIDAK terpengaruh): %v", err)
	}
}

func angkaEnv(nama string, bawaan int) int {
	if v := os.Getenv(nama); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
		log.Printf("[tenant] %s=%q bukan bilangan — memakai %d", nama, v, bawaan)
	}
	return bawaan
}

func envAtau(nama, bawaan string) string {
	if v := os.Getenv(nama); v != "" {
		return v
	}
	return bawaan
}
