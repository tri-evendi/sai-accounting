// PENJAGA aritmetika antrean, sisi Go.
//
// ══ KENAPA ANGKA YANG SAMA DIUJI DI DUA BAHASA ═════════════════════════════
// `tests/contract-jobs.test.ts` sudah menguji aritmetika yang sama di sisi
// Node, dan itu BUKAN pengulangan: yang diuji di sana implementasi TypeScript,
// yang diuji di sini implementasi Go. Angkanya memang satu — dibangkitkan dari
// `contract/kinds.yaml` — tapi dua implementasi bisa sama-sama konsisten di
// dalam dirinya dan tetap berbeda hasilnya, dan itulah kelas kegagalan yang
// paling mahal di rancangan poliglot ini (§3.3).
//
// Yang TIDAK diuji di sini: SQL. Ia menuntut basis data, dan bentuknya dijaga
// `tests/services-go.test.ts` dengan idiom yang sama seperti
// `tests/backup-script.test.ts` — yang diperiksa bukan "apakah jalan"
// melainkan sifat yang kalau hilang tidak menghasilkan galat apa pun.
package jobs

import (
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// tetap memberi jitter nol, supaya yang diuji dasarnya dan bukan keacakannya.
func tetap() float64 { return 0.5 }

func TestBackoffNaikEksponensial(t *testing.T) {
	kasus := []struct {
		attempt int
		mau     time.Duration
	}{
		{1, contract.BackoffBase},
		{2, contract.BackoffBase * 2},
		{3, contract.BackoffBase * 4},
		{4, contract.BackoffBase * 8},
	}
	for _, k := range kasus {
		if got := Backoff(k.attempt, tetap); got != k.mau {
			t.Errorf("Backoff(%d) = %v, mau %v", k.attempt, got, k.mau)
		}
	}
}

func TestBackoffBerplafon(t *testing.T) {
	// Percobaan yang sangat besar tidak boleh meluap. `max_attempts` adalah
	// angka di kontrak yang bisa dinaikkan orang tanpa memikirkan ini.
	for _, n := range []int{40, 1000, 1 << 20} {
		got := Backoff(n, tetap)
		if got != contract.BackoffMax {
			t.Errorf("Backoff(%d) = %v, mau plafon %v", n, got, contract.BackoffMax)
		}
		if got <= 0 {
			t.Errorf("Backoff(%d) = %v — durasi meluap jadi non-positif", n, got)
		}
	}
}

func TestBackoffJitterSeperempat(t *testing.T) {
	bawah := Backoff(1, func() float64 { return 0 })
	atas := Backoff(1, func() float64 { return 1 })
	if bawah >= contract.BackoffBase {
		t.Errorf("jitter bawah %v tidak di bawah dasar %v", bawah, contract.BackoffBase)
	}
	if atas <= contract.BackoffBase {
		t.Errorf("jitter atas %v tidak di atas dasar %v", atas, contract.BackoffBase)
	}
	// Rentang total ±25% = separuh dasar, dengan toleransi pembulatan.
	if lebar := atas - bawah; lebar > contract.BackoffBase/2+2 {
		t.Errorf("rentang jitter %v melampaui separuh dasar", lebar)
	}
}

func TestBackoffTidakPernahDiBawahSatuDetik(t *testing.T) {
	// Penundaan nol berarti pekerjaan yang gagal diulang dalam putaran yang
	// sama — satu layanan luar yang mati akan dipukul tanpa jeda sama sekali.
	for _, n := range []int{-99, -1, 0, 1} {
		if got := Backoff(n, func() float64 { return 0 }); got < time.Second {
			t.Errorf("Backoff(%d) = %v, di bawah satu detik", n, got)
		}
	}
}

func TestBackoffNilAcakTidakPanic(t *testing.T) {
	// `nil` datang dari jalur kegagalan, yang justru jalur paling jarang diuji.
	if got := Backoff(1, nil); got <= 0 {
		t.Errorf("Backoff(1, nil) = %v", got)
	}
}

func TestIsDeadHabisTepatPadaPercobaanTerakhir(t *testing.T) {
	if IsDead(2, 3) {
		t.Error("percobaan 2 dari 3 sudah dianggap mati")
	}
	if !IsDead(3, 3) {
		t.Error("percobaan 3 dari 3 belum dianggap mati")
	}
	if !IsDead(4, 3) {
		t.Error("percobaan melampaui plafon belum dianggap mati")
	}
}

func TestQueueAge(t *testing.T) {
	now := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)

	if got := QueueAge(time.Time{}, now); got != 0 {
		t.Errorf("antrean kosong berumur %v, mau 0", got)
	}
	if got := QueueAge(now.Add(-30*time.Minute), now); got != 30*time.Minute {
		t.Errorf("umur = %v, mau 30m", got)
	}
	// `run_after` boleh di masa depan (backoff), dan umur negatif akan terbaca
	// sebagai sehat oleh gerbang mana pun yang membandingkannya dengan ambang.
	if got := QueueAge(now.Add(time.Hour), now); got != 0 {
		t.Errorf("umur masa depan = %v, mau 0", got)
	}
}

func TestAmbangLeaseKelipatanInterval(t *testing.T) {
	// Ambang yang diturunkan dari "berapa lama pekerjaan ini biasanya" selalu
	// salah untuk cadangan 30 menit: ia melewati ambang mana pun yang masuk akal
	// untuk mendeteksi pekerja mati, lalu diklaim pekerja kedua sementara yang
	// pertama masih berjalan.
	if contract.LeaseStale != contract.LeaseRenew*contract.LeaseStaleFactor {
		t.Fatalf("LeaseStale %v bukan LeaseRenew × faktor", contract.LeaseStale)
	}
	if contract.LeaseStaleFactor < 3 {
		t.Errorf("faktor %d tidak memberi ruang untuk beberapa pembaruan yang terlewat",
			contract.LeaseStaleFactor)
	}
}

func TestUpkeepLebihRapatDaripadaAmbangBasi(t *testing.T) {
	// Putaran pemeliharaan yang lebih jarang daripada ambang basi berarti
	// pekerjaan dari pekerja yang mati menunggu satu putaran penuh LAGI sesudah
	// lease-nya kedaluwarsa — dan waktu tunggu itu tidak muncul di satu pun
	// angka. Generator kontraknya sudah menolak kombinasi ini; penjaga di sini
	// memastikan sisi Go memakai angka yang SAMA, bukan salinannya.
	if contract.Upkeep >= contract.LeaseStale {
		t.Errorf("Upkeep %v tidak lebih rapat daripada LeaseStale %v",
			contract.Upkeep, contract.LeaseStale)
	}
}
