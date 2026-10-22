package jobs

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// PAGAR JALUR YANG DIBUKTIKAN ULANG — padanan Go `@sai/db/session-lock`.
//
// ══ KENAPA MEMEGANG KONEKSI TIDAK CUKUP ════════════════════════════════════
// Kunci advisory milik SESI di server, bukan milik objek koneksi di proses
// ini. Sesi bisa mati tanpa proses ini tahu: PostgreSQL dimulai ulang,
// failover ke standby (HAProxy `on-marked-down shutdown-sessions` di overlay
// HA), jaringan putus lalu server membuang sesi lewat `idle_session_timeout`.
// Saat itu kuncinya BEBAS di server — dan pelari jalur `tenant` di host lain
// mengambilnya — sementara pelari lama terus mengklaim karena `*pgxpool.Conn`
// di tangannya masih berupa objek yang sah. Hasilnya dua pelari cadangan.
//
// ══ APA YANG DIBUKTIKAN TIAP DENYUT ════════════════════════════════════════
//  1. backend yang menjawab MASIH backend yang mengambil kunci
//     (`pg_backend_pid()` sama) — koneksi yang tersambung ulang diam-diam,
//     atau yang lewat pooler, menjawab dari backend lain;
//  2. kuncinya masih tercatat di `pg_locks` untuk backend itu.
// Denyut yang gagal, lambat melewati `contract.LaneLockQueryTimeout`, atau
// menjawab salah = kunci HILANG. Gagal tertutup, bukan gagal terbuka: denyut
// yang gagal karena jaringan sedang buruk tetap berarti kita tidak bisa
// membuktikan kepemilikan, dan pelari yang tidak bisa membuktikannya berhenti.
//
// Kebalikan dari perpanjangan lease (yang menelan galat sesaat): lease
// melindungi SATU pekerjaan dan punya ambang basi yang memberi ruang; pagar
// melindungi jalur seluruhnya, dan server sendiri yang memutuskan kapan
// kuncinya bebas — tidak ada ruang untuk ditunggu.

// ErrLaneLockLost: pagar jalur tunggal-instans tidak lagi terbukti dipegang.
var ErrLaneLockLost = errors.New("pagar jalur HILANG — kunci advisory tidak lagi terbukti dipegang sesi ini")

// lockConn adalah bagian koneksi yang dipakai denyut. `*pgxpool.Conn`
// memenuhinya; tes memakai tiruan, jadi jalan "kunci hilang" teruji tanpa
// basis data.
type lockConn interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// LaneLock adalah pagar jalur yang sedang dipegang.
type LaneLock struct {
	name string
	pid  int32
	conn lockConn
	// close menutup sesinya; lepasKunci=false bila kunci sudah hilang.
	close func(ctx context.Context, lepasKunci bool)

	probe   time.Duration
	timeout time.Duration

	mu       sync.Mutex
	err      error
	lost     chan struct{}
	released bool
}

func newLaneLock(name string, pid int32, conn lockConn, close func(context.Context, bool)) *LaneLock {
	return &LaneLock{
		name:    name,
		pid:     pid,
		conn:    conn,
		close:   close,
		probe:   contract.LaneLockProbe,
		timeout: contract.LaneLockQueryTimeout,
		lost:    make(chan struct{}),
	}
}

// Name adalah nama kunci (`sai.lane.<jalur>`).
func (l *LaneLock) Name() string { return l.name }

// Lost selesai saat kunci dinyatakan HILANG. Tidak pernah selesai karena
// Release.
func (l *LaneLock) Lost() <-chan struct{} { return l.lost }

// Err memulangkan sebab kehilangan (membungkus ErrLaneLockLost), atau nil.
func (l *LaneLock) Err() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.err
}

func (l *LaneLock) markLost(sebab error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.err != nil || l.released {
		return
	}
	l.err = fmt.Errorf("%w (%s): %w", ErrLaneLockLost, l.name, sebab)
	close(l.lost)
}

// Check menjalankan SATU denyut pembuktian. Galat = kunci hilang, dan sudah
// dicatat (Lost selesai).
func (l *LaneLock) Check(ctx context.Context) error {
	if err := l.Err(); err != nil {
		return err
	}
	c, batal := context.WithTimeout(ctx, l.timeout)
	defer batal()

	var pid int32
	var held bool
	err := l.conn.QueryRow(c,
		`SELECT pg_backend_pid(),
		        EXISTS (SELECT 1 FROM pg_locks
		                 WHERE locktype = 'advisory' AND granted
		                   AND pid = pg_backend_pid())`).Scan(&pid, &held)
	switch {
	case err != nil && ctx.Err() != nil:
		// Pemanggil yang berhenti (SIGTERM) bukan bukti kunci hilang.
		return nil
	case err != nil:
		l.markLost(fmt.Errorf("denyut gagal: %w", err))
	case pid != l.pid:
		l.markLost(fmt.Errorf("denyut dijawab backend %d, kunci diambil di backend %d", pid, l.pid))
	case !held:
		l.markLost(fmt.Errorf("kunci tidak lagi tercatat di pg_locks untuk backend %d", l.pid))
	}
	return l.Err()
}

// Watch membuktikan ulang kunci tiap `contract.LaneLockProbe` sampai ctx
// selesai atau kunci hilang. Memulangkan galat kehilangan, atau nil bila
// berhenti karena ctx.
func (l *LaneLock) Watch(ctx context.Context) error {
	t := time.NewTicker(l.probe)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-l.lost:
			return l.Err()
		case <-t.C:
			if err := l.Check(ctx); err != nil {
				return err
			}
		}
	}
}

// Release melepas kunci dan menutup sesinya. Aman dipanggil berulang.
func (l *LaneLock) Release(ctx context.Context) {
	l.mu.Lock()
	if l.released {
		l.mu.Unlock()
		return
	}
	l.released = true
	masihDipegang := l.err == nil
	l.mu.Unlock()
	if l.close != nil {
		l.close(ctx, masihDipegang)
	}
}
