package jobs

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/trail"
)

// TestJamAntreanTakBergantungZona membuktikan bahwa upkeep, backoff, dan jejak
// cadangan menghasilkan HAL YANG SAMA di setiap kombinasi:
//
//	TZ proses  (time.Local)   × UTC · America/New_York · Asia/Jakarta
//	zona sesi  (ALTER DATABASE … SET timezone) × ketiga zona yang sama
//	mode pgx   × bawaan (koneksi langsung) · `exec` (PgBouncer)
//
// Sebelum perbaikan ini, `ReclaimStale`/`ArchiveDone`/`Fail` mengikat
// `time.Time` ke kolom TIMESTAMP tanpa zona: mode bawaan mengirim jam dinding
// PROSES, mode `exec` mengirim `timestamptz` yang dikonversi zona SESI. Kotak
// ber-TZ CST yang menjalankan upkeep terhadap server WIB memulangkan lease yang
// masih hidup (atau tidak pernah memulangkan yang mati), tanpa galat.
//
// Baris "milik Node" ditanam dengan `now()` di SQL — persis cara
// `packages/platform/src/job-queue.ts` menulis `claimed_at`/`finished_at`.
//
// Dilewati tanpa JOBS_TZ_TEST_PG_URL (URL superuser, basis data apa saja).
// JANGAN arahkan ke produksi: tes ini membuat dan menghapus basis data
// `uji_jam_<n>`. Cara menjalankannya:
//
//	docker run --rm -d --name uji-jam-antrean -e POSTGRES_PASSWORD=uji -p 55441:5432 postgres:17-alpine
//	for tz in UTC America/New_York Asia/Jakarta; do
//	  TZ=$tz JOBS_TZ_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55441/postgres \
//	    go test ./internal/jobs -run JamAntrean -count=1 -v
//	done
//	docker stop uji-jam-antrean
func TestJamAntreanTakBergantungZona(t *testing.T) {
	url := os.Getenv("JOBS_TZ_TEST_PG_URL")
	if url == "" {
		t.Skip("JOBS_TZ_TEST_PG_URL tidak diset — uji integrasi dilewati")
	}
	ctx, batal := context.WithTimeout(context.Background(), 3*time.Minute)
	defer batal()

	zona := []string{"UTC", "America/New_York", "Asia/Jakarta"}
	mode := map[string]pgx.QueryExecMode{
		"bawaan": pgx.QueryExecModeCacheStatement,
		"exec":   pgx.QueryExecModeExec,
	}

	asli := time.Local
	defer func() { time.Local = asli }()

	var acuan, acuanDari string
	for _, sesi := range zona {
		nama := siapkanBasisData(ctx, t, url, sesi)
		for namaMode, m := range mode {
			for _, proses := range zona {
				loc, err := time.LoadLocation(proses)
				if err != nil {
					t.Fatal(err)
				}
				time.Local = loc
				label := fmt.Sprintf("sesi=%s mode=%s proses=%s", sesi, namaMode, proses)

				hasil := skenario(ctx, t, url, nama, m, label)
				time.Local = asli

				if acuan == "" {
					acuan, acuanDari = hasil, label
					t.Logf("acuan (%s): %s", label, hasil)
					continue
				}
				if hasil != acuan {
					t.Errorf("%s:\n  dapat %s\n  acuan %s (%s)", label, hasil, acuan, acuanDari)
				}
			}
		}
	}
	// Acuannya sendiri harus BENAR, bukan sekadar sama di semua kombinasi.
	want := "lease-hidup=tetap lease-basi=dipulangkan klaim-go=tetap reclaim=1 " +
		"archive=1 done-baru=tetap backoff=ok klaim-sebelum-backoff=tidak " +
		"backup=2026-10-23 17:00:00|2026-10-23 17:05:30.25 dibuat=utc"
	if acuan != want {
		t.Errorf("acuan salah:\n  dapat %s\n  harap %s", acuan, want)
	}
}

// siapkanBasisData membuat satu basis data ber-zona-sesi `sesi` dengan tabel
// `jobs` dan `backup_runs` dari migration kendali yang SAMA dengan produksi.
func siapkanBasisData(ctx context.Context, t *testing.T, url, sesi string) string {
	t.Helper()
	admin, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(context.Background())
	nama := fmt.Sprintf("uji_jam_%d", time.Now().UnixNano())
	ident := pgx.Identifier{nama}.Sanitize()
	if _, err := admin.Exec(ctx, `CREATE DATABASE `+ident); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		c, err := pgx.Connect(context.Background(), url)
		if err != nil {
			return
		}
		defer c.Close(context.Background())
		_, _ = c.Exec(context.Background(), `DROP DATABASE IF EXISTS `+ident+` WITH (FORCE)`)
	})
	// Zona bawaan basis data = zona sesi setiap koneksi yang tidak
	// menyetelnya — pgx maupun node-pg. Itu peran `TZ` di container `pg`.
	if _, err := admin.Exec(ctx, `ALTER DATABASE `+ident+` SET timezone = '`+sesi+`'`); err != nil {
		t.Fatal(err)
	}

	pool := buatKolam(ctx, t, url, nama, pgx.QueryExecModeCacheStatement)
	defer pool.Close()
	akar := filepath.Join("..", "..", "..", "..", "prisma", "postgresql", "control")
	for _, m := range []string{"0005_jejak_putaran", "0006_jobs", "0007_jobs_started_at"} {
		sql, err := os.ReadFile(filepath.Join(akar, m, "migration.sql"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("%s: %v", m, err)
		}
	}
	return nama
}

func buatKolam(ctx context.Context, t *testing.T, url, nama string, m pgx.QueryExecMode) *pgxpool.Pool {
	t.Helper()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.Database = nama
	cfg.ConnConfig.DefaultQueryExecMode = m
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	return pool
}

// skenario menjalankan satu putaran lengkap dan meringkas hasilnya sebagai
// teks — teks yang WAJIB identik di setiap kombinasi zona dan mode.
func skenario(ctx context.Context, t *testing.T, url, nama string, m pgx.QueryExecMode, label string) string {
	t.Helper()
	pool := buatKolam(ctx, t, url, nama, m)
	defer pool.Close()
	gagal := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("%s: %v", label, err)
		}
	}
	_, err := pool.Exec(ctx, `TRUNCATE jobs, backup_runs RESTART IDENTITY`)
	gagal(err)

	kind := string(contract.KindReportExportGo)
	mikro := func(d time.Duration) int64 { return d.Microseconds() }

	// ── Baris "milik Node": jam `now()` di SQL, seperti job-queue.ts ──────
	tanam := func(status string, kolom string, mundur time.Duration) int64 {
		t.Helper()
		var id int64
		// `kolom` hanya salah satu dari dua nama tulisan tangan di bawah.
		sql := `INSERT INTO jobs (kind, payload, status, claimed_by, updated_at, claimed_at, finished_at)
		        VALUES ($1, '{}'::jsonb, $2, 'pekerja-node', now(),
		                CASE WHEN $3 = 'claimed_at' THEN now() - $4::bigint * interval '1 microsecond' END,
		                CASE WHEN $3 = 'finished_at' THEN now() - $4::bigint * interval '1 microsecond' END)
		        RETURNING id`
		gagal(pool.QueryRow(ctx, sql, kind, status, kolom, mikro(mundur)).Scan(&id))
		return id
	}
	hidup := tanam("claimed", "claimed_at", contract.LeaseStale-10*time.Second)
	basi := tanam("claimed", "claimed_at", contract.LeaseStale+10*time.Second)
	retensi := time.Duration(contract.DoneRetentionDays) * 24 * time.Hour
	doneBaru := tanam("done", "finished_at", retensi-time.Hour)
	doneLama := tanam("done", "finished_at", retensi+time.Hour)

	// ── Baris milik Go: terbit (DEFAULT run_after) lalu diklaim ──────────
	q := New(pool)
	_, baru, err := q.Publish(ctx, Publication{
		Kind: contract.KindReportExportGo, Payload: []byte(`{}`), DedupeKey: "uji-jam:" + label,
	})
	gagal(err)
	if !baru {
		t.Fatalf("%s: terbitan pertama dianggap ulangan", label)
	}
	job, err := q.Claim(ctx, contract.LaneInteractive, []contract.JobKind{contract.KindReportExportGo}, "pekerja-go")
	gagal(err)

	// ── Upkeep ───────────────────────────────────────────────────────────
	nReclaim, err := q.ReclaimStale(ctx, contract.LeaseStale)
	gagal(err)
	nArchive, err := q.ArchiveDone(ctx, contract.DoneRetentionDays)
	gagal(err)

	status := func(id int64) string {
		var s string
		if err := pool.QueryRow(ctx, `SELECT status FROM jobs WHERE id = $1`, id).Scan(&s); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return "hilang"
			}
			gagal(err)
		}
		return s
	}
	ringkas := func(id int64, harap, ya, tidak string) string {
		if status(id) == harap {
			return ya
		}
		return tidak + "(" + status(id) + ")"
	}
	r := fmt.Sprintf("lease-hidup=%s lease-basi=%s klaim-go=%s reclaim=%d archive=%d done-baru=%s",
		ringkas(hidup, "claimed", "tetap", "DIPULANGKAN"),
		ringkas(basi, "queued", "dipulangkan", "TETAP"),
		ringkas(job.ID, "claimed", "tetap", "DIPULANGKAN"),
		nReclaim, nArchive,
		ringkas(doneBaru, "done", "tetap", "DIBUANG"))
	if status(doneLama) != "hilang" {
		r += " done-lama=TETAP"
	}

	// ── Fail: run_after = sekarang + backoff, di jam yang sama dengan klaim ──
	acak := func() float64 { return 0.5 }
	hg, err := q.Fail(ctx, job.ID, "pekerja-go", "uji", acak)
	gagal(err)
	if hg == nil || hg.Status != contract.StatusQueued {
		t.Fatalf("%s: Fail memulangkan %+v", label, hg)
	}
	var selisih float64
	gagal(pool.QueryRow(ctx,
		`SELECT EXTRACT(EPOCH FROM (run_after - LOCALTIMESTAMP))::float8 FROM jobs WHERE id = $1`,
		job.ID).Scan(&selisih))
	harap := Backoff(1, acak).Seconds()
	if math.Abs(selisih-harap) < 5 {
		r += " backoff=ok"
	} else {
		r += fmt.Sprintf(" backoff=MELESET(%.0fs, harap %.0fs)", selisih, harap)
	}
	// Klaim sampai habis: baris "lease-basi" yang baru dipulangkan memang
	// boleh diambil; yang tidak boleh adalah baris yang sedang menunggu backoff.
	terambil := false
	for i := 0; i < 10; i++ {
		j, err := q.Claim(ctx, contract.LaneInteractive, []contract.JobKind{contract.KindReportExportGo}, "pekerja-go")
		if errors.Is(err, ErrNoJob) {
			break
		}
		gagal(err)
		if j.ID == job.ID {
			terambil = true
		}
	}
	if terambil {
		r += " klaim-sebelum-backoff=YA"
	} else {
		r += " klaim-sebelum-backoff=tidak"
	}

	// ── backup_runs: UTC, konvensi Prisma ────────────────────────────────
	// Instannya dikirim dalam zona LOKAL proses dengan sengaja.
	mulai := time.Date(2026, 10, 23, 17, 0, 0, 0, time.UTC).In(time.Local)
	selesai := mulai.Add(5*time.Minute + 30*time.Second + 250*time.Millisecond)
	gagal(trail.RekamCadangan(ctx, pool, trail.PutaranCadangan{
		MulaiPada: mulai, SelesaiPada: selesai, Status: "ok",
	}))
	var teksMulai, teksSelesai string
	var dibuatUTC bool
	gagal(pool.QueryRow(ctx, `
		SELECT started_at::text, finished_at::text,
		       abs(EXTRACT(EPOCH FROM (created_at - (now() AT TIME ZONE 'UTC')))) < 60
		  FROM backup_runs`).Scan(&teksMulai, &teksSelesai, &dibuatUTC))
	r += " backup=" + teksMulai + "|" + teksSelesai
	if dibuatUTC {
		r += " dibuat=utc"
	} else {
		r += " dibuat=BUKAN-UTC"
	}
	return r
}
