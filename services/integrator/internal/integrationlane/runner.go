// Package integrationlane: pelari jalur `integration` — e-Faktur lewat PJAP
// (docs/EFAKTUR.md). Dijalankan `cmd/integrator` di `svc-integrator`, seproses
// dengan jalur lain ("1 image = 1 container", 09 §3.2).
//
// ══ TIGA KIND, SATU ARAH TULIS ═════════════════════════════════════════════
//
//	integration.efaktur_submit  kirim XML yang DIBEKUKAN Node ke PJAP
//	integration.efaktur_poll    tanyakan status; terbitkan putaran berikutnya
//	integration.efaktur_cancel  minta pembatalan faktur pajak yang disetujui
//
// Setiap jawaban PJAP menjadi pekerjaan `efaktur.record` yang diklaim pelari
// `interactive` NODE, dan Node-lah yang menulis `efaktur_submissions` di buku
// PT. Pelari ini membaca buku (`internal/ledgerread`, transaksi READ ONLY) dan
// menulis HANYA baris `jobs` (`internal/jobs`) — daftar-izin tulisan Go tidak
// bertambah, dan layanan tidak saling memanggil (I-3): antrean perantaranya.
//
// ══ RAHASIA ════════════════════════════════════════════════════════════════
// Kredensial PJAP disegel per PT (`company_settings.efaktur_secret_*`) dan
// dibuka DI SINI dengan `SETTINGS_ENCRYPTION_KEY`, tepat sebelum dipakai,
// tidak pernah dicetak dan tidak pernah masuk muatan pekerjaan. Paket ini
// tidak membaca variabel cadangan dan tidak mengimpor `internal/backup`.
// Risiko seproses dengan kunci cadangan: 09 §3.2.
//
// ══ KEGAGALAN ══════════════════════════════════════════════════════════════
//   - galat PERMANEN (kredensial, penyedia belum diimplementasi, XML ditolak
//     bentuknya) → `efaktur.record` `failed` SEGERA, pekerjaan selesai. Tidak
//     ada gunanya membakar lima percobaan untuk kunci yang salah.
//   - galat SEMENTARA (jaringan, 5xx) → dipulangkan ke antrean dengan backoff
//     kontrak; pada percobaan TERAKHIR, `failed` dicatat lebih dulu supaya
//     kiriman tidak menggantung `queued` selamanya di layar.
package integrationlane

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/efaktur"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// Run menguras jalur `integration` sampai SIGTERM/SIGINT atau sampai `stop`
// selesai. Jalur jamak (`single_instance: false`) — tanpa pagar advisory.
func Run(ctx, stop context.Context) error {
	kolam, err := db.Kendali(ctx, 2)
	if err != nil {
		return err
	}
	defer kolam.Close()

	q := jobs.New(kolam)
	d := produksi(kolam, q)
	pelari := &jobs.Runner{
		Lane:  contract.LaneIntegration,
		Queue: q,
		// SATU-SATUNYA pengklaim ketiga kind ini (`tests/kind-punya-pengklaim.test.ts`).
		Handlers: map[contract.JobKind]jobs.Handler{
			contract.KindIntegrationEfakturSubmit: d.kirim,
			contract.KindIntegrationEfakturPoll:   d.tanya,
			contract.KindIntegrationEfakturCancel: d.batal,
		},
		Stop: stop,
	}
	return pelari.Run(ctx)
}

// Buku: yang dibaca pelari dari buku SATU PT. `*ledgerread.Reader` memenuhinya.
type Buku interface {
	EfakturSubmission(ctx context.Context, id int64) (*ledgerread.EfakturSubmission, error)
	EfakturSettings(ctx context.Context) (*ledgerread.EfakturSettings, error)
	Close()
}

// Deps: semua yang menyentuh dunia luar, disuntik supaya alurnya diuji tanpa
// basis data dan tanpa jaringan (`runner_test.go`).
type Deps struct {
	// Buka membuka buku perusahaan pekerjaan ini (registry → ledgerread).
	Buka func(ctx context.Context, companyID *int32) (Buku, error)
	// Terbitkan menulis satu baris `jobs`.
	Terbitkan func(ctx context.Context, p jobs.Publication) (int64, bool, error)
	// Penyedia memilih implementasi PJAP; bawaannya `efaktur.New`.
	Penyedia func(name string, cred efaktur.Credentials) (efaktur.Provider, error)
	Getenv   func(string) string
	Sekarang func() time.Time
	// Jeda putaran tanya-status ke-n (n ≥ 1). Bawaannya backoff kontrak.
	Jeda func(putaran int) time.Duration
}

func produksi(kolam *pgxpool.Pool, q *jobs.Queue) Deps {
	return Deps{
		Buka: func(ctx context.Context, companyID *int32) (Buku, error) {
			c, err := registry.Lookup(ctx, kolam, companyID)
			if err != nil {
				return nil, err
			}
			// Perusahaan NONAKTIF tetap dikerjakan: kiriman yang sudah antre ke
			// DJP harus sampai pada keputusannya, dan pekerjaan ini tidak
			// menulis buku.
			return ledgerread.OpenAt(ctx, c.DatabaseName, c.InstanceURLEnvVar)
		},
		Terbitkan: func(ctx context.Context, p jobs.Publication) (int64, bool, error) {
			return q.Publish(ctx, p)
		},
		Penyedia: efaktur.New,
		Getenv:   os.Getenv,
		Sekarang: time.Now,
		Jeda:     func(n int) time.Duration { return jobs.Backoff(n, nil) },
	}
}

// muatanKiriman: `{ submissionId }` — bentuk `publishJob` di
// `src/lib/efaktur-submissions.ts`. PARAMETER saja; XML dibaca dari buku.
type muatanKiriman struct {
	SubmissionID int64 `json:"submissionId"`
}

// muatanTanya: putaran tanya-status. `ProviderRef` ikut di muatan karena Node
// mungkin belum menuliskannya ke buku saat putaran pertama berjalan.
type muatanTanya struct {
	SubmissionID int64  `json:"submissionId"`
	ProviderRef  string `json:"providerRef"`
	Round        int    `json:"round"`
}

// MuatanCatat: muatan `efaktur.record` — padanan `parseEfakturEvent` di
// `@sai/core/efaktur-submission`. Fikstur bersama:
// `testdata/efaktur_record_fixtures.json` (dibaca `tests/efaktur-record.test.ts`).
type MuatanCatat struct {
	SubmissionID     int64  `json:"submissionId"`
	Outcome          string `json:"outcome"`
	ProviderRef      string `json:"providerRef,omitempty"`
	TaxInvoiceNumber string `json:"taxInvoiceNumber,omitempty"`
	Message          string `json:"message,omitempty"`
	ObservedAt       string `json:"observedAt"`
}

func urai[T any](c jobs.Ctx) (T, error) {
	var m T
	if err := json.Unmarshal(c.Payload, &m); err != nil {
		return m, fmt.Errorf("muatan tidak terbaca: %w", err)
	}
	return m, nil
}

// percobaanTerakhir: Attempts = percobaan yang SUDAH gagal sebelum klaim ini.
func percobaanTerakhir(j *jobs.Job) bool { return j.Attempts+1 >= j.MaxAttempts }

// catat menerbitkan satu `efaktur.record`. Kunci dedupe per (pekerjaan,
// percobaan): satu eksekusi = paling banyak satu catatan.
func (d Deps) catat(c jobs.Ctx, subID int64, r efaktur.Result) error {
	if !contract.EfakturOutcomes[r.Outcome] {
		return fmt.Errorf("hasil %q di luar kontrak efaktur.outcomes", r.Outcome)
	}
	muatan, err := json.Marshal(MuatanCatat{
		SubmissionID:     subID,
		Outcome:          string(r.Outcome),
		ProviderRef:      r.ProviderRef,
		TaxInvoiceNumber: r.TaxInvoiceNumber,
		Message:          r.Message,
		ObservedAt:       d.Sekarang().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return err
	}
	_, _, err = d.Terbitkan(c.Ctx, jobs.Publication{
		Kind:      contract.KindEfakturRecord,
		CompanyID: c.Job.CompanyID,
		Payload:   muatan,
		DedupeKey: fmt.Sprintf("%s:%d:%d", contract.KindEfakturRecord, c.Job.ID, c.Job.Attempts),
	})
	return err
}

// gagal: galat dari penyedia → keputusan pekerjaan. Permanen, atau sementara
// pada percobaan terakhir, menjadi catatan `failed` (atau `pulihKe`, untuk
// pembatalan yang gagal: faktur pajaknya tetap berlaku).
func (d Deps) gagal(c jobs.Ctx, subID int64, err error, pulihKe contract.EfakturStatus) error {
	if !efaktur.IsPermanent(err) && !percobaanTerakhir(c.Job) {
		return err // diulang backoff antrean
	}
	pesan := err.Error()
	if pulihKe == contract.EfakturStatusApproved {
		pesan = "pembatalan gagal: " + pesan
	}
	if e := d.catat(c, subID, efaktur.Result{Outcome: pulihKe, Message: pesan}); e != nil {
		return errors.Join(err, e)
	}
	if efaktur.IsPermanent(err) {
		log.Printf("[integration] #%d kiriman e-Faktur #%d: %v", c.Job.ID, subID, err)
		return nil
	}
	return err
}

// penyedia membuka kredensial PT dan memilih penyedianya.
func (d Deps) penyedia(ctx context.Context, buku Buku, nama string) (efaktur.Provider, error) {
	s, err := buku.EfakturSettings(ctx)
	if err != nil {
		return nil, err
	}
	cred := efaktur.Credentials{ClientID: s.ClientID, Production: s.IsProduction}
	if s.SecretCiphertext != "" {
		rahasia, err := efaktur.OpenSecret(d.Getenv(efaktur.SettingsKeyEnv), efaktur.Sealed{
			Ciphertext: s.SecretCiphertext, IV: s.SecretIV, Tag: s.SecretTag,
		})
		if err != nil {
			return nil, efaktur.Permanent(err)
		}
		cred.Secret = rahasia
	}
	return d.Penyedia(nama, cred)
}

func (d Deps) kirim(c jobs.Ctx) (*string, error) {
	m, err := urai[muatanKiriman](c)
	if err != nil {
		return nil, err
	}
	buku, err := d.Buka(c.Ctx, c.Job.CompanyID)
	if err != nil {
		return nil, err
	}
	defer buku.Close()
	sub, err := buku.EfakturSubmission(c.Ctx, m.SubmissionID)
	if err != nil {
		return nil, err
	}
	if contract.EfakturStatus(sub.Status) != contract.EfakturStatusQueued {
		// Sudah diproses (percobaan sebelumnya berhasil mengirim lalu lease
		// hilang), atau dibatalkan. Tidak dikirim lagi.
		return nil, nil
	}
	p, err := d.penyedia(c.Ctx, buku, sub.Provider)
	if err != nil {
		return nil, d.gagal(c, sub.ID, err, contract.EfakturStatusFailed)
	}
	r, err := p.Submit(c.Ctx, efaktur.SubmitRequest{IdempotencyKey: sub.IdempotencyKey, XML: []byte(sub.XML)})
	if err != nil {
		return nil, d.gagal(c, sub.ID, err, contract.EfakturStatusFailed)
	}
	if err := d.catat(c, sub.ID, r); err != nil {
		return nil, err
	}
	if r.Outcome == contract.EfakturStatusSubmitted {
		return nil, d.putaran(c, sub.ID, r.ProviderRef, 1)
	}
	return nil, nil
}

// putaran menerbitkan tanya-status ke-n, berjeda.
func (d Deps) putaran(c jobs.Ctx, subID int64, ref string, n int) error {
	if c.Job.CompanyID == nil {
		return registry.ErrNoCompany
	}
	muatan, err := json.Marshal(muatanTanya{SubmissionID: subID, ProviderRef: ref, Round: n})
	if err != nil {
		return err
	}
	_, _, err = d.Terbitkan(c.Ctx, jobs.Publication{
		Kind:      contract.KindIntegrationEfakturPoll,
		CompanyID: c.Job.CompanyID,
		Payload:   muatan,
		DedupeKey: fmt.Sprintf("%s:%d:%d:%d", contract.KindIntegrationEfakturPoll, *c.Job.CompanyID, subID, n),
		Delay:     d.Jeda(n),
	})
	return err
}

func (d Deps) tanya(c jobs.Ctx) (*string, error) {
	m, err := urai[muatanTanya](c)
	if err != nil {
		return nil, err
	}
	if m.ProviderRef == "" || m.Round < 1 {
		return nil, fmt.Errorf("muatan tanya-status tidak lengkap: %+v", m)
	}
	buku, err := d.Buka(c.Ctx, c.Job.CompanyID)
	if err != nil {
		return nil, err
	}
	defer buku.Close()
	sub, err := buku.EfakturSubmission(c.Ctx, m.SubmissionID)
	if err != nil {
		return nil, err
	}
	switch contract.EfakturStatus(sub.Status) {
	case contract.EfakturStatusQueued, contract.EfakturStatusSubmitted:
	default:
		return nil, nil // sudah diputuskan; putaran berhenti
	}
	p, err := d.penyedia(c.Ctx, buku, sub.Provider)
	if err != nil {
		return nil, d.gagal(c, sub.ID, err, contract.EfakturStatusFailed)
	}
	r, err := p.Status(c.Ctx, m.ProviderRef)
	if err != nil {
		return nil, d.gagal(c, sub.ID, err, contract.EfakturStatusFailed)
	}
	if r.Outcome != contract.EfakturStatusSubmitted {
		return nil, d.catat(c, sub.ID, r)
	}
	if m.Round >= contract.EfakturPollMaxRounds {
		return nil, d.catat(c, sub.ID, efaktur.Result{
			Outcome:     contract.EfakturStatusFailed,
			ProviderRef: m.ProviderRef,
			Message: fmt.Sprintf("belum diputuskan DJP sesudah %d kali ditanyakan — periksa statusnya di Coretax",
				m.Round),
		})
	}
	return nil, d.putaran(c, sub.ID, m.ProviderRef, m.Round+1)
}

func (d Deps) batal(c jobs.Ctx) (*string, error) {
	m, err := urai[muatanKiriman](c)
	if err != nil {
		return nil, err
	}
	buku, err := d.Buka(c.Ctx, c.Job.CompanyID)
	if err != nil {
		return nil, err
	}
	defer buku.Close()
	sub, err := buku.EfakturSubmission(c.Ctx, m.SubmissionID)
	if err != nil {
		return nil, err
	}
	if contract.EfakturStatus(sub.Status) != contract.EfakturStatusCancelRequested {
		return nil, nil
	}
	if sub.ProviderRef == "" {
		return nil, d.catat(c, sub.ID, efaktur.Result{
			Outcome: contract.EfakturStatusApproved,
			Message: "pembatalan gagal: rujukan penyedia tidak tercatat — batalkan di Coretax",
		})
	}
	p, err := d.penyedia(c.Ctx, buku, sub.Provider)
	if err != nil {
		return nil, d.gagal(c, sub.ID, err, contract.EfakturStatusApproved)
	}
	r, err := p.Cancel(c.Ctx, sub.ProviderRef, "dibatalkan dari SAI Accounting")
	if err != nil {
		return nil, d.gagal(c, sub.ID, err, contract.EfakturStatusApproved)
	}
	return nil, d.catat(c, sub.ID, r)
}
