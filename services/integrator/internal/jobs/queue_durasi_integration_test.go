package jobs

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// TestDurasiPekerjaanGoTerukur membuktikan bahwa antrean Go menulis cap waktu
// yang membuat durasinya TERUKUR (09 §11): `started_at` disetel klaim, TIDAK
// disentuh perpanjangan lease maupun laporan kemajuan, `finished_at` disetel
// selesai — sehingga `finished_at - started_at` adalah lama pekerjaan, sedang
// `finished_at - claimed_at` hanya jarak dari perpanjangan terakhir. Percobaan
// ulang mendapat `started_at` BARU (durasi satu percobaan, bukan sejak
// percobaan pertama).
//
// Sampai 0.23.0 klaim Go hanya menyetel `claimed_at`; setiap pekerjaan Go
// karenanya dibuang histogram (`started_at IS NULL`). Tes ini gagal pada SQL
// itu.
//
// Dilewati tanpa JOBS_TZ_TEST_PG_URL — PostgreSQL SEKALI PAKAI (tes ini membuat
// dan menghapus basis data `uji_jam_<n>`), sama dengan TestJamAntrean...:
//
//	docker run --rm -d --name uji-jam-antrean -e POSTGRES_PASSWORD=uji -p 127.0.0.1:55441:5432 postgres:17-alpine
//	JOBS_TZ_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55441/postgres \
//	  go test ./internal/jobs -run DurasiPekerjaanGo -count=1 -v
//	docker stop uji-jam-antrean
func TestDurasiPekerjaanGoTerukur(t *testing.T) {
	url := os.Getenv("JOBS_TZ_TEST_PG_URL")
	if url == "" {
		t.Skip("JOBS_TZ_TEST_PG_URL tidak diset — uji integrasi dilewati")
	}
	ctx, batal := context.WithTimeout(context.Background(), time.Minute)
	defer batal()

	nama := siapkanBasisData(ctx, t, url, "Asia/Jakarta")
	pool := buatKolam(ctx, t, url, nama, pgx.QueryExecModeExec)
	defer pool.Close()
	q := New(pool)
	kinds := []contract.JobKind{contract.KindReportExportGo}
	const aku = "pekerja-go"

	terbit := func(kunci string) {
		t.Helper()
		if _, _, err := q.Publish(ctx, Publication{
			Kind: contract.KindReportExportGo, Payload: []byte(`{}`), DedupeKey: kunci,
		}); err != nil {
			t.Fatal(err)
		}
	}
	type cap struct {
		mulai, klaim, selesai *time.Time
	}
	baca := func(id int64) cap {
		t.Helper()
		var c cap
		if err := pool.QueryRow(ctx,
			`SELECT started_at, claimed_at, finished_at FROM jobs WHERE id = $1`, id,
		).Scan(&c.mulai, &c.klaim, &c.selesai); err != nil {
			t.Fatal(err)
		}
		return c
	}

	// ── Satu percobaan: klaim → lease → kemajuan → selesai ────────────────
	terbit("uji-durasi:1")
	job, err := q.Claim(ctx, contract.LaneInteractive, kinds, aku)
	if err != nil {
		t.Fatal(err)
	}
	setelahKlaim := baca(job.ID)
	if setelahKlaim.mulai == nil {
		t.Fatal("klaim Go tidak menyetel started_at — durasi pekerjaan Go tak terukur")
	}
	if !setelahKlaim.mulai.Equal(*setelahKlaim.klaim) {
		t.Errorf("started_at (%v) ≠ claimed_at (%v) saat klaim", setelahKlaim.mulai, setelahKlaim.klaim)
	}

	time.Sleep(400 * time.Millisecond)
	if ok, err := q.RenewLease(ctx, job.ID, aku); err != nil || !ok {
		t.Fatalf("RenewLease: ok=%v err=%v", ok, err)
	}
	time.Sleep(100 * time.Millisecond)
	if ok, err := q.ReportProgress(ctx, job.ID, aku, 50); err != nil || !ok {
		t.Fatalf("ReportProgress: ok=%v err=%v", ok, err)
	}
	if c := baca(job.ID); !c.mulai.Equal(*setelahKlaim.mulai) {
		t.Errorf("perpanjangan lease/kemajuan menggeser started_at: %v → %v", setelahKlaim.mulai, c.mulai)
	}
	time.Sleep(100 * time.Millisecond)
	if ok, err := q.Complete(ctx, job.ID, aku, nil); err != nil || !ok {
		t.Fatalf("Complete: ok=%v err=%v", ok, err)
	}

	akhir := baca(job.ID)
	if akhir.selesai == nil {
		t.Fatal("Complete tidak menyetel finished_at")
	}
	if d := akhir.selesai.Sub(*akhir.mulai); d < 550*time.Millisecond || d > 10*time.Second {
		t.Errorf("finished_at − started_at = %v, harap ≈ 600ms", d)
	}
	if d := akhir.selesai.Sub(*akhir.klaim); d >= 450*time.Millisecond {
		t.Errorf("finished_at − claimed_at = %v — mestinya hanya jarak dari perpanjangan terakhir", d)
	}

	// ── Percobaan ulang: started_at BARU ──────────────────────────────────
	terbit("uji-durasi:2")
	job2, err := q.Claim(ctx, contract.LaneInteractive, kinds, aku)
	if err != nil {
		t.Fatal(err)
	}
	pertama := baca(job2.ID)
	if _, err := q.Fail(ctx, job2.ID, aku, "uji", func() float64 { return 0.5 }); err != nil {
		t.Fatal(err)
	}
	// Lewati backoff: yang diuji cap waktu klaim ulang, bukan jadwalnya.
	if _, err := pool.Exec(ctx, `UPDATE jobs SET run_after = now() WHERE id = $1`, job2.ID); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	ulang, err := q.Claim(ctx, contract.LaneInteractive, kinds, aku)
	if err != nil {
		t.Fatal(err)
	}
	if ulang.ID != job2.ID {
		t.Fatalf("klaim ulang mengambil %d, harap %d", ulang.ID, job2.ID)
	}
	if kedua := baca(job2.ID); !kedua.mulai.After(*pertama.mulai) {
		t.Errorf("percobaan ulang tidak mendapat started_at baru: %v lalu %v", pertama.mulai, kedua.mulai)
	}
}
