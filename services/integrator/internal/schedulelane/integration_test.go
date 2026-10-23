package schedulelane

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

// TestPenerbitTerhadapPostgreSQLSungguhan menjalankan penerbit jalur
// `schedule` terhadap PostgreSQL sekali pakai bila SCHEDULE_TEST_PG_URL diset
// (URL superuser, basis data apa saja). Tanpanya ia DILEWATI dengan jelas —
// gerbang `bun run go:test` tidak boleh bergantung pada basis data.
//
// JANGAN arahkan ke server produksi: tes ini membuat dan menghapus basis data
// `uji_schedule_<n>`. Cara menjalankannya:
//
//	docker run --rm -d --name uji-schedule -e POSTGRES_PASSWORD=uji -p 55439:5432 postgres:17-alpine
//	SCHEDULE_TEST_PG_URL=postgres://postgres:uji@127.0.0.1:55439/postgres \
//	  go test ./internal/schedulelane -run Sungguhan -v
//
// Tabel `jobs` dibuat dari migration kendali yang SAMA dengan produksi
// (0006 + 0007), bukan dari salinan. Registry tiruannya dibuat dengan
// `CREATE TABLE … AS SELECT`, bukan pernyataan tulis baris:
// `tests/services-go.test.ts` memindai seluruh pohon Go — tes juga — dan
// daftar-izin tabel yang ditulis Go harus tetap kebenaran produksi.
func TestPenerbitTerhadapPostgreSQLSungguhan(t *testing.T) {
	url := os.Getenv("SCHEDULE_TEST_PG_URL")
	if url == "" {
		t.Skip("SCHEDULE_TEST_PG_URL tidak diset — uji integrasi dilewati")
	}
	ctx, batal := context.WithTimeout(context.Background(), 60*time.Second)
	defer batal()

	admin, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(context.Background())
	nama := fmt.Sprintf("uji_schedule_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, `CREATE DATABASE `+pgx.Identifier{nama}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = admin.Exec(context.Background(), `DROP DATABASE IF EXISTS `+pgx.Identifier{nama}.Sanitize()+` WITH (FORCE)`)
	}()
	// Zona sesi WIB dengan sengaja: kolom `jobs` bertipe TIMESTAMP tanpa zona,
	// dan penerbit yang mengirim `run_after` dari jam proses akan menulis
	// baris yang baru bisa diklaim tujuh jam kemudian di bawah zona ini.
	if _, err := admin.Exec(ctx, `ALTER DATABASE `+pgx.Identifier{nama}.Sanitize()+` SET timezone = 'Asia/Jakarta'`); err != nil {
		t.Fatal(err)
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.Database = nama
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	akar := filepath.Join("..", "..", "..", "..", "prisma", "postgresql", "control")
	for _, m := range []string{"0006_jobs", "0007_jobs_started_at"} {
		sql, err := os.ReadFile(filepath.Join(akar, m, "migration.sql"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("%s: %v", m, err)
		}
	}
	for _, q := range []string{
		`CREATE TABLE tenants AS
		   SELECT * FROM (VALUES (10, NULL::timestamp), (11, now()::timestamp)) v(id, frozen_at)`,
		// 1 aktif · 2 demo · 3 aktif bertenant · 4 nonaktif · 5 tenant dibekukan
		// · 6 tenant yang barisnya HILANG (Prisma `is` menolaknya).
		`CREATE TABLE companies AS
		   SELECT * FROM (VALUES
		     (1, true,  false, NULL::int),
		     (2, true,  true,  NULL::int),
		     (3, true,  false, 10),
		     (4, false, false, NULL::int),
		     (5, true,  false, 11),
		     (6, true,  false, 99)) v(id, is_active, is_demo, tenant_id)`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("saringan registry = saringan penerbit Node", func(t *testing.T) {
		cs, err := Terjadwal(ctx, pool)
		if err != nil {
			t.Fatal(err)
		}
		if got := fmt.Sprint(cs); got != "[{1} {3}]" {
			t.Fatalf("perusahaan terjadwal %s, diharap [{1} {3}]", got)
		}
	})

	q := jobs.New(pool)
	at := time.Date(2026, 10, 23, 17, 0, 0, 0, time.UTC)

	t.Run("terbit sekali, ulangan menabrak dedupe_key", func(t *testing.T) {
		pubs, err := Publications(contract.KindTenantBackup, at, nil)
		if err != nil {
			t.Fatal(err)
		}
		id, baru, err := q.Publish(ctx, pubs[0])
		if err != nil || !baru || id == 0 {
			t.Fatalf("terbit pertama: id=%d baru=%v err=%v", id, baru, err)
		}
		id2, baru2, err := q.Publish(ctx, pubs[0])
		if err != nil || baru2 || id2 != 0 {
			t.Fatalf("terbit ulang: id=%d baru=%v err=%v", id2, baru2, err)
		}
		var kunci, status string
		var maks int
		if err := pool.QueryRow(ctx, `SELECT dedupe_key, status, max_attempts FROM jobs WHERE id = $1`, id).
			Scan(&kunci, &status, &maks); err != nil {
			t.Fatal(err)
		}
		if kunci != "tenant.backup:2026-10-23" || status != string(contract.StatusQueued) ||
			maks != contract.JobKinds[contract.KindTenantBackup].MaxAttempts {
			t.Fatalf("baris %q %q %d", kunci, status, maks)
		}
	})

	t.Run("baris terbitan Go LANGSUNG bisa diklaim, di bawah zona sesi WIB", func(t *testing.T) {
		j, err := q.Claim(ctx, contract.LaneTenant, []contract.JobKind{contract.KindTenantBackup}, "uji")
		if err != nil {
			t.Fatalf("baris terbitan Go tidak bisa diklaim: %v", err)
		}
		if string(j.Payload) == "" || j.CompanyID != nil {
			t.Fatalf("pekerjaan %+v", j)
		}
	})

	t.Run("ujung ke ujung: pelari + denyut + tick menerbitkan kind milik Go", func(t *testing.T) {
		// Kontrak hari ini: Node penerbit semuanya, jadi `GoOwned()` kosong.
		// Di sini `milik` diisi tangan — keadaan SESUDAH peralihan — dan
		// pelari sungguhan (`jobs.Runner`, pagar, klaim, lease) yang bekerja.
		d := &denyut{
			terbit:     q,
			perusahaan: func(c context.Context) ([]Company, error) { return Terjadwal(c, pool) },
			milik:      []contract.JobKind{contract.KindLedgerRecurring, contract.KindTenantBackup},
			now:        time.Now,
			selang:     50 * time.Millisecond,
		}
		peta := map[contract.JobKind]jobs.Handler{}
		peta[contract.KindScheduleTick] = d.tick
		henti, hentikan := context.WithCancel(ctx)
		pelari := &jobs.Runner{Lane: contract.LaneSchedule, Queue: q, Handlers: peta, Beside: d.beat, Stop: henti}
		selesai := make(chan error, 1)
		go func() { selesai <- pelari.Run(ctx) }()

		tenggat := time.Now().Add(15 * time.Second)
		var tickSelesai int
		for time.Now().Before(tenggat) {
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM jobs WHERE kind = $1 AND status = $2`,
				string(contract.KindScheduleTick), string(contract.StatusDone)).Scan(&tickSelesai); err != nil {
				t.Fatal(err)
			}
			if tickSelesai > 0 {
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		hentikan()
		if err := <-selesai; err != nil {
			t.Fatalf("pelari: %v", err)
		}
		if tickSelesai != 1 {
			t.Fatalf("%d tick selesai, diharap 1", tickSelesai)
		}
		var berulang []int32
		rows, err := pool.Query(ctx, `SELECT company_id FROM jobs WHERE kind = $1 ORDER BY company_id`,
			string(contract.KindLedgerRecurring))
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var id int32
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			berulang = append(berulang, id)
		}
		rows.Close()
		if fmt.Sprint(berulang) != "[1 3]" {
			t.Fatalf("dokumen berulang terbit untuk %v, diharap [1 3]", berulang)
		}
		kunci, err := DedupeKey(contract.KindTenantBackup, time.Now(), nil)
		if err != nil {
			t.Fatal(err)
		}
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM jobs WHERE dedupe_key = $1`, kunci).Scan(&n); err != nil || n != 1 {
			t.Fatalf("cadangan %s: %d baris (%v)", kunci, n, err)
		}
	})

	t.Run("pagar jalur schedule: satu pemegang", func(t *testing.T) {
		satu, dapat, err := q.TryLaneLock(ctx, contract.LaneSchedule)
		if err != nil || !dapat {
			t.Fatalf("pemegang pertama: %v %v", dapat, err)
		}
		defer satu.Release(context.Background())
		if _, dapat2, err := q.TryLaneLock(ctx, contract.LaneSchedule); err != nil || dapat2 {
			t.Fatalf("pemegang KEDUA mendapat pagar: %v %v", dapat2, err)
		}
		if err := satu.Check(ctx); err != nil {
			t.Fatalf("denyut pagar: %v", err)
		}
	})
}
