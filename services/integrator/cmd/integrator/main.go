// SVC-INTEGRATOR — jalur `tenant` dan jalur `interactive` sisi Go dalam SATU
// proses (keputusan pemilik 22 Okt 2026: "1 image = 1 container").
//
//	svc-integrator   # di compose; `go run ./cmd/integrator` saat mengembangkan
//
// Image `-integrator` dulu menjalankan dua container dari dua biner
// (`svc-tenant`, `svc-interactive`). Kini satu biner menjalankan kedua pelari
// bersamaan; logikanya tetap di `internal/tenantlane` dan
// `internal/interactivelane`, tidak disalin ke sini.
//
// ══ SATU PELARI BERAKHIR → PROSES BERAKHIR BUKAN-NOL ═════════════════════
// Proses yang tetap hidup dengan satu jalur yang sudah mati adalah kegagalan
// paling senyap yang bisa dibuat penyatuan ini: container "Up", ekspor jalan,
// dan cadangan berhenti sejak kemarin — persis bentuk 26 hari tanpa cadangan
// di #374. Jadi pelari yang berakhir SEBELUM proses diminta berhenti —
// karena galat, atau karena pagar jalur `tenant` dipegang instans lain —
// menghentikan saudaranya (lewat `Stop`: berhenti mengklaim, pekerjaan yang
// sedang jalan diselesaikan) lalu proses keluar dengan kode 1.
// `restart: unless-stopped` menghidupkan keduanya utuh.
//
// SIGTERM/SIGINT diterima KEDUA pelari sendiri-sendiri (`signal.NotifyContext`
// di `internal/jobs`) — pola yang sudah berlaku sebelum penyatuan.
//
// ══ DUA SAMBUNGAN, BUKAN SATU ══════════════════════════════════════════════
// Jalur `tenant` memakai `CONTROL_DATABASE_DIRECT_URL` (langsung ke `pg`);
// jalur `interactive` memakai `CONTROL_DATABASE_URL` (PgBouncer). Keduanya
// sengaja tidak disatukan — alasannya di `internal/db/dsn.go`.
//
// ══ RAHASIA CADANGAN SEPROSES DENGAN MASUKAN PENGGUNA ═════════════════════
// Diputuskan pemilik dengan sadar; risikonya dan syarat memisahkannya lagi di
// docs/arsitektur/09-RANCANGAN-LAYANAN.md §3.2.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/buildinfo"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/interactivelane"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/tenantlane"
)

// pelari adalah satu jalur yang dijalankan proses ini.
type pelari struct {
	nama string
	run  func(ctx, stop context.Context) error
}

func main() {
	// Stempel build sekali per proses; tiap jalur mencetaknya lagi saat mulai
	// (`jobs.Runner.Run`), supaya log yang disaring per jalur pun menyebutnya.
	log.Printf("[integrator] %s", buildinfo.Get().Banner(buildinfo.Service))
	diminta, lepas := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer lepas()
	kode := jalankan(context.Background(), diminta, []pelari{
		{"tenant", tenantlane.Run},
		{"interactive-go", interactivelane.Run},
	})
	lepas()
	os.Exit(kode)
}

// sinyalTerlambat: jeda untuk pelari yang pulang nil, sebelum ia dinilai
// "berakhir tanpa diminta". SIGTERM disampaikan ke setiap pendengar satu per
// satu, jadi pelari bisa pulang sedikit LEBIH DULU daripada `diminta`
// mendengarnya — dan berhenti yang sah tidak boleh terbaca sebagai kematian.
const sinyalTerlambat = 200 * time.Millisecond

// jalankan menjalankan setiap pelari bersamaan dan memulangkan kode keluar
// proses. `diminta` selesai saat proses diminta berhenti dari luar. Dipisah
// dari `main` supaya janjinya diuji tanpa basis data (`main_test.go`).
func jalankan(ctx, diminta context.Context, daftar []pelari) int {
	// `stop` diserahkan ke setiap pelari: selesai saat SATU pelari berakhir.
	stop, hentikan := context.WithCancel(ctx)
	defer hentikan()

	type akhir struct {
		nama string
		err  error
	}
	selesai := make(chan akhir, len(daftar))
	for _, p := range daftar {
		go func() {
			selesai <- akhir{p.nama, p.run(ctx, stop)}
		}()
	}

	kode := 0
	for range daftar {
		a := <-selesai
		saudaraDihentikan := stop.Err() != nil
		if a.err == nil && !saudaraDihentikan && diminta.Err() == nil {
			select {
			case <-diminta.Done():
			case <-time.After(sinyalTerlambat):
			}
		}
		switch {
		case a.err != nil:
			log.Printf("[integrator] jalur %s GAGAL: %v", a.nama, a.err)
			kode = 1
		case !saudaraDihentikan && diminta.Err() == nil:
			// Berakhir tanpa galat dan tanpa diminta — mis. pagar jalur
			// `tenant` dipegang instans lain. Jalur itu kosong di proses ini,
			// dan proses yang terus hidup tanpanya terbaca sehat.
			log.Printf("[integrator] jalur %s BERAKHIR tanpa diminta", a.nama)
			kode = 1
		}
		if !saudaraDihentikan && diminta.Err() == nil {
			log.Printf("[integrator] menghentikan jalur lain; proses keluar bukan-nol supaya container dimulai ulang utuh")
		}
		hentikan()
	}
	if kode == 0 {
		log.Printf("[integrator] berhenti.")
	}
	return kode
}
