package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sort"
	"sync/atomic"
	"syscall"
	"time"

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
//  4. Jalur tunggal-instans dipagari advisory lock — lihat TryLaneLock.

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
}

func (r *Runner) logf(format string, args ...any) {
	l := r.Log
	if l == nil {
		l = log.Default()
	}
	l.Printf("["+string(r.Lane)+"] "+format, args...)
}

// WorkerID: cukup untuk menunjuk container yang memegang lease.
func WorkerID(lane contract.JobLane) string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "lokal"
	}
	return fmt.Sprintf("%s@%s:%d", lane, host, os.Getpid())
}

// Run menguras jalur ini sampai SIGTERM/SIGINT.
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

	if spec.SingleInstance {
		conn, dapat, err := r.Queue.TryLaneLock(ctx, r.Lane)
		if err != nil {
			return err
		}
		if !dapat {
			r.logf("instans lain sudah memegang jalur ini — keluar tanpa bekerja.")
			r.logf("  Jalur ini tunggal-instans di contract/kinds.yaml. Ini bukan galat.")
			return nil
		}
		defer conn.Release()
	}

	// SIGTERM membatalkan konteks BERHENTI, bukan konteks kerja: yang sedang
	// jalan diselesaikan, dan yang berhenti hanyalah pengklaiman berikutnya.
	berhenti, batalkanBerhenti := signal.NotifyContext(ctx, syscall.SIGTERM, syscall.SIGINT)
	defer batalkanBerhenti()

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

	r.logf("berhenti.")
	return nil
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
