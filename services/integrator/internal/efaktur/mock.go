package efaktur

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"strings"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Mock: penyedia UJI — tanpa jaringan dan TANPA KEADAAN. Hasilnya diturunkan
// dari masukan saja, jadi dua proses (atau dua percobaan) selalu sepakat:
//
//   - Submit: XML yang memuat `<BuyerName>TOLAK` DITOLAK (meniru penolakan
//     DJP); selainnya DITERIMA dengan rujukan `MOCK-<kunci idempotensi>` —
//     kunci yang sama, rujukan yang sama.
//   - Status: rujukan MOCK selalu DISETUJUI, dengan NSFP 17 digit tiruan yang
//     diturunkan dari rujukannya (awalan `99` — tidak akan tertukar dengan
//     nomor sungguhan, yang diawali kode transaksi).
//   - Cancel: selalu berhasil.
//
// Tidak pernah dipakai diam-diam: `New` hanya memulangkannya bila perusahaan
// MEMILIH `mock`, dan layar menandai kiriman `mock` sebagai uji.
type Mock struct{}

// Name: `mock`.
func (Mock) Name() contract.EfakturProvider { return contract.EfakturProviderMock }

const awalanMock = "MOCK-"

// Submit menerima atau menolak menurut isi XML.
func (Mock) Submit(_ context.Context, req SubmitRequest) (Result, error) {
	if req.IdempotencyKey == "" {
		return Result{}, Permanent(errors.New("kiriman tanpa kunci idempotensi"))
	}
	if !bytes.Contains(req.XML, []byte("<TaxInvoiceBulk")) {
		return Result{}, Permanent(errors.New("berkas bukan TaxInvoiceBulk Coretax"))
	}
	if bytes.Contains(req.XML, []byte("<BuyerName>TOLAK")) {
		return Result{
			Outcome: contract.EfakturStatusRejected,
			Message: "Mock: ditolak (nama pembeli diawali TOLAK)",
		}, nil
	}
	return Result{Outcome: contract.EfakturStatusSubmitted, ProviderRef: awalanMock + req.IdempotencyKey}, nil
}

// Status menyetujui setiap rujukan MOCK.
func (Mock) Status(_ context.Context, ref string) (Result, error) {
	if !strings.HasPrefix(ref, awalanMock) {
		return Result{}, Permanent(fmt.Errorf("rujukan %q bukan milik penyedia mock", ref))
	}
	return Result{Outcome: contract.EfakturStatusApproved, ProviderRef: ref, TaxInvoiceNumber: nsfpTiruan(ref)}, nil
}

// Cancel selalu berhasil untuk rujukan MOCK.
func (Mock) Cancel(_ context.Context, ref, _ string) (Result, error) {
	if !strings.HasPrefix(ref, awalanMock) {
		return Result{}, Permanent(fmt.Errorf("rujukan %q bukan milik penyedia mock", ref))
	}
	return Result{Outcome: contract.EfakturStatusCanceled, ProviderRef: ref}, nil
}

// DownloadPDF memulangkan PDF satu baris yang sah secara struktur.
func (Mock) DownloadPDF(_ context.Context, ref string) ([]byte, error) {
	if !strings.HasPrefix(ref, awalanMock) {
		return nil, Permanent(fmt.Errorf("rujukan %q bukan milik penyedia mock", ref))
	}
	return []byte("%PDF-1.4\n% faktur pajak tiruan " + ref + "\n%%EOF\n"), nil
}

// nsfpTiruan: 17 digit, `99` + 15 digit dari FNV-64 rujukannya.
func nsfpTiruan(ref string) string {
	h := fnv.New64a()
	_, _ = h.Write([]byte(ref))
	return fmt.Sprintf("99%015d", h.Sum64()%1_000_000_000_000_000)
}
