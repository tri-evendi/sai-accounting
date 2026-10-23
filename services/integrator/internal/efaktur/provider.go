// Package efaktur: PENYEDIA e-Faktur (PJAP) di balik satu antarmuka —
// docs/EFAKTUR.md.
//
// ══ YANG DILAKUKAN PAKET INI, DAN YANG TIDAK ═══════════════════════════════
// Ia MENGANGKUT berkas XML Coretax yang sudah dibangun TypeScript
// (`@sai/core/coretax-xml`) ke penyedia, dan menerjemahkan jawabannya ke
// kosakata kontrak (`contract.EfakturStatus`). Ia tidak menghitung DPP/PPN,
// tidak membaca buku, dan tidak menulis basis data apa pun: 09 §3.3 — Go
// berhenti sebelum perhitungan akuntansi, dan daftar-izin tulisannya
// `jobs` + `backup_runs`.
//
// ══ PENYEDIA HARI INI ══════════════════════════════════════════════════════
//   - `mock` — tanpa jaringan, tanpa keadaan; hasilnya ditentukan isi XML
//     (mock.go). Untuk uji ujung-ke-ujung lewat antrean dan untuk demo.
//   - `pjap` — KERANGKA. Pemilik belum memilih PJAP, dan tidak satu pun PJAP
//     menerbitkan dokumentasi API publik (riset 23 Okt 2026, docs/EFAKTUR.md).
//     Setiap pemanggilannya gagal PERMANEN dengan pesan yang terbaca, bukan
//     menebak bentuk API yang belum terbukti.
package efaktur

import (
	"context"
	"errors"
	"fmt"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Credentials: kredensial PJAP milik SATU perusahaan, sudah dibuka. Tidak
// pernah dicetak — `String()` sengaja menyembunyikan rahasianya.
type Credentials struct {
	ClientID   string
	Secret     string
	Production bool
}

// String menyembunyikan rahasia dari `%v`/log yang lalai.
func (c Credentials) String() string {
	return fmt.Sprintf("Credentials{ClientID:%q Secret:[disembunyikan] Production:%t}", c.ClientID, c.Production)
}

// SubmitRequest: satu faktur keluaran.
type SubmitRequest struct {
	// IdempotencyKey dikirim ke penyedia: pengulangan atas upaya yang SAMA
	// (backoff antrean, lease yang hilang) tidak boleh menerbitkan dua faktur.
	IdempotencyKey string
	// XML: berkas `TaxInvoiceBulk` berisi satu `TaxInvoice`, dibekukan saat antre.
	XML []byte
}

// Result: jawaban penyedia dalam kosakata kontrak.
type Result struct {
	Outcome          contract.EfakturStatus
	ProviderRef      string
	TaxInvoiceNumber string
	Message          string
}

// Provider: satu PJAP. Setiap metode memulangkan galat PERMANEN
// (`Permanent`) untuk yang tidak akan sembuh dengan diulang — kredensial
// ditolak, penyedia belum diimplementasi — dan galat biasa untuk yang mungkin
// sembuh (jaringan, 5xx), yang diulang backoff antrean.
type Provider interface {
	Name() contract.EfakturProvider
	Submit(ctx context.Context, req SubmitRequest) (Result, error)
	Status(ctx context.Context, providerRef string) (Result, error)
	Cancel(ctx context.Context, providerRef, reason string) (Result, error)
	// DownloadPDF: berkas PDF faktur pajak yang SUDAH disetujui. Belum
	// disambungkan ke antrean (docs/EFAKTUR.md §Belum) — PDF resmi tetap bisa
	// diunduh dari Coretax.
	DownloadPDF(ctx context.Context, providerRef string) ([]byte, error)
}

// PermanentError: galat yang tidak sembuh dengan diulang.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

// Permanent membungkus err sebagai galat permanen.
func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return &PermanentError{Err: err}
}

// IsPermanent: apakah err (atau yang dibungkusnya) permanen?
func IsPermanent(err error) bool {
	var p *PermanentError
	return errors.As(err, &p)
}

// New memilih penyedia menurut nilai `company_settings.efaktur_provider`.
// Nilai di luar kontrak MELEMPAR permanen — tidak pernah jatuh ke `mock`:
// faktur yang "berhasil" dikirim ke penyedia palsu adalah faktur pajak yang
// tidak pernah terbit, dan tidak ada yang tahu sampai SPT Masa PPN-nya.
func New(name string, cred Credentials) (Provider, error) {
	switch contract.EfakturProvider(name) {
	case contract.EfakturProviderMock:
		return Mock{}, nil
	case contract.EfakturProviderPjap:
		if cred.ClientID == "" || cred.Secret == "" {
			return nil, Permanent(errors.New("kredensial PJAP belum lengkap — isi di Pengaturan e-Faktur"))
		}
		return &PJAP{cred: cred}, nil
	default:
		return nil, Permanent(fmt.Errorf("penyedia e-Faktur %q tidak dikenal kontrak", name))
	}
}
