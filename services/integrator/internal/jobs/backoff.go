// Package jobs adalah SATU-SATUNYA tempat SQL antrean di pohon Go.
//
// Padanannya di sisi Node `packages/platform/src/job-queue.ts`, dan keduanya
// wajib menyatakan hal yang sama tentang satu tabel. Yang membuat itu mungkin:
// kosakata dan ANGKA-nya dibangkitkan dari `contract/kinds.yaml` — tidak satu
// pun angka di berkas-berkas paket ini ditulis tangan.
//
// Sifat yang dijaganya ada di docs/arsitektur/04-ALIRAN-DATA.md §8.9.
package jobs

import (
	"math"
	"math/rand"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Backoff memulangkan penundaan sebelum percobaan ke-attempt-plus-satu.
//
// attempt adalah jumlah percobaan yang SUDAH gagal (≥ 1). acak adalah sumber
// jitter 0..1; disuntik di tes.
//
// Angka yang keliru di sini tidak membuat apa pun gagal — ia hanya membuat
// pekerjaan diulang terlalu cepat (membanjiri layanan luar yang sedang pulih)
// atau terlalu lambat (pengguna menunggu tanpa sebab). Keduanya mustahil
// dilihat dari log.
func Backoff(attempt int, acak func() float64) time.Duration {
	if acak == nil {
		// Sumber bawaan, supaya pemanggil yang tidak peduli jitter tidak perlu
		// menyuntik apa pun — dan supaya `nil` tidak pernah menjadi panic di
		// jalur kegagalan, yaitu justru jalur yang paling jarang diuji.
		acak = rand.Float64 //nolint:gosec // jitter, bukan kripto
	}
	n := attempt
	if n < 1 {
		n = 1
	}

	// Pangkatnya dibatasi SEBELUM dikali supaya percobaan ke-40 tidak
	// menghasilkan durasi yang meluap — kelihatan mustahil, tapi max_attempts
	// adalah angka di kontrak yang bisa dinaikkan orang tanpa memikirkan ini.
	plafon := float64(contract.BackoffMax) / float64(contract.BackoffBase)
	faktor := math.Min(math.Pow(2, float64(n-1)), plafon)
	dasar := math.Min(float64(contract.BackoffBase)*faktor, float64(contract.BackoffMax))

	// Jitter ±25%, dan ia bukan hiasan: tanpanya sepuluh pekerjaan yang gagal
	// bersama (satu layanan luar mati) akan mencoba lagi pada MILIDETIK yang
	// sama, berulang-ulang — memukul layanan yang sedang pulih dengan gelombang
	// yang persis seirama. Itu thundering herd, dan ia memperpanjang pemadaman
	// yang seharusnya sudah lewat.
	jitter := dasar * 0.25 * (acak()*2 - 1)

	d := time.Duration(math.Round(dasar + jitter))
	if d < time.Second {
		return time.Second
	}
	return d
}

// IsDead melaporkan apakah percobaan berikutnya masih ada.
func IsDead(attempts, maxAttempts int) bool {
	return attempts >= maxAttempts
}

// QueueAge adalah umur pekerjaan tertua yang menunggu — sinyal utama (02 §14).
//
// Yang diukur UMUR, bukan JUMLAH yang menunggu. Bedanya menentukan: seribu
// pekerjaan yang semuanya selesai dalam dua detik adalah sistem yang sehat,
// sementara SATU pekerjaan yang menunggu empat jam adalah sistem yang rusak —
// dan metrik jumlah membaca keduanya terbalik.
//
// Waktu di masa depan memulangkan nol, bukan durasi negatif: `run_after` boleh
// di masa depan (backoff), dan umur negatif akan terbaca sebagai sehat oleh
// gerbang mana pun yang membandingkannya dengan ambang.
func QueueAge(tertuaDiterbitkan time.Time, sekarang time.Time) time.Duration {
	if tertuaDiterbitkan.IsZero() {
		return 0
	}
	d := sekarang.Sub(tertuaDiterbitkan)
	if d < 0 {
		return 0
	}
	return d
}
