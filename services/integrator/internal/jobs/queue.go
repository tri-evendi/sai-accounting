package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ KLAIM WAJIB SATU PERNYATAAN ════════════════════════════════════════════
//
// `SELECT … FOR UPDATE SKIP LOCKED` lalu `UPDATE` terpisah adalah race
// condition yang lolos setiap pengujian satu pekerja: dua pekerja memilih baris
// yang sama di celah antara dua pernyataan, dan untuk `tenant.backup` itu
// berarti dua dump menulis ke satu kunci objek. Pernyataan di bawah memilih dan
// menulis dalam satu pernyataan, jadi celah itu tidak ada.
//
// ══ PARAMETER SELALU TERIKAT ═══════════════════════════════════════════════
//
// Tidak ada `fmt.Sprintf` ke dalam teks kueri di berkas ini. Satu-satunya hal
// yang dirangkai ke SQL adalah nama kolom yang ditulis tangan di sini.

// Job adalah baris `jobs` yang sudah diklaim pekerja ini.
type Job struct {
	ID              int64
	Kind            contract.JobKind
	TenantID        *int32
	CompanyID       *int32
	Payload         json.RawMessage
	Status          contract.JobStatus
	Attempts        int
	MaxAttempts     int
	CancelRequested bool
	ResultRef       *string
}

// Queue adalah sambungan SQL ke tabel `jobs` di basis data kendali.
type Queue struct {
	pool *pgxpool.Pool
}

// New membungkus kolam koneksi kendali.
func New(pool *pgxpool.Pool) *Queue { return &Queue{pool: pool} }

// ErrNoJob dipulangkan Claim ketika tidak ada yang menunggu. Ia bukan
// kegagalan, dan karena itu diberi nama sendiri alih-alih `nil, nil`: pemanggil
// yang lupa memeriksa `nil` pada bentuk kedua akan dereference pointer kosong.
var ErrNoJob = errors.New("tidak ada pekerjaan yang menunggu")

const kolomPulang = `id, kind, tenant_id, company_id, payload, status, attempts,
	       max_attempts, cancel_requested, result_ref`

// Claim mengambil satu pekerjaan dari daftar `kind` yang DIKLAIM pekerja ini.
//
// Klausa `kind = ANY($1)` itulah yang membuat jalur terpisah: proses jalur
// `tenant` tidak pernah melihat pekerjaan `interactive`, jadi satu cadangan
// raksasa tidak pernah membuat pengguna yang menunggu unduhan ikut menunggu.
//
// ══ `kinds` DISERAHKAN PEMANGGIL, BUKAN DITURUNKAN DARI JALUR ══════════════
//
// Versi pertama berkas ini menurunkannya dari `KindsByLane[lane]`, dan itu
// benar untuk keadaan akhir: satu jalur, satu proses. Tapi keadaan akhir itu
// datang lewat tahap 1b–1d, dan selama transisi sebuah jalur bisa dilayani DUA
// bahasa untuk `kind` yang berbeda — jalur `tenant` di tahap 1b adalah contoh
// pertamanya: `tenant.backup` pindah ke Go, `tenant.conformance` tetap
// TypeScript sebab dua dari sebelas pemeriksaannya MENGHITUNG angka akuntansi
// dan §3.3 menahan Go di depan garis itu sampai ada pemicu terukur.
//
// Pelari yang mengklaim seluruh `kind` jalurnya akan mengklaim yang tidak bisa
// ia kerjakan, lalu menggagalkannya sampai `max_attempts` habis. Yang menjaga
// supaya ini tidak menjadi lubang: `kind` yang DITERBITKAN tanpa satu pengklaim
// pun ditolak `tests/kind-punya-pengklaim.test.ts` — bukan ditemukan
// berbulan-bulan kemudian lewat metrik umur-tertua yang perlahan memerah.
//
// ⚠ Pekerjaan ber-WritesLedger TIDAK pernah diklaim di sini, dan itu bukan
// kebetulan konfigurasi: jalur `ledger` punya pelarinya sendiri di Node, dan
// pintu posting wajib tunggal (I-2). Pemeriksaannya di bawah berdiri meskipun
// kontraknya sudah menjamin hal yang sama — biaya satu perbandingan melawan
// kelas kegagalan yang tidak menghasilkan galat.
func (q *Queue) Claim(
	ctx context.Context,
	lane contract.JobLane,
	kinds []contract.JobKind,
	workerID string,
) (*Job, error) {
	if len(kinds) == 0 {
		return nil, fmt.Errorf("pekerja jalur %q tidak mengklaim satu kind pun", lane)
	}

	milikJalur := map[contract.JobKind]bool{}
	for _, k := range contract.KindsByLane[lane] {
		milikJalur[k] = true
	}

	daftar := make([]string, 0, len(kinds))
	for _, k := range kinds {
		if contract.JobKinds[k].WritesLedger {
			return nil, fmt.Errorf(
				"pekerja mengklaim kind %q yang MENULIS buku besar — pintu posting wajib "+
					"tunggal dan ia TypeScript (invarian I-2)", k)
		}
		if !milikJalur[k] {
			// Isolasi jalur TETAP jalur: pekerja jalur `tenant` yang mengklaim
			// `report.export` membuat satu cadangan raksasa menahan unduhan yang
			// ditunggu orang di layar — tepat yang §3.1 ada untuk mencegah.
			return nil, fmt.Errorf(
				"kind %q bukan milik jalur %q — isolasi jalur dilanggar", k, lane)
		}
		daftar = append(daftar, string(k))
	}

	row := q.pool.QueryRow(ctx, `
		UPDATE jobs SET status = 'claimed', claimed_at = now(), claimed_by = $2,
		                updated_at = now()
		WHERE id = (
		  SELECT id FROM jobs
		  WHERE status = 'queued'
		    AND run_after <= now()
		    AND kind = ANY($1)
		  ORDER BY priority DESC, run_after
		  FOR UPDATE SKIP LOCKED
		  LIMIT 1
		)
		RETURNING `+kolomPulang, daftar, workerID)

	var j Job
	err := row.Scan(&j.ID, &j.Kind, &j.TenantID, &j.CompanyID, &j.Payload, &j.Status,
		&j.Attempts, &j.MaxAttempts, &j.CancelRequested, &j.ResultRef)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoJob
	}
	if err != nil {
		return nil, fmt.Errorf("klaim jalur %s: %w", lane, err)
	}
	return &j, nil
}

// Publication adalah satu baris `jobs` yang akan DITERBITKAN pohon Go.
//
// Bentuknya bentuk `PublishInput` sisi Node (`@sai/platform/job-queue`), dan
// tidak lebih: penerbit Go tidak menyetel `tenant_id`, `priority`, maupun
// `run_after` — yang terakhir sengaja jatuh ke DEFAULT kolomnya (lihat Publish).
type Publication struct {
	Kind      contract.JobKind
	CompanyID *int32
	// Payload sudah JSON — penerbit yang menyusunnya, karena bentuknya milik
	// PELAKSANA kind itu, bukan milik antrean.
	Payload   json.RawMessage
	DedupeKey string
}

// Publish menerbitkan satu pekerjaan dan memulangkan id barisnya, atau
// (0, false) bila `dedupe_key`-nya sudah ada — penerbitan ulang yang tidak
// melakukan apa pun, dan justru itulah yang membuat denyut aman diulang.
//
// Padanan `publishJob` (Node), dengan SATU beda yang disengaja: `run_after`
// TIDAK dikirim dari jam proses ini melainkan jatuh ke DEFAULT kolomnya
// (`CURRENT_TIMESTAMP`, jam SERVER). Klaim di kedua bahasa membandingkan
// `run_after <= now()` — jam server juga — jadi baris terbitan Go langsung bisa
// diklaim berapa pun selisih jam antara container ini dan basis data, dan
// berapa pun zona sesi koneksinya (kolomnya `TIMESTAMP` tanpa zona).
//
// ══ MENERBITKAN KIND PENULIS BUKU DIBOLEHKAN — MENGKLAIMNYA TIDAK ══════════
// `ledger.recurring` ber-WritesLedger, dan jalur `schedule` Go MENERBITKANNYA.
// Itu bukan pelanggaran I-2: yang ditulis di sini hanya baris `jobs` (tabel di
// daftar-izin pohon Go); yang memposting tetap pelari jalur `ledger` Node,
// satu-satunya pengklaimnya. Pemeriksaan WritesLedger di Claim tetap berdiri.
//
// Kind harus dikenal kontrak, dan kunci idempotensi WAJIB ada: penerbit Go
// hanya menerbitkan denyut, dan denyut tanpa kunci adalah denyut yang
// menggandakan dirinya setiap kali diulang.
func (q *Queue) Publish(ctx context.Context, p Publication) (int64, bool, error) {
	spec, ada := contract.JobKinds[p.Kind]
	if !ada {
		return 0, false, fmt.Errorf("kind %q tidak ada di kontrak", p.Kind)
	}
	if p.DedupeKey == "" {
		return 0, false, fmt.Errorf("penerbitan %q tanpa dedupe_key — denyut wajib idempoten", p.Kind)
	}
	if !json.Valid(p.Payload) {
		return 0, false, fmt.Errorf("muatan %q bukan JSON yang sah", p.Kind)
	}
	var id int64
	err := q.pool.QueryRow(ctx, `
		INSERT INTO jobs (kind, company_id, payload, status, dedupe_key, max_attempts, updated_at)
		VALUES ($1, $2, $3::jsonb, 'queued', $4, $5, now())
		ON CONFLICT (dedupe_key) DO NOTHING
		RETURNING id`, string(p.Kind), p.CompanyID, string(p.Payload), p.DedupeKey, spec.MaxAttempts).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("terbitkan %s (%s): %w", p.Kind, p.DedupeKey, err)
	}
	return id, true, nil
}

// RenewLease memperpanjang lease. false = pekerjaan ini sudah bukan milik
// pekerja itu.
//
// Pekerja yang menerima false WAJIB berhenti: barisnya sudah dipulangkan dan
// mungkin sudah diklaim pekerja lain. Melanjutkan berarti dua pekerja menulis
// hasil yang sama.
func (q *Queue) RenewLease(ctx context.Context, id int64, workerID string) (bool, error) {
	tag, err := q.pool.Exec(ctx, `
		UPDATE jobs SET claimed_at = now(), updated_at = now()
		WHERE id = $1 AND status = 'claimed' AND claimed_by = $2`, id, workerID)
	if err != nil {
		return false, fmt.Errorf("perpanjang lease #%d: %w", id, err)
	}
	return tag.RowsAffected() == 1, nil
}

// ReportProgress melaporkan kemajuan (0–100) dan sekaligus memperpanjang lease.
func (q *Queue) ReportProgress(ctx context.Context, id int64, workerID string, persen int) (bool, error) {
	if persen < 0 {
		persen = 0
	}
	if persen > 100 {
		persen = 100
	}
	tag, err := q.pool.Exec(ctx, `
		UPDATE jobs SET progress = $3, claimed_at = now(), updated_at = now()
		WHERE id = $1 AND status = 'claimed' AND claimed_by = $2`, id, workerID, persen)
	if err != nil {
		return false, fmt.Errorf("laporkan kemajuan #%d: %w", id, err)
	}
	return tag.RowsAffected() == 1, nil
}

// Complete menandai pekerjaan selesai.
//
// resultRef adalah KUNCI objek, bukan tautan: memegang kuncinya bukan izin
// untuk membacanya. Penyimpanan objeknya privat, unduhan lewat rute aplikasi,
// dan izinnya diperiksa SAAT MENGUNDUH — pekerjaan hidup berjam-jam, dan orang
// yang aksesnya dicabut di antaranya tidak boleh tetap menerima hasilnya.
func (q *Queue) Complete(ctx context.Context, id int64, workerID string, resultRef *string) (bool, error) {
	tag, err := q.pool.Exec(ctx, `
		UPDATE jobs SET status = 'done', progress = 100, result_ref = $3,
		                finished_at = now(), updated_at = now()
		WHERE id = $1 AND status = 'claimed' AND claimed_by = $2`, id, workerID, resultRef)
	if err != nil {
		return false, fmt.Errorf("selesaikan #%d: %w", id, err)
	}
	return tag.RowsAffected() == 1, nil
}

// HasilGagal menyatakan ke mana sebuah kegagalan membawa barisnya.
type HasilGagal struct {
	Status contract.JobStatus
}

// Fail menaikkan attempts, lalu memulangkan baris ke `queued` dengan backoff —
// atau ke `dead` bila percobaannya habis.
//
// last_error SELALU ditulis, termasuk saat masih ada percobaan berikutnya:
// kegagalan yang ditimpa menjadi kosong oleh percobaan yang akhirnya berhasil
// menghapus satu-satunya petunjuk kenapa ia gagal dua kali lebih dulu.
func (q *Queue) Fail(ctx context.Context, id int64, workerID, pesan string, acak func() float64) (*HasilGagal, error) {
	var attempts, maxAttempts int
	err := q.pool.QueryRow(ctx, `
		SELECT attempts, max_attempts FROM jobs
		WHERE id = $1 AND status = 'claimed' AND claimed_by = $2`, id, workerID).
		Scan(&attempts, &maxAttempts)
	if errors.Is(err, pgx.ErrNoRows) {
		// Barisnya sudah bukan milik pekerja ini. Menulis kegagalan di sini akan
		// menaikkan `attempts` milik pekerjaan orang lain.
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("baca percobaan #%d: %w", id, err)
	}

	attempts++
	if len(pesan) > 8000 {
		pesan = pesan[:8000]
	}

	if IsDead(attempts, maxAttempts) {
		if _, err := q.pool.Exec(ctx, `
			UPDATE jobs SET status = 'dead', attempts = $2, last_error = $3,
			                finished_at = now(), updated_at = now()
			WHERE id = $1`, id, attempts, pesan); err != nil {
			return nil, fmt.Errorf("matikan #%d: %w", id, err)
		}
		return &HasilGagal{Status: contract.StatusDead}, nil
	}

	runAfter := time.Now().Add(Backoff(attempts, acak))
	if _, err := q.pool.Exec(ctx, `
		UPDATE jobs SET status = 'queued', attempts = $2, last_error = $3,
		                run_after = $4, claimed_at = NULL, claimed_by = NULL,
		                updated_at = now()
		WHERE id = $1`, id, attempts, pesan, runAfter); err != nil {
		return nil, fmt.Errorf("pulangkan #%d: %w", id, err)
	}
	return &HasilGagal{Status: contract.StatusQueued}, nil
}

// CancelRequested membaca ulang penanda pembatalan.
//
// Pekerja memeriksanya DI ANTARA langkah, tidak dipaksakan: membatalkan di
// tengah satu langkah yang sedang menulis menghasilkan keadaan separuh.
func (q *Queue) CancelRequested(ctx context.Context, id int64) (bool, error) {
	var batal bool
	err := q.pool.QueryRow(ctx,
		`SELECT cancel_requested FROM jobs WHERE id = $1`, id).Scan(&batal)
	if err != nil {
		return false, fmt.Errorf("baca pembatalan #%d: %w", id, err)
	}
	return batal, nil
}

// ReclaimStale memulangkan pekerjaan dari pekerja yang lease-nya berhenti
// diperbarui, dan memulangkan jumlah yang dipulangkan.
//
// Ambangnya kelipatan interval pembaruan, BUKAN perkiraan durasi pekerjaan —
// alasannya di `contract.LeaseStaleFactor`. Idempoten, jadi ia tidak butuh
// leader election maupun kunci: pelari kedua yang menjalankannya pada saat yang
// sama memulangkan nol baris.
func (q *Queue) ReclaimStale(ctx context.Context, basi time.Duration) (int64, error) {
	ambang := time.Now().Add(-basi)
	// `attempts + 1` ikut dinaikkan: pekerja yang mati di tengah pekerjaan yang
	// SELALU membunuh pekerjanya (kehabisan memori pada ekspor yang terlalu
	// besar) harus akhirnya menjadi `dead`, bukan berputar selamanya memulangkan
	// dan membunuh pekerja berikutnya.
	tag, err := q.pool.Exec(ctx, `
		UPDATE jobs
		   SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'queued' END,
		       attempts = attempts + 1,
		       last_error = CASE WHEN last_error IS NULL THEN '' ELSE last_error || chr(10) END
		                    || 'lease kedaluwarsa — pekerja diduga mati',
		       finished_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
		       claimed_at = NULL, claimed_by = NULL, updated_at = now()
		 WHERE status = 'claimed' AND claimed_at < $1`, ambang)
	if err != nil {
		return 0, fmt.Errorf("pulangkan lease kedaluwarsa: %w", err)
	}
	return tag.RowsAffected(), nil
}

// ArchiveDone membuang baris `done` yang sudah melewati jendela retensi.
//
// ⚠ `status = 'done'` SAJA. `dead` dan `failed` tidak pernah tersentuh:
// kegagalan adalah isi paling berharga di tabel ini, dan ia justru yang dicari
// orang berbulan-bulan kemudian. Predikat yang melebar ke "sudah selesai" akan
// membuang justru baris yang paling dicari orang.
func (q *Queue) ArchiveDone(ctx context.Context, retensiHari int) (int64, error) {
	ambang := time.Now().AddDate(0, 0, -retensiHari)
	tag, err := q.pool.Exec(ctx,
		`DELETE FROM jobs WHERE status = 'done' AND finished_at < $1`, ambang)
	if err != nil {
		return 0, fmt.Errorf("buang baris done: %w", err)
	}
	return tag.RowsAffected(), nil
}

// TryLaneLock memagari jalur tunggal-instans.
//
// `pg_try_advisory_lock` dipegang selama koneksi hidup dan dilepas sendiri saat
// proses mati — termasuk mati mendadak, yang justru kasus yang penting. Kunci
// yang disimpan sebagai baris akan tertinggal setelah OOM dan memblokir
// pengganti yang sehat.
//
// Ia TIDAK memikul kebenaran — `dedupe_key` yang unik sudah melakukannya — tapi
// ia mencegah dua pelari berjalan bersamaan karena salah konfigurasi, dan
// kesalahan itu jauh lebih mudah dilakukan daripada dibayangkan.
//
// Koneksinya DIPEGANG di dalam `LaneLock`: kunci advisory milik koneksi, jadi
// melepas koneksinya ke kolam akan melepas kuncinya juga — diam-diam, dan
// hanya di bawah beban ketika kolam memang memakai ulang koneksi.
//
// Memegang koneksi saja TIDAK cukup, dan itu utang yang dibayar di sini: sesi
// yang mati (PostgreSQL dimulai ulang, failover ke standby, jaringan putus)
// melepas kuncinya di server sementara proses ini masih merasa memegangnya.
// Maka `pg_backend_pid()` dicatat saat kunci diambil, dan `LaneLock.Watch`
// membuktikannya ulang tiap `contract.LaneLockProbe` — padanan Go
// `@sai/db/session-lock`.
func (q *Queue) TryLaneLock(ctx context.Context, lane contract.JobLane) (*LaneLock, bool, error) {
	var conn *pgxpool.Conn
	conn, err := q.pool.Acquire(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("ambil koneksi untuk pagar jalur: %w", err)
	}
	// Koneksi pagar TIDAK pernah kembali ke kolam dalam keadaan hidup: ia
	// membawa `idle_session_timeout` yang tidak boleh diwarisi koneksi kerja.
	buang := func() {
		_ = conn.Conn().Close(context.Background())
		conn.Release()
	}
	nama := "sai.lane." + string(lane)

	// `idle_session_timeout` (PostgreSQL ≥ 14): pemegang yang terisolasi
	// dibuang server sesudah angka ini — dan denyutnya sudah gagal lebih dulu
	// (kontrak menjamin probe + query_timeout < idle_session). Gagal di server
	// lama bukan alasan menolak pagar; jendelanya hanya memanjang ke TCP
	// keepalive server. `set_config` dan bukan `SET`, supaya nilainya terikat
	// sebagai parameter.
	if _, err := conn.Exec(ctx, `SELECT set_config('idle_session_timeout', $1, false)`,
		strconv.FormatInt(contract.LaneLockIdleSession.Milliseconds(), 10)); err != nil {
		log.Printf("[%s] ⚠ idle_session_timeout tidak bisa disetel pada sesi pagar: %v", lane, err)
	}

	var ok bool
	var pid int32
	// Id kunci diturunkan dari nama jalur secara stabil — dua jalur berbeda tidak
	// boleh berebut kunci yang sama. `hashtext` deterministik di satu versi
	// server, dan itu cukup: yang dibandingkan hanya dua proses jalur yang sama
	// di server yang sama. Nama kuncinya PERSIS sama dengan sisi Node
	// (`workers/runner.ts`), karena pagar yang tidak saling melihat bukan pagar.
	if err := conn.QueryRow(ctx,
		`SELECT pg_try_advisory_lock(hashtext($1)), pg_backend_pid()`, nama).Scan(&ok, &pid); err != nil {
		buang()
		return nil, false, fmt.Errorf("pagar jalur %s: %w", lane, err)
	}
	if !ok {
		buang()
		return nil, false, nil
	}
	return newLaneLock(nama, pid, conn, func(c context.Context, lepasKunci bool) {
		if lepasKunci {
			// Pelepasan eksplisit dulu: penutupan saja sudah melepasnya, tapi
			// dengan ini kandidat berikutnya tidak perlu menunggu FIN sampai.
			_, _ = conn.Exec(c, `SELECT pg_advisory_unlock(hashtext($1))`, nama)
		}
		buang()
	}), true, nil
}
