package integrationlane

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/efaktur"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// ── Tiruan buku & antrean ──────────────────────────────────────────────────

type bukuTiruan struct {
	subs     map[int64]*ledgerread.EfakturSubmission
	settings ledgerread.EfakturSettings
}

func (b *bukuTiruan) EfakturSubmission(_ context.Context, id int64) (*ledgerread.EfakturSubmission, error) {
	s, ada := b.subs[id]
	if !ada {
		return nil, ledgerread.ErrNoSubmission
	}
	salinan := *s
	return &salinan, nil
}
func (b *bukuTiruan) EfakturSettings(context.Context) (*ledgerread.EfakturSettings, error) {
	s := b.settings
	return &s, nil
}
func (b *bukuTiruan) Close() {}

// antreanTiruan: menyimpan terbitan, menolak dedupe ganda — seperti
// `ON CONFLICT (dedupe_key) DO NOTHING`.
type antreanTiruan struct {
	baris []jobs.Publication
	kunci map[string]bool
}

func (a *antreanTiruan) terbitkan(_ context.Context, p jobs.Publication) (int64, bool, error) {
	if a.kunci == nil {
		a.kunci = map[string]bool{}
	}
	if a.kunci[p.DedupeKey] {
		return 0, false, nil
	}
	a.kunci[p.DedupeKey] = true
	a.baris = append(a.baris, p)
	return int64(len(a.baris)), true, nil
}

var jamUji = time.Date(2026, 10, 23, 3, 0, 0, 0, time.UTC)

const companyUji int32 = 3

func depsUji(b *bukuTiruan, a *antreanTiruan) Deps {
	return Deps{
		Buka:      func(context.Context, *int32) (Buku, error) { return b, nil },
		Terbitkan: a.terbitkan,
		Penyedia:  efaktur.New,
		Getenv:    func(string) string { return "" },
		Sekarang:  func() time.Time { return jamUji },
		Jeda:      func(n int) time.Duration { return time.Duration(n) * time.Minute },
	}
}

func ctxUji(kind contract.JobKind, id int64, attempts int, muatan any) jobs.Ctx {
	raw, _ := json.Marshal(muatan)
	cid := companyUji
	return jobs.Ctx{
		Ctx:      context.Background(),
		Job:      &jobs.Job{ID: id, Kind: kind, CompanyID: &cid, Payload: raw, Attempts: attempts, MaxAttempts: contract.JobKinds[kind].MaxAttempts},
		Payload:  raw,
		Progress: func(int) error { return nil },
	}
}

const xmlUji = `<?xml version="1.0" encoding="utf-8" ?>
<TaxInvoiceBulk><TIN>0012345678901000</TIN><ListOfTaxInvoice><TaxInvoice><BuyerName>%s</BuyerName></TaxInvoice></ListOfTaxInvoice></TaxInvoiceBulk>`

func kiriman(id int64, buyer string) *ledgerread.EfakturSubmission {
	return &ledgerread.EfakturSubmission{
		ID: id, InvoiceID: 40 + id, IdempotencyKey: "sai-3-inv" + string(rune('0'+id)) + "-r1",
		Provider: string(contract.EfakturProviderMock), Status: string(contract.EfakturStatusQueued),
		XML: strings.Replace(xmlUji, "%s", buyer, 1),
	}
}

// jalankan menguras antrean tiruan: kind Go dikerjakan handler-nya, dan
// `efaktur.record` diterapkan seperti pelari Node (status, rujukan) — cukup
// untuk membuktikan alur ujung-ke-ujung tanpa basis data.
func jalankan(t *testing.T, d Deps, b *bukuTiruan, a *antreanTiruan, dari int) []MuatanCatat {
	t.Helper()
	var catatan []MuatanCatat
	handlers := map[contract.JobKind]jobs.Handler{
		contract.KindIntegrationEfakturSubmit: d.kirim,
		contract.KindIntegrationEfakturPoll:   d.tanya,
		contract.KindIntegrationEfakturCancel: d.batal,
	}
	for i := dari; i < len(a.baris); i++ {
		p := a.baris[i]
		if p.Kind == contract.KindEfakturRecord {
			var m MuatanCatat
			if err := json.Unmarshal(p.Payload, &m); err != nil {
				t.Fatal(err)
			}
			catatan = append(catatan, m)
			s := b.subs[m.SubmissionID]
			s.Status = m.Outcome
			if m.ProviderRef != "" {
				s.ProviderRef = m.ProviderRef
			}
			continue
		}
		if *p.CompanyID != companyUji {
			t.Fatalf("terbitan tanpa perusahaan pekerjaannya: %+v", p)
		}
		h := handlers[p.Kind]
		if h == nil {
			t.Fatalf("kind %s tanpa handler", p.Kind)
		}
		var muatan any
		_ = json.Unmarshal(p.Payload, &muatan)
		if _, err := h(ctxUji(p.Kind, int64(100+i), 0, muatan)); err != nil {
			t.Fatalf("%s: %v", p.Kind, err)
		}
	}
	return catatan
}

func TestMockUjungKeUjungLewatAntrean(t *testing.T) {
	b := &bukuTiruan{subs: map[int64]*ledgerread.EfakturSubmission{
		1: kiriman(1, "PT Contoh"),
		2: kiriman(2, "TOLAK Pembeli"),
	}, settings: ledgerread.EfakturSettings{Provider: "mock"}}
	a := &antreanTiruan{}
	d := depsUji(b, a)
	for _, id := range []int64{1, 2} {
		_, _, _ = a.terbitkan(context.Background(), jobs.Publication{
			Kind: contract.KindIntegrationEfakturSubmit, CompanyID: ptr(companyUji),
			Payload: mustJSON(map[string]int64{"submissionId": id}), DedupeKey: "submit:" + string(rune('0'+id)),
		})
	}
	catatan := jalankan(t, d, b, a, 0)

	if b.subs[1].Status != "approved" || b.subs[2].Status != "rejected" {
		t.Fatalf("akhir: #1 %s, #2 %s", b.subs[1].Status, b.subs[2].Status)
	}
	// Putaran pertama berjeda dari `Jeda(1)`.
	for _, p := range a.baris {
		if p.Kind == contract.KindIntegrationEfakturPoll && p.Delay != time.Minute {
			t.Fatalf("jeda putaran 1: %v", p.Delay)
		}
	}

	// Pembatalan faktur yang disetujui.
	b.subs[1].Status = string(contract.EfakturStatusCancelRequested)
	dari := len(a.baris)
	_, _, _ = a.terbitkan(context.Background(), jobs.Publication{
		Kind: contract.KindIntegrationEfakturCancel, CompanyID: ptr(companyUji),
		Payload: mustJSON(map[string]int64{"submissionId": 1}), DedupeKey: "cancel:1",
	})
	catatan = append(catatan, jalankan(t, d, b, a, dari)...)
	if b.subs[1].Status != "canceled" {
		t.Fatalf("batal: %s", b.subs[1].Status)
	}

	// Fikstur BERSAMA dengan sisi TS (`tests/efaktur-record.test.ts`): muatan
	// yang ditulis Go = yang diurai `parseEfakturEvent`.
	cocokFikstur(t, catatan)
}

func TestPermanenLangsungFailedTanpaMembakarPercobaan(t *testing.T) {
	b := &bukuTiruan{subs: map[int64]*ledgerread.EfakturSubmission{1: kiriman(1, "PT Contoh")},
		settings: ledgerread.EfakturSettings{Provider: "pjap", ClientID: "c", SecretCiphertext: "x", SecretIV: "y", SecretTag: "z"}}
	b.subs[1].Provider = "pjap"
	a := &antreanTiruan{}
	d := depsUji(b, a)
	// Kunci enkripsi tidak diset → rahasia tak bisa dibuka → PERMANEN.
	_, err := d.kirim(ctxUji(contract.KindIntegrationEfakturSubmit, 9, 0, map[string]int64{"submissionId": 1}))
	if err != nil {
		t.Fatalf("galat permanen tidak boleh dipulangkan ke antrean: %v", err)
	}
	if len(a.baris) != 1 || a.baris[0].Kind != contract.KindEfakturRecord {
		t.Fatalf("terbitan: %+v", a.baris)
	}
	var m MuatanCatat
	_ = json.Unmarshal(a.baris[0].Payload, &m)
	if m.Outcome != "failed" || !strings.Contains(m.Message, efaktur.SettingsKeyEnv) {
		t.Fatalf("catatan: %+v", m)
	}
}

type penyediaMati struct{ efaktur.Mock }

var errJaringan = errors.New("koneksi ke PJAP terputus")

func (penyediaMati) Submit(context.Context, efaktur.SubmitRequest) (efaktur.Result, error) {
	return efaktur.Result{}, errJaringan
}

func TestSementaraDiulangLaluFailedDiPercobaanTerakhir(t *testing.T) {
	b := &bukuTiruan{subs: map[int64]*ledgerread.EfakturSubmission{1: kiriman(1, "PT Contoh")},
		settings: ledgerread.EfakturSettings{Provider: "mock"}}
	a := &antreanTiruan{}
	d := depsUji(b, a)
	d.Penyedia = func(string, efaktur.Credentials) (efaktur.Provider, error) { return penyediaMati{}, nil }

	muatan := map[string]int64{"submissionId": 1}
	if _, err := d.kirim(ctxUji(contract.KindIntegrationEfakturSubmit, 9, 0, muatan)); !errors.Is(err, errJaringan) {
		t.Fatalf("percobaan pertama harus dipulangkan ke antrean: %v", err)
	}
	if len(a.baris) != 0 {
		t.Fatalf("percobaan pertama tidak boleh mencatat apa pun: %+v", a.baris)
	}
	akhir := contract.JobKinds[contract.KindIntegrationEfakturSubmit].MaxAttempts - 1
	if _, err := d.kirim(ctxUji(contract.KindIntegrationEfakturSubmit, 9, akhir, muatan)); !errors.Is(err, errJaringan) {
		t.Fatalf("percobaan terakhir: %v", err)
	}
	if len(a.baris) != 1 {
		t.Fatalf("percobaan terakhir wajib mencatat failed: %+v", a.baris)
	}
}

type penyediaLambat struct{ efaktur.Mock }

func (penyediaLambat) Status(_ context.Context, ref string) (efaktur.Result, error) {
	return efaktur.Result{Outcome: contract.EfakturStatusSubmitted, ProviderRef: ref}, nil
}

func TestPutaranBerhentiDiBatas(t *testing.T) {
	b := &bukuTiruan{subs: map[int64]*ledgerread.EfakturSubmission{1: kiriman(1, "PT Contoh")},
		settings: ledgerread.EfakturSettings{Provider: "mock"}}
	b.subs[1].Status = "submitted"
	a := &antreanTiruan{}
	d := depsUji(b, a)
	d.Penyedia = func(string, efaktur.Credentials) (efaktur.Provider, error) { return penyediaLambat{}, nil }

	tanya := func(n int) {
		t.Helper()
		if _, err := d.tanya(ctxUji(contract.KindIntegrationEfakturPoll, 9, 0,
			map[string]any{"submissionId": 1, "providerRef": "MOCK-x", "round": n})); err != nil {
			t.Fatal(err)
		}
	}
	tanya(1)
	if len(a.baris) != 1 || a.baris[0].Kind != contract.KindIntegrationEfakturPoll || a.baris[0].Delay != 2*time.Minute {
		t.Fatalf("putaran berikutnya: %+v", a.baris)
	}
	tanya(contract.EfakturPollMaxRounds)
	last := a.baris[len(a.baris)-1]
	var m MuatanCatat
	_ = json.Unmarshal(last.Payload, &m)
	if last.Kind != contract.KindEfakturRecord || m.Outcome != "failed" || !strings.Contains(m.Message, "Coretax") {
		t.Fatalf("batas putaran: %+v %+v", last, m)
	}
}

func TestKirimanYangSudahDiprosesTidakDikirimLagi(t *testing.T) {
	b := &bukuTiruan{subs: map[int64]*ledgerread.EfakturSubmission{1: kiriman(1, "PT Contoh")},
		settings: ledgerread.EfakturSettings{Provider: "mock"}}
	b.subs[1].Status = "submitted"
	a := &antreanTiruan{}
	d := depsUji(b, a)
	if _, err := d.kirim(ctxUji(contract.KindIntegrationEfakturSubmit, 9, 0, map[string]int64{"submissionId": 1})); err != nil {
		t.Fatal(err)
	}
	if len(a.baris) != 0 {
		t.Fatalf("kiriman ganda: %+v", a.baris)
	}
}

// ── Fikstur bersama ────────────────────────────────────────────────────────

const fikstur = "testdata/efaktur_record_fixtures.json"

func cocokFikstur(t *testing.T, catatan []MuatanCatat) {
	t.Helper()
	got, err := json.MarshalIndent(catatan, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	if os.Getenv("UPDATE_FIXTURES") == "1" {
		if err := os.MkdirAll(filepath.Dir(fikstur), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fikstur, got, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(fikstur)
	if err != nil {
		t.Fatalf("%v — jalankan dengan UPDATE_FIXTURES=1 sekali", err)
	}
	if string(want) != string(got) {
		t.Fatalf("muatan efaktur.record berubah — perbarui fikstur (UPDATE_FIXTURES=1) DAN periksa parseEfakturEvent:\n%s", got)
	}
}

func ptr[T any](v T) *T { return &v }

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
