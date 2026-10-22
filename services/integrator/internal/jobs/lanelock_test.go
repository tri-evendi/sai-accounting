// PENJAGA pagar jalur yang dibuktikan ulang: sesi yang mati sesudah failover
// harus terbaca sebagai kunci HILANG, dan pelari yang kehilangannya berhenti
// mengklaim. Tanpa basis data — koneksinya tiruan.
package jobs

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// jawaban satu denyut tiruan.
type jawaban struct {
	pid   int32
	held  bool
	err   error
	macet bool // menunggu sampai ctx habis, seperti server yang tak menjawab
}

type barisTiruan struct {
	ctx context.Context
	j   jawaban
}

func (b barisTiruan) Scan(dest ...any) error {
	if b.j.macet {
		<-b.ctx.Done()
		return b.ctx.Err()
	}
	if b.j.err != nil {
		return b.j.err
	}
	*dest[0].(*int32) = b.j.pid
	*dest[1].(*bool) = b.j.held
	return nil
}

// koneksiTiruan memulangkan jawaban berurutan; jawaban terakhir diulang.
type koneksiTiruan struct {
	mu      sync.Mutex
	jawaban []jawaban
	n       int
}

func (k *koneksiTiruan) QueryRow(ctx context.Context, _ string, _ ...any) pgx.Row {
	k.mu.Lock()
	defer k.mu.Unlock()
	i := k.n
	if i >= len(k.jawaban) {
		i = len(k.jawaban) - 1
	}
	k.n++
	return barisTiruan{ctx: ctx, j: k.jawaban[i]}
}

const pidPemegang int32 = 4242

type catatanTutup struct {
	mu         sync.Mutex
	dipanggil  int
	lepasKunci bool
}

func pagarTiruan(j ...jawaban) (*LaneLock, *catatanTutup) {
	c := &catatanTutup{}
	l := newLaneLock("sai.lane.tenant", pidPemegang, &koneksiTiruan{jawaban: j},
		func(_ context.Context, lepas bool) {
			c.mu.Lock()
			defer c.mu.Unlock()
			c.dipanggil++
			c.lepasKunci = lepas
		})
	l.probe = 5 * time.Millisecond
	l.timeout = 50 * time.Millisecond
	return l, c
}

func sehat() jawaban { return jawaban{pid: pidPemegang, held: true} }

func TestDenyutSehatTidakMenyatakanHilang(t *testing.T) {
	l, _ := pagarTiruan(sehat())
	for i := 0; i < 3; i++ {
		if err := l.Check(context.Background()); err != nil {
			t.Fatalf("denyut sehat ke-%d dinyatakan hilang: %v", i, err)
		}
	}
	select {
	case <-l.Lost():
		t.Fatal("Lost selesai padahal kunci sehat")
	default:
	}
}

func TestKunciHilangDariTigaArah(t *testing.T) {
	kasus := map[string]jawaban{
		// failover / koneksi tersambung ulang: backend lain yang menjawab
		"backend berganti": {pid: pidPemegang + 1, held: true},
		// sesi hidup tapi kuncinya sudah dilepas (pg_advisory_unlock_all, dll.)
		"tidak di pg_locks": {pid: pidPemegang, held: false},
		// PostgreSQL dimulai ulang: koneksinya mati
		"koneksi mati": {err: errors.New("conn closed")},
		// jaringan putus: server tak menjawab dalam batas waktu denyut
		"server tak menjawab": {macet: true},
	}
	for nama, j := range kasus {
		t.Run(nama, func(t *testing.T) {
			l, _ := pagarTiruan(j)
			err := l.Check(context.Background())
			if !errors.Is(err, ErrLaneLockLost) {
				t.Fatalf("galat %v, ingin ErrLaneLockLost", err)
			}
			select {
			case <-l.Lost():
			default:
				t.Fatal("Lost tidak selesai")
			}
			// Sekali hilang tetap hilang — denyut sehat sesudahnya tidak
			// menghidupkannya: kunci yang pernah lepas mungkin sudah diambil
			// instans lain.
			if !errors.Is(l.Err(), ErrLaneLockLost) {
				t.Fatal("Err() tidak menyebut kehilangan")
			}
		})
	}
}

func TestWatchMenangkapKehilanganSesudahDenyutSehat(t *testing.T) {
	l, _ := pagarTiruan(sehat(), sehat(), jawaban{pid: pidPemegang + 7, held: true})
	selesai := make(chan error, 1)
	go func() { selesai <- l.Watch(context.Background()) }()
	select {
	case err := <-selesai:
		if !errors.Is(err, ErrLaneLockLost) {
			t.Fatalf("Watch pulang %v, ingin ErrLaneLockLost", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Watch tidak pernah melaporkan kehilangan")
	}
}

func TestWatchYangDihentikanBukanKehilangan(t *testing.T) {
	l, _ := pagarTiruan(sehat())
	ctx, batal := context.WithCancel(context.Background())
	selesai := make(chan error, 1)
	go func() { selesai <- l.Watch(ctx) }()
	time.Sleep(20 * time.Millisecond)
	batal()
	if err := <-selesai; err != nil {
		t.Fatalf("berhenti yang diminta terbaca sebagai %v", err)
	}
	if l.Err() != nil {
		t.Fatal("berhenti yang diminta menandai kunci hilang")
	}
}

func TestReleaseMelepasKunciHanyaBilaMasihDipegang(t *testing.T) {
	l, c := pagarTiruan(sehat())
	l.Release(context.Background())
	l.Release(context.Background()) // aman berulang
	if c.dipanggil != 1 || !c.lepasKunci {
		t.Fatalf("pelepasan sehat: dipanggil=%d lepasKunci=%v", c.dipanggil, c.lepasKunci)
	}

	l2, c2 := pagarTiruan(jawaban{err: errors.New("conn closed")})
	_ = l2.Check(context.Background())
	l2.Release(context.Background())
	if c2.dipanggil != 1 || c2.lepasKunci {
		// Kunci yang sudah hilang mungkin kini milik instans lain di backend
		// yang sama-namanya; jangan coba melepasnya — cukup tutup sesinya.
		t.Fatalf("pelepasan sesudah hilang: dipanggil=%d lepasKunci=%v", c2.dipanggil, c2.lepasKunci)
	}
}

func TestPagarHilangMenghentikanPengklaiman(t *testing.T) {
	// Jalan yang dipakai `Run`: konteks BERHENTI dibatalkan begitu kunci hilang,
	// jadi putaran klaim tidak mengambil pekerjaan berikutnya.
	l, _ := pagarTiruan(sehat(), jawaban{pid: pidPemegang, held: false})
	r := &Runner{Lane: contract.LaneTenant}
	berhenti, hentikan := context.WithCancel(context.Background())
	defer hentikan()
	r.jagaPagar(berhenti, hentikan, l)
	select {
	case <-berhenti.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("pagar hilang tetapi pengklaiman tidak dihentikan")
	}
	if !errors.Is(l.Err(), ErrLaneLockLost) {
		t.Fatalf("Err() = %v — Run akan pulang nil dan proses keluar 0", l.Err())
	}
}

func TestDenyutPagarDariKontrak(t *testing.T) {
	l := newLaneLock("x", 1, &koneksiTiruan{jawaban: []jawaban{sehat()}}, nil)
	if l.probe != contract.LaneLockProbe || l.timeout != contract.LaneLockQueryTimeout {
		t.Fatal("waktu denyut bukan dari kontrak")
	}
	// Pemegang lama wajib tahu lebih dulu daripada server membebaskan kuncinya.
	if contract.LaneLockProbe+contract.LaneLockQueryTimeout >= contract.LaneLockIdleSession {
		t.Fatal("probe + query_timeout tidak di bawah idle_session")
	}
}
