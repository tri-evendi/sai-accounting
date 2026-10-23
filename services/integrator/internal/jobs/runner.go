package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"runtime/metrics"
	"sort"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/buildinfo"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// PELARI JALUR — satu proses menguras satu jalur antrean.
//
// Padanan `workers/runner.ts`, dan kedua pelari membaca kontrak yang sama —
// itulah yang membuat "jalur" punya arti yang sama di dua bahasa.
//
// ══ EMPAT HAL YANG MEMBUATNYA AMAN, DAN SEMUANYA MUDAH TERLEWAT ════════════
//
//  1. Lease diperpanjang selama bekerja. Pekerjaan 30 menit melewati ambang
//     mana pun yang masuk akal untuk mendeteksi pekerja mati. Tanpa
//     perpanjangan, pekerja kedua mengklaimnya SEMENTARA yang pertama masih
//     berjalan — untuk `tenant.backup` itu dua dump ke satu kunci objek.
//
//  2. Lease yang hilang MENGHENTIKAN pekerjaan. Kalau perpanjangan menjawab
//     "ini bukan milikmu lagi", pekerjaan dibatalkan di tempat.
//
//  3. SIGTERM menyelesaikan yang sedang jalan, lalu berhenti mengklaim.
//     `docker compose down` dan setiap rilis mengirim SIGTERM.
//
//  4. Jalur tunggal-instans dipagari advisory lock — lihat TryLaneLock —
//     yang dibuktikan ulang tiap denyut; pagar yang hilang menghentikan
//     pengklaiman dan `Run` pulang dengan galat (lihat LaneLock).

// ErrLeaseLost dipulangkan ke handler lewat Context yang dibatalkan, dan
// dipakai pelari untuk membedakan "pekerjaan ini gagal" dari "pekerjaan ini
// bukan milik kita lagi". Bedanya menentukan: menulis kegagalan untuk yang
// kedua akan menaikkan `attempts` milik pekerja lain.
var ErrLeaseLost = errors.New("lease hilang — pekerjaan ini sudah bukan milik pekerja ini")

// Ctx adalah apa yang dilihat sebuah handler.
type Ctx struct {
	// Ctx dibatalkan saat lease hilang, saat pembatalan diminta, dan saat
	// proses diminta berhenti. Handler yang panjang WAJIB menghormatinya.
	Ctx     context.Context
	Job     *Job
	Payload json.RawMessage

	// Progress melaporkan kemajuan dan sekaligus memperpanjang lease.
	Progress func(persen int) error
}

// Handler mengerjakan satu pekerjaan dan memulangkan resultRef (kunci objek)
// atau nil.
type Handler func(Ctx) (*string, error)

// Runner menjalankan satu jalur.
type Runner struct {
	Lane     contract.JobLane
	Queue    *Queue
	Handlers map[contract.JobKind]Handler
	Log      *log.Logger

	// Stop, bila tidak nil, berperan sama dengan SIGTERM: begitu selesai,
	// pelari berhenti MENGKLAIM, tetapi pekerjaan yang sedang jalan
	// diselesaikan. Dipakai `cmd/integrator`, yang menjalankan dua pelari di
	// satu proses: pelari yang berakhir menghentikan saudaranya lewat ini —
	// bukan dengan membatalkan konteks kerja, yang akan memotong dump atau
	// ekspor di tengah jalan.
	Stop context.Context

	// LockQueue, bila tidak nil, adalah antrean yang koneksinya MEMEGANG pagar
	// jalur tunggal-instans; nil = Queue. Ada untuk jalur yang bekerja lewat
	// PgBouncer tetapi wajib memagari diri di koneksi LANGSUNG — padanan
	// "pooler (pagar: langsung)" jalur `ledger` Node. Kunci advisory lewat
	// pooler mode transaksi tertinggal di backend milik kolam, bukan milik
	// pelari ini.
	LockQueue *Queue

	// Beside, bila tidak nil, dijalankan di goroutine sendiri SESUDAH pagar
	// didapat (jalur tunggal-instans) dan dihentikan bersama pengklaiman
	// (SIGTERM, Stop, atau pagar hilang). Jalur `schedule` memakainya untuk
	// denyut yang MENERBITKAN — sesuatu yang hanya boleh dikerjakan
	// pemegang pagar, dan yang berhenti pada saat yang sama dengan klaimnya.
	// `Run` menunggunya selesai sebelum pulang.
	Beside func(ctx context.Context)

	// tryLock: jahitan untuk tes; nil = (LockQueue atau Queue).TryLaneLock.
	tryLock func(ctx context.Context, lane contract.JobLane) (*LaneLock, bool, error)

	// heapBytes: jahitan untuk tes pagar memori; nil = heap proses ini.
	heapBytes func() uint64
}

func (r *Runner) logf(format string, args ...any) {
	l := r.Log
	if l == nil {
		l = log.Default()
	}
	l.Printf("["+string(r.Lane)+"] "+format, args...)
}

// WorkerID: cukup untuk menunjuk container yang memegang lease, DITAMBAH
// build yang ia jalankan — `tenant@<host>:<pid> svc-integrator v0.12.1+abc1234`.
//
// Stempel di sini, bukan di tabel baru: pohon Go hanya boleh menulis `jobs`
// dan `backup_runs` (aturan 1, daftar-izin), dan kolom ini SUDAH ditulis setiap
// klaim. Konsol operator (`/scheduler` → "Versi layanan") membacanya untuk
// melihat pelari yang tertinggal di image lama. Bentuknya
// `buildinfo.StampIdentity`, sama persis dengan `workerId` di
// `workers/runner.ts`. Dihitung SEKALI per pelari, jadi `claimed_by = $2` pada
// perpanjangan lease tetap cocok.
func WorkerID(lane contract.JobLane) string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "lokal"
	}
	return buildinfo.StampIdentity(fmt.Sprintf("%s@%s:%d", lane, host, os.Getpid()), buildinfo.Service, buildinfo.Get())
}

// Run menguras jalur ini sampai SIGTERM/SIGINT (atau sampai Stop selesai).
func (r *Runner) Run(ctx context.Context) error {
	spec, ada := contract.JobLanes[r.Lane]
	if !ada {
		return fmt.Errorf("jalur %q tidak ada di kontrak", r.Lane)
	}

	// Pelari mengklaim HANYA `kind` yang punya handler, dan daftarnya dirakit di
	// sini — bukan diturunkan dari jalurnya.
	//
	// Pelari yang mengklaim `kind` tanpa handler akan mengklaim lalu
	// menggagalkan setiap baris yang lewat sampai `max_attempts` habis. Untuk
	// `schema.migrate` yang `max_attempts: 1` itu berarti migration mati pada
	// percobaan pertama, dan rilisnya terbaca seperti migration yang gagal —
	// bukan seperti pelari yang salah dibangun.
	//
	// Sisi lain dari keputusan ini: `kind` yang tidak diklaim pelari mana pun
	// menumpuk sebagai baris `queued` SELAMANYA. Yang menutupnya bukan pelari
	// ini melainkan `tests/kind-punya-pengklaim.test.ts`, yang menolak `kind`
	// yang DITERBITKAN tanpa pengklaim.
	kinds := make([]contract.JobKind, 0, len(r.Handlers))
	for k := range r.Handlers {
		kinds = append(kinds, k)
	}
	if len(kinds) == 0 {
		return fmt.Errorf("pelari jalur %q tidak punya satu handler pun", r.Lane)
	}
	// Urutan map Go acak; diurutkan supaya log dan kueri bisa diulang.
	sort.Slice(kinds, func(i, j int) bool { return kinds[i] < kinds[j] })

	me := WorkerID(r.Lane)

	var pagar *LaneLock
	if spec.SingleInstance {
		ambil := r.tryLock
		if ambil == nil {
			q := r.LockQueue
			if q == nil {
				q = r.Queue
			}
			ambil = q.TryLaneLock
		}
		p, dapat, err := ambil(ctx, r.Lane)
		if err != nil {
			return err
		}
		if !dapat {
			r.logf("instans lain sudah memegang jalur ini — keluar tanpa bekerja.")
			r.logf("  Jalur ini tunggal-instans di contract/kinds.yaml. Ini bukan galat.")
			return nil
		}
		pagar = p
		defer pagar.Release(context.Background())
	}

	// SIGTERM membatalkan konteks BERHENTI, bukan konteks kerja: yang sedang
	// jalan diselesaikan, dan yang berhenti hanyalah pengklaiman berikutnya.
	berhenti, batalkanBerhenti := signal.NotifyContext(ctx, syscall.SIGTERM, syscall.SIGINT)
	defer batalkanBerhenti()
	if r.Stop != nil {
		lepas := context.AfterFunc(r.Stop, batalkanBerhenti)
		defer lepas()
	}
	if pagar != nil {
		r.jagaPagar(berhenti, batalkanBerhenti, pagar)
	}
	if r.Beside != nil {
		// Ditunggu sebelum `Run` pulang: penerbit yang masih menulis sesudah
		// pelarinya "berhenti" adalah pemegang pagar yang sudah melepasnya.
		samping := make(chan struct{})
		go func() {
			defer close(samping)
			r.Beside(berhenti)
		}()
		defer func() { <-samping }()
	}

	// Baris stempel build per jalur — bentuk `buildBanner` TypeScript.
	r.logf("%s", buildinfo.Get().Banner(buildinfo.Service))
	r.logf("mulai sebagai %s — mengklaim %v", me, kinds)

	// Putaran pertama SEGERA, bukan sesudah jeda: pelari yang baru hidup sesudah
	// sebuah crash harus memulangkan pekerjaan yang tertinggal sekarang, bukan
	// satu menit dari sekarang.
	r.upkeep(ctx)
	pemeliharaan := time.NewTicker(contract.Upkeep)
	defer pemeliharaan.Stop()
	go func() {
		for {
			select {
			case <-berhenti.Done():
				return
			case <-pemeliharaan.C:
				r.upkeep(ctx)
			}
		}
	}()

	for berhenti.Err() == nil {
		job, err := r.Queue.Claim(ctx, r.Lane, kinds, me)
		if errors.Is(err, ErrNoJob) {
			r.tidur(berhenti, contract.Idle)
			continue
		}
		if err != nil {
			r.logf("gagal mengklaim: %v", err)
			r.tidur(berhenti, contract.Idle)
			continue
		}
		r.kerjakan(ctx, me, job)
	}

	if pagar != nil {
		if err := pagar.Err(); err != nil {
			// Bukan-nol, dengan sengaja: pelari yang kehilangan pagarnya tidak
			// boleh keluar seperti pelari yang diminta berhenti. `cmd/integrator`
			// lalu keluar 1, dan `restart: unless-stopped` menghidupkannya
			// kembali sebagai KANDIDAT — yang mengambil pagar hanya bila memang
			// tidak ada pemegang lain.
			r.logf("berhenti karena pagar jalur hilang.")
			return err
		}
	}
	r.logf("berhenti.")
	return nil
}

// jagaPagar menjalankan denyut pembuktian pagar selama pelari hidup. Begitu
// kunci HILANG, pengklaiman berikutnya dihentikan SEKETIKA (lewat `hentikan`,
// jalan yang sama dengan SIGTERM): pelari yang terus mengklaim tanpa pagar
// adalah instans kedua yang sedang menunggu terjadi. Pekerjaan yang sedang
// jalan diselesaikan — lease-nya yang menjaga baris itu, bukan pagar ini —
// dan `Run` lalu memulangkan galat kehilangannya.
func (r *Runner) jagaPagar(berhenti context.Context, hentikan context.CancelFunc, pagar *LaneLock) {
	go func() { _ = pagar.Watch(berhenti) }()
	go func() {
		select {
		case <-berhenti.Done():
		case <-pagar.Lost():
			r.logf("⚠ %v — berhenti mengklaim.", pagar.Err())
			hentikan()
		}
	}()
}

func (r *Runner) tidur(berhenti context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-berhenti.Done():
	case <-t.C:
	}
}

// upkeep: satu putaran pemeliharaan tabel `jobs`.
//
// Dijalankan SETIAP pelari, bukan hanya jalur tunggal-instans: penyebaran yang
// kebetulan hanya memuat jalur jamak akan berjalan tanpa pernah memulangkan
// satu lease pun, dan kegagalan itu tidak punya gejala selain pekerjaan yang
// hilang.
//
// Galatnya DITELAN (dicatat, tidak dilempar): pemeliharaan yang gagal tidak
// boleh menjatuhkan pelari yang sedang sehat mengerjakan pekerjaan orang.
func (r *Runner) upkeep(ctx context.Context) {
	if n, err := r.Queue.ReclaimStale(ctx, contract.LeaseStale); err != nil {
		r.logf("upkeep: gagal memulangkan lease kedaluwarsa: %v", err)
	} else if n > 0 {
		r.logf("upkeep: %d pekerjaan dipulangkan dari pekerja yang mati", n)
	}
	if n, err := r.Queue.ArchiveDone(ctx, contract.DoneRetentionDays); err != nil {
		r.logf("upkeep: gagal membuang baris `done`: %v", err)
	} else if n > 0 {
		r.logf("upkeep: %d baris `done` lewat retensi dibuang", n)
	}
}

func (r *Runner) kerjakan(ctx context.Context, me string, job *Job) {
	handler := r.Handlers[job.Kind]

	kerja, batalkanKerja := context.WithCancel(ctx)
	defer batalkanKerja()

	// `leaseHidup` dibaca dua goroutine, jadi ia atomik dan bukan bool biasa.
	var leaseHidup atomic.Bool
	leaseHidup.Store(true)
	var dibatalkan atomic.Bool
	dibatalkan.Store(job.CancelRequested)
	if job.CancelRequested {
		batalkanKerja()
	}

	selesai := make(chan struct{})
	go func() {
		t := time.NewTicker(contract.LeaseRenew)
		defer t.Stop()
		for {
			select {
			case <-selesai:
				return
			case <-t.C:
				masih, err := r.Queue.RenewLease(ctx, job.ID, me)
				if err != nil {
					// Gagal memperpanjang karena basis data sedang tak terjangkau
					// BUKAN bukti lease hilang. Menganggapnya hilang akan membatalkan
					// pekerjaan yang sebenarnya masih sah; ambang reclaim memberi
					// ruang untuk beberapa kali gagal.
					r.logf("#%d gagal memperpanjang lease: %v", job.ID, err)
				} else if !masih {
					leaseHidup.Store(false)
					r.logf("#%d lease HILANG — pekerjaan dihentikan.", job.ID)
					batalkanKerja()
					return
				}
				// Pembatalan dibaca di putaran yang sama: satu denyut, dua
				// pertanyaan. Galatnya didiamkan — pembatalan yang terlambat
				// terbaca hanya berarti pekerjaan selesai, dan itu tidak merusak
				// apa pun.
				if batal, err := r.Queue.CancelRequested(ctx, job.ID); err == nil && batal {
					dibatalkan.Store(true)
					batalkanKerja()
				}
			}
		}
	}()

	// Pagar memori jalur (`contract/kinds.yaml` → `memory_fence_mib`): pekerjaan
	// yang membuat heap proses melewatinya DIBATALKAN dan digagalkan dengan
	// sebab yang terbaca — sebelum OOM-killer memilih korban, yang di
	// `svc-integrator` berarti seluruh container beserta dump cadangan yang
	// sedang berjalan (09 §3.2, risiko 2 & 4).
	var lewatPagar atomic.Uint64
	if fence := spec(r.Lane).MemoryFenceMiB; fence > 0 {
		go r.jagaMemori(kerja, selesai, uint64(fence)<<20, &lewatPagar, batalkanKerja)
	}

	mulai := time.Now()
	resultRef, err := handler(Ctx{
		Ctx:     kerja,
		Job:     job,
		Payload: job.Payload,
		Progress: func(persen int) error {
			if !leaseHidup.Load() {
				return ErrLeaseLost
			}
			_, e := r.Queue.ReportProgress(ctx, job.ID, me, persen)
			return e
		},
	})
	close(selesai)

	if !leaseHidup.Load() {
		// TIDAK dilaporkan sebagai kegagalan pekerjaan: barisnya sudah
		// dipulangkan dan mungkin sudah diklaim pekerja lain.
		r.logf("#%d dilepas karena lease hilang", job.ID)
		return
	}

	if heap := lewatPagar.Load(); heap > 0 {
		pesan := fmt.Sprintf("pagar memori jalur %s: heap %d MiB melewati %d MiB — pekerjaan dibatalkan "+
			"supaya container (dan jalur lain di dalamnya) tidak dibunuh OOM-killer",
			r.Lane, heap>>20, spec(r.Lane).MemoryFenceMiB)
		hasil, e := r.Queue.Fail(ctx, job.ID, me, pesan, nil)
		if e != nil {
			r.logf("#%d gagal mencatat pagar memori: %v", job.ID, e)
		}
		status := "tidak diketahui"
		if hasil != nil {
			status = string(hasil.Status)
		}
		r.logf("#%d %s DIHENTIKAN pagar memori (%s): %s", job.ID, job.Kind, status, pesan)
		return
	}

	if dibatalkan.Load() {
		if _, e := r.Queue.Fail(ctx, job.ID, me, "dibatalkan atas permintaan", nil); e != nil {
			r.logf("#%d gagal mencatat pembatalan: %v", job.ID, e)
		}
		r.logf("#%d %s dibatalkan", job.ID, job.Kind)
		return
	}

	if err != nil {
		hasil, e := r.Queue.Fail(ctx, job.ID, me, err.Error(), nil)
		if e != nil {
			r.logf("#%d gagal mencatat kegagalan: %v", job.ID, e)
		}
		status := "tidak diketahui"
		if hasil != nil {
			status = string(hasil.Status)
		}
		r.logf("#%d %s GAGAL (%s): %v", job.ID, job.Kind, status, err)
		return
	}

	if _, e := r.Queue.Complete(ctx, job.ID, me, resultRef); e != nil {
		r.logf("#%d gagal menandai selesai: %v", job.ID, e)
		return
	}
	r.logf("#%d %s selesai (%s)", job.ID, job.Kind, time.Since(mulai).Round(time.Millisecond))
}

// spec membaca sifat jalur dari kontrak; jalur tak dikenal = tanpa sifat
// (Run sudah menolaknya lebih dulu).
func spec(lane contract.JobLane) contract.LaneSpec { return contract.JobLanes[lane] }

// selangPagarMemori: seberapa sering heap diperiksa selama pekerjaan berpagar
// berjalan. Bukan angka antrean (tidak dibaca Node), jadi ia tidak di kontrak.
const selangPagarMemori = time.Second

// jagaMemori memeriksa heap tiap selangPagarMemori sampai `selesai`; begitu
// melewati `batas`, mencatat angkanya di `lewat` dan membatalkan pekerjaan.
func (r *Runner) jagaMemori(kerja context.Context, selesai <-chan struct{}, batas uint64, lewat *atomic.Uint64, batalkan context.CancelFunc) {
	baca := r.heapBytes
	if baca == nil {
		baca = heapProses
	}
	t := time.NewTicker(selangPagarMemori)
	defer t.Stop()
	for {
		select {
		case <-selesai:
			return
		case <-kerja.Done():
			return
		case <-t.C:
			if h := baca(); h > batas {
				lewat.Store(h)
				batalkan()
				return
			}
		}
	}
}

// heapProses: byte objek heap yang hidup — `runtime/metrics`, bukan
// `ReadMemStats` (yang menghentikan dunia sejenak di setiap pembacaan).
func heapProses() uint64 {
	s := []metrics.Sample{{Name: "/memory/classes/heap/objects:bytes"}}
	metrics.Read(s)
	if s[0].Value.Kind() != metrics.KindUint64 {
		return 0
	}
	return s[0].Value.Uint64()
}
