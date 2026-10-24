// PENJAGA janji `svc-integrator`: satu jalur berakhir → jalur lain dihentikan
// → proses keluar BUKAN-NOL. Kebalikannya — proses yang tetap hidup dengan
// satu jalur mati — adalah container "Up" tanpa cadangan (#374).
package main

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/bulklane"
)

func namaJalur(d []pelari) []string {
	var n []string
	for _, p := range d {
		n = append(n, p.nama)
	}
	return n
}

func TestJalurScheduleSelaluIkutBulkHanyaBilaPunyaKind(t *testing.T) {
	// `schedule` ikut walau Node masih penerbitnya: peralihan ke Go cukup satu
	// baris kontrak, bukan perubahan compose. `bulk` tanpa kind = kode mati
	// yang terlihat hidup, jadi tidak dijalankan.
	if got := fmt.Sprint(namaJalur(daftarJalur(false))); got != "[tenant interactive-go schedule integration]" {
		t.Fatalf("jalur tanpa bulk: %s", got)
	}
	if got := fmt.Sprint(namaJalur(daftarJalur(true))); got != "[tenant interactive-go schedule integration bulk]" {
		t.Fatalf("jalur dengan bulk: %s", got)
	}
	// Sejak 23 Okt 2026 jalur `bulk` punya kind pertamanya (`tenant.data_export`,
	// #142) — jadi `svc-integrator` menjalankannya. Kind terakhir yang dicabut
	// mematikannya lagi, dan tes ini yang menyebutnya.
	if !bulklane.Enabled() {
		t.Fatal("bulklane tanpa kind — perbarui tes ini, 09 §3.2, dan kepala internal/bulklane")
	}
}

// menunggu: pelari palsu yang hidup sampai `stop` selesai, lalu mencatatnya.
func menunggu(dihentikan *bool) func(ctx, stop context.Context) error {
	return func(_, stop context.Context) error {
		select {
		case <-stop.Done():
			*dihentikan = true
			return nil
		case <-time.After(5 * time.Second):
			return errors.New("tidak pernah dihentikan")
		}
	}
}

func TestSatuJalurGagalMenghentikanYangLainDanKeluarBukanNol(t *testing.T) {
	var dihentikan bool
	kode := jalankan(context.Background(), context.Background(), []pelari{
		{"tenant", func(context.Context, context.Context) error { return errors.New("pg tak terjangkau") }},
		{"interactive-go", menunggu(&dihentikan)},
	})
	if kode == 0 {
		t.Fatal("kode keluar 0 padahal satu jalur gagal")
	}
	if !dihentikan {
		t.Fatal("jalur saudara tidak dihentikan")
	}
}

func TestJalurYangBerakhirRapiTanpaDimintaTetapBukanNol(t *testing.T) {
	// Pagar `tenant` dipegang instans lain → pelari pulang nil tanpa bekerja.
	// Proses yang terus hidup tanpa jalur cadangan terbaca sehat.
	var dihentikan bool
	kode := jalankan(context.Background(), context.Background(), []pelari{
		{"tenant", func(context.Context, context.Context) error { return nil }},
		{"interactive-go", menunggu(&dihentikan)},
	})
	if kode == 0 {
		t.Fatal("kode keluar 0 padahal satu jalur berakhir tanpa diminta")
	}
	if !dihentikan {
		t.Fatal("jalur saudara tidak dihentikan")
	}
}

func TestBerhentiYangDimintaKeluarNol(t *testing.T) {
	diminta, minta := context.WithCancel(context.Background())
	// Kedua pelari berhenti karena "SIGTERM" — di sini: `diminta` selesai.
	pelariSinyal := func(context.Context, context.Context) error {
		<-diminta.Done()
		return nil
	}
	go func() {
		time.Sleep(20 * time.Millisecond)
		minta()
	}()
	kode := jalankan(context.Background(), diminta, []pelari{
		{"tenant", pelariSinyal},
		{"interactive-go", pelariSinyal},
	})
	if kode != 0 {
		t.Fatalf("berhenti yang diminta keluar dengan kode %d", kode)
	}
}
