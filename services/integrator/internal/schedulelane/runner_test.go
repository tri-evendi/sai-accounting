// PERILAKU denyut tanpa basis data: kapan tick terbit, apa yang diterbitkan
// tick, dan bahwa tidak ada yang terbit selama Node penerbitnya.
package schedulelane

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

// antreanTiruan meniru `ON CONFLICT (dedupe_key) DO NOTHING`.
type antreanTiruan struct {
	mu     sync.Mutex
	kunci  map[string]bool
	urutan []jobs.Publication
	gagal  map[string]error // dedupeKey → galat sekali
}

func (a *antreanTiruan) Publish(_ context.Context, p jobs.Publication) (int64, bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err, ada := a.gagal[p.DedupeKey]; ada {
		delete(a.gagal, p.DedupeKey)
		return 0, false, err
	}
	if a.kunci == nil {
		a.kunci = map[string]bool{}
	}
	if a.kunci[p.DedupeKey] {
		return 0, false, nil
	}
	a.kunci[p.DedupeKey] = true
	a.urutan = append(a.urutan, p)
	return int64(len(a.urutan)), true, nil
}

func (a *antreanTiruan) kunciTerbit() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	var k []string
	for _, p := range a.urutan {
		k = append(k, p.DedupeKey)
	}
	return k
}

func jamTiruan(t time.Time) (func() time.Time, func(time.Duration)) {
	var mu sync.Mutex
	return func() time.Time {
			mu.Lock()
			defer mu.Unlock()
			return t
		}, func(d time.Duration) {
			mu.Lock()
			defer mu.Unlock()
			t = t.Add(d)
		}
}

func TestDenyutTIDAKMenerbitkanSelamaNodePenerbitnya(t *testing.T) {
	// Bawaan kontrak: Node penerbit semuanya. Denyut Go yang tetap menerbitkan
	// tick di keadaan itu adalah jejak palsu "Go sedang menerbitkan".
	a := &antreanTiruan{}
	now, _ := jamTiruan(time.Date(2026, 10, 23, 5, 0, 0, 0, time.UTC))
	d := &denyut{terbit: a, milik: nil, now: now, selang: time.Millisecond}
	ctx, batal := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer batal()
	d.beat(ctx) // pulang SEGERA, tanpa menunggu ctx
	if ctx.Err() != nil {
		t.Fatal("beat tanpa kind milik Go seharusnya pulang segera")
	}
	if n := len(a.kunciTerbit()); n != 0 {
		t.Fatalf("%d baris terbit padahal Node penerbitnya", n)
	}
}

func TestTickTerbitSekaliPerJamUTC(t *testing.T) {
	a := &antreanTiruan{}
	now, maju := jamTiruan(time.Date(2026, 10, 23, 16, 58, 0, 0, time.UTC))
	d := &denyut{terbit: a, milik: []contract.JobKind{contract.KindTenantBackup}, now: now}
	ctx := context.Background()

	terakhir := d.periksa(ctx, "")
	maju(time.Minute) // 16:59 — jam yang sama
	terakhir = d.periksa(ctx, terakhir)
	maju(time.Minute) // 17:00 UTC (= 00:00 WIB) — jam berikutnya
	terakhir = d.periksa(ctx, terakhir)
	_ = d.periksa(ctx, terakhir)

	got := strings.Join(a.kunciTerbit(), ",")
	want := "schedule.tick:2026-10-23T16,schedule.tick:2026-10-23T17"
	if got != want {
		t.Fatalf("tick terbit %q, diharap %q", got, want)
	}
}

func TestTickYangGagalDiterbitkanDicobaLagi(t *testing.T) {
	a := &antreanTiruan{gagal: map[string]error{"schedule.tick:2026-10-23T05": errors.New("pooler mati")}}
	now, _ := jamTiruan(time.Date(2026, 10, 23, 5, 0, 30, 0, time.UTC))
	d := &denyut{terbit: a, milik: []contract.JobKind{contract.KindTenantBackup}, now: now}
	terakhir := d.periksa(context.Background(), "")
	if terakhir != "" {
		t.Fatalf("butir %q dicatat padahal penerbitannya gagal", terakhir)
	}
	if terakhir = d.periksa(context.Background(), terakhir); terakhir != "2026-10-23T05" {
		t.Fatalf("pemeriksaan berikutnya tidak mencoba lagi: %q", terakhir)
	}
}

func TestBeatBerhentiBersamaKonteksnya(t *testing.T) {
	a := &antreanTiruan{}
	now, _ := jamTiruan(time.Date(2026, 10, 23, 5, 0, 0, 0, time.UTC))
	d := &denyut{terbit: a, milik: []contract.JobKind{contract.KindTenantBackup}, now: now, selang: time.Millisecond}
	ctx, batal := context.WithCancel(context.Background())
	selesai := make(chan struct{})
	go func() { d.beat(ctx); close(selesai) }()
	time.Sleep(10 * time.Millisecond)
	batal()
	select {
	case <-selesai:
	case <-time.After(time.Second):
		t.Fatal("beat tidak berhenti saat konteksnya selesai — penerbit yang hidup sesudah pagarnya lepas")
	}
	if n := len(a.kunciTerbit()); n != 1 {
		t.Fatalf("%d tick dalam satu jam, diharap 1", n)
	}
}

func ctxTiruan(id int64) jobs.Ctx {
	return jobs.Ctx{Ctx: context.Background(), Job: &jobs.Job{ID: id, Kind: contract.KindScheduleTick}}
}

func TestTickMenerbitkanKindMilikGoDenganKunciKontrak(t *testing.T) {
	a := &antreanTiruan{}
	at := time.Date(2026, 10, 23, 17, 0, 0, 5_000_000, time.UTC)
	d := &denyut{
		terbit:     a,
		perusahaan: func(context.Context) ([]Company, error) { return []Company{{ID: 1}, {ID: 4}}, nil },
		milik:      []contract.JobKind{contract.KindLedgerRecurring, contract.KindTenantBackup},
		now:        func() time.Time { return at },
	}
	if _, err := d.tick(ctxTiruan(9)); err != nil {
		t.Fatal(err)
	}
	got := strings.Join(a.kunciTerbit(), ",")
	want := "ledger.recurring:1:2026-10-23T17,ledger.recurring:4:2026-10-23T17,tenant.backup:2026-10-23"
	if got != want {
		t.Fatalf("terbit %q, diharap %q", got, want)
	}
	// Tick kedua di jam yang sama: semuanya menabrak kunci — nol baris baru.
	if _, err := d.tick(ctxTiruan(10)); err != nil {
		t.Fatal(err)
	}
	if n := len(a.kunciTerbit()); n != 3 {
		t.Fatalf("tick ulang menerbitkan lagi: %d baris", n)
	}
	var m map[string]any
	if err := json.Unmarshal(a.urutan[0].Payload, &m); err != nil {
		t.Fatal(err)
	}
	if m["today"] != "2026-10-23T17:00:00.005Z" || m["companyId"] != float64(1) {
		t.Fatalf("muatan %v", m)
	}
}

func TestTickTanpaKindMilikGoTidakMenerbitkan(t *testing.T) {
	// Tick lama yang tertinggal sesudah penerbit dikembalikan ke Node.
	a := &antreanTiruan{}
	d := &denyut{terbit: a, now: time.Now}
	if _, err := d.tick(ctxTiruan(1)); err != nil {
		t.Fatal(err)
	}
	if n := len(a.kunciTerbit()); n != 0 {
		t.Fatalf("%d baris terbit", n)
	}
}

func TestSatuPenerbitanGagalTidakMenelanYangLain(t *testing.T) {
	at := time.Date(2026, 10, 23, 5, 0, 0, 0, time.UTC)
	a := &antreanTiruan{gagal: map[string]error{"ledger.recurring:1:2026-10-23T05": errors.New("putus")}}
	d := &denyut{
		terbit:     a,
		perusahaan: func(context.Context) ([]Company, error) { return []Company{{ID: 1}, {ID: 2}}, nil },
		milik:      []contract.JobKind{contract.KindLedgerRecurring},
		now:        func() time.Time { return at },
	}
	_, err := d.tick(ctxTiruan(3))
	if err == nil || !strings.Contains(err.Error(), "1 penerbitan gagal") {
		t.Fatalf("tick yang sebagian gagal harus GAGAL (jejaknya `dead`): %v", err)
	}
	if got := strings.Join(a.kunciTerbit(), ","); got != "ledger.recurring:2:2026-10-23T05" {
		t.Fatalf("perusahaan berikutnya tidak diterbitkan: %q", got)
	}
}

func TestRegistryYangGagalDibacaMenggagalkanTick(t *testing.T) {
	a := &antreanTiruan{}
	d := &denyut{
		terbit:     a,
		perusahaan: func(context.Context) ([]Company, error) { return nil, errors.New("pooler mati") },
		milik:      []contract.JobKind{contract.KindLedgerRecurring},
		now:        time.Now,
	}
	if _, err := d.tick(ctxTiruan(4)); err == nil {
		t.Fatal("registry yang tak terbaca diterbitkan sebagai 'nol perusahaan'")
	}
}

func TestJalurScheduleTunggalInstansDiKontrak(t *testing.T) {
	// Denyut ganda = penerbit ganda. `dedupe_key` menahan baris gandanya, tapi
	// pagar inilah yang membuat hanya SATU proses yang menerbitkan.
	if !contract.JobLanes[contract.LaneSchedule].SingleInstance {
		t.Fatal("jalur schedule harus single_instance di contract/kinds.yaml")
	}
	if contract.JobKinds[contract.KindScheduleTick].MaxAttempts != 1 {
		t.Fatal("schedule.tick: max_attempts harus 1 — jam berikutnya yang menyusul")
	}
}
