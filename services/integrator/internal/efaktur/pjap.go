package efaktur

import (
	"context"
	"errors"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// PJAP: KERANGKA penyedia sungguhan.
//
// ══ KENAPA SETIAP METODE GAGAL PERMANEN ════════════════════════════════════
// Riset 23 Okt 2026 (docs/EFAKTUR.md §Riset): PJAP yang memasarkan e-Faktur
// API/H2H (Mekari Klikpajak, OnlinePajak, Pajakku, …) tidak menerbitkan
// dokumentasi API publik — integrasinya dibuka lewat kontrak & sandbox. Dan
// sejak PER-5/PJ/2025, H2H e-Faktur hanya layanan PENDUKUNG PJAP "sepanjang
// telah disetujui DJP". Menulis klien HTTP untuk bentuk API yang ditebak
// berarti kode yang tampak siap dan gagal pada hari pertama produksi — atau,
// lebih buruk, berhasil separuh.
//
// Maka sampai pemilik memilih PJAP: perusahaan yang memilih `pjap` mendapat
// kiriman `failed` dengan pesan di bawah, terbaca di layar — bukan antrean
// yang menunggu selamanya.
//
// ══ MENGISINYA, BEGITU PJAP DIPILIH ════════════════════════════════════════
//  1. Autentikasi (lazimnya OAuth2 client credentials — TODO-verify per PJAP)
//     dari `cred.ClientID`/`cred.Secret`; `cred.Production` memilih URL sandbox
//     atau produksi. URL-nya konstanta DI SINI, bukan env: URL yang bisa
//     disetel `.env` adalah URL yang bisa salah disetel ke sandbox di produksi.
//  2. Submit: unggah `req.XML` dengan `req.IdempotencyKey` di header/kolom
//     idempotensi penyedia; petakan jawabannya ke `Result`.
//  3. Status/Cancel/DownloadPDF: petakan status penyedia ke
//     `contract.EfakturStatus*`. 4xx kredensial → `Permanent`; jaringan/5xx →
//     galat biasa (diulang backoff antrean).
//  4. Tes: `httptest.Server` meniru penyedia; `bodyclose` sudah menyala di
//     `.golangci.yml` untuk jalur ini.
type PJAP struct {
	cred Credentials
}

// ErrPJAPBelumDipilih: pesan yang sampai ke layar pengguna.
var ErrPJAPBelumDipilih = errors.New(
	"penyedia PJAP belum disambungkan — kirim lewat unggah XML di Coretax (docs/EFAKTUR.md)")

// Name: `pjap`.
func (*PJAP) Name() contract.EfakturProvider { return contract.EfakturProviderPjap }

// Submit belum diimplementasi.
func (*PJAP) Submit(context.Context, SubmitRequest) (Result, error) {
	return Result{}, Permanent(ErrPJAPBelumDipilih)
}

// Status belum diimplementasi.
func (*PJAP) Status(context.Context, string) (Result, error) {
	return Result{}, Permanent(ErrPJAPBelumDipilih)
}

// Cancel belum diimplementasi.
func (*PJAP) Cancel(context.Context, string, string) (Result, error) {
	return Result{}, Permanent(ErrPJAPBelumDipilih)
}

// DownloadPDF belum diimplementasi.
func (*PJAP) DownloadPDF(context.Context, string) ([]byte, error) {
	return nil, Permanent(ErrPJAPBelumDipilih)
}
