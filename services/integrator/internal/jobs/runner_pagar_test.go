// PENJAGA dua tambahan pelari untuk jalur `schedule` & `bulk`: `Beside` hanya
// berjalan di PEMEGANG pagar, dan pagar memori membatalkan pekerjaan sebelum
// OOM-killer memilih korban. Tanpa basis data.
package jobs

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

func handlerKosong(Ctx) (*string, error) { return nil, nil }

// tickSaja: peta handler TIRUAN. Dirakit di luar literal `Runner` dengan
// sengaja — `tests/kind-punya-pengklaim.test.ts` membaca literal peta handler
// sebagai PENGKLAIM, dan tes bukan pengklaim yang digelar.
func tickSaja() map[contract.JobKind]Handler {
	return map[contract.JobKind]Handler{contract.KindScheduleTick: handlerKosong}
}

func TestBesideTIDAKBerjalanTanpaPagar(t *testing.T) {
	// Instans kedua jalur tunggal-instans: pagar dipegang orang lain. Denyut
	// yang tetap menerbitkan di instans ini adalah penerbit kedua.
	var jalan atomic.Bool
	r := &Runner{
		Lane:     contract.LaneSchedule,
		Handlers: tickSaja(),
		Beside:   func(context.Context) { jalan.Store(true) },
		tryLock: func(context.Context, contract.JobLane) (*LaneLock, bool, error) {
			return nil, false, nil
		},
	}
	if err := r.Run(context.Background()); err != nil {
		t.Fatalf("pagar milik instans lain bukan galat: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	if jalan.Load() {
		t.Fatal("Beside berjalan tanpa pagar")
	}
}

func TestPagarYangGagalDiambilMelempar(t *testing.T) {
	r := &Runner{
		Lane:     contract.LaneSchedule,
		Handlers: tickSaja(),
		Beside:   func(context.Context) { t.Error("Beside berjalan tanpa pagar") },
		tryLock: func(context.Context, contract.JobLane) (*LaneLock, bool, error) {
			return nil, false, errors.New("sambungan langsung ditolak")
		},
	}
	if err := r.Run(context.Background()); err == nil {
		t.Fatal("galat pagar ditelan")
	}
}

func TestPagarMemoriMembatalkanPekerjaan(t *testing.T) {
	r := &Runner{Lane: contract.LaneBulk, heapBytes: func() uint64 { return 600 << 20 }}
	kerja, batal := context.WithCancel(context.Background())
	defer batal()
	var lewat atomic.Uint64
	selesai := make(chan struct{})
	done := make(chan struct{})
	go func() { r.jagaMemori(kerja, selesai, 512<<20, &lewat, batal); close(done) }()
	select {
	case <-kerja.Done():
	case <-time.After(3 * selangPagarMemori):
		t.Fatal("pekerjaan di atas pagar tidak dibatalkan")
	}
	<-done
	if lewat.Load() != 600<<20 {
		t.Fatalf("angka heap tidak dicatat: %d", lewat.Load())
	}
}

func TestPagarMemoriDiamDiBawahBatas(t *testing.T) {
	r := &Runner{Lane: contract.LaneBulk, heapBytes: func() uint64 { return 100 << 20 }}
	kerja, batal := context.WithCancel(context.Background())
	defer batal()
	var lewat atomic.Uint64
	selesai := make(chan struct{})
	done := make(chan struct{})
	go func() { r.jagaMemori(kerja, selesai, 512<<20, &lewat, batal); close(done) }()
	time.Sleep(selangPagarMemori + 200*time.Millisecond)
	close(selesai)
	<-done
	if kerja.Err() != nil || lewat.Load() != 0 {
		t.Fatal("pekerjaan di bawah pagar dibatalkan")
	}
}

func TestPagarMemoriHanyaDiJalurYangMenyatakannya(t *testing.T) {
	// Jalur yang tidak menyatakan pagar TIDAK dipagari: ekspor `interactive`
	// yang sah dan besar tidak boleh mati karena angka milik jalur lain.
	if contract.JobLanes[contract.LaneBulk].MemoryFenceMiB <= 0 {
		t.Fatal("jalur bulk wajib berpagar memori di contract/kinds.yaml")
	}
	for _, l := range []contract.JobLane{contract.LaneInteractive, contract.LaneTenant, contract.LaneSchedule} {
		if contract.JobLanes[l].MemoryFenceMiB != 0 {
			t.Errorf("jalur %s berpagar memori tanpa keputusan", l)
		}
	}
}

func TestHeapProsesTerbaca(t *testing.T) {
	if heapProses() == 0 {
		t.Fatal("runtime/metrics tidak memulangkan heap — pagar memori buta")
	}
}
