package efaktur

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Segel ini dibuat `sealSecret()` NODE (`@sai/core/settings-crypto`) dengan
// kunci uji di bawah — bukti interop dua bahasa, bukan bundar-balik Go sendiri:
//
//	bun -e 'sealSecret("rahasia-pjap-uji-ü", Buffer.from(kunciUji, "hex"))'
const kunciUji = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

var segelNode = Sealed{
	Ciphertext: "h6Flx4IhnwoU/er2OaR5+5ZfCQ==",
	IV:         "e3zfHhKqSq2sqOw3",
	Tag:        "1SmcW2OvKh3WQ4DCUxRQrw==",
}

func TestOpenSecretMembukaSegelNode(t *testing.T) {
	got, err := OpenSecret(kunciUji, segelNode)
	if err != nil {
		t.Fatal(err)
	}
	if got != "rahasia-pjap-uji-ü" {
		t.Fatalf("got %q", got)
	}
}

func TestOpenSecretGagalTertutup(t *testing.T) {
	kunciLain := strings.Repeat("ab", 32)
	ubah := segelNode
	ubah.Tag = "AAAAAAAAAAAAAAAAAAAAAA=="
	kasus := map[string]struct {
		kunci string
		segel Sealed
	}{
		"kunci kosong":    {"", segelNode},
		"kunci bukan hex": {strings.Repeat("z", 64), segelNode},
		"kunci berganti":  {kunciLain, segelNode},
		"tag diubah":      {kunciUji, ubah},
		"segel tak utuh":  {kunciUji, Sealed{Ciphertext: segelNode.Ciphertext, IV: segelNode.IV}},
		"bukan base64":    {kunciUji, Sealed{Ciphertext: "%%%", IV: segelNode.IV, Tag: segelNode.Tag}},
	}
	for nama, k := range kasus {
		got, err := OpenSecret(k.kunci, k.segel)
		if err == nil {
			t.Errorf("%s: tidak melempar (got %q)", nama, got)
			continue
		}
		if strings.Contains(err.Error(), "rahasia-pjap") {
			t.Errorf("%s: galat membocorkan rahasia: %v", nama, err)
		}
	}
}

func TestCredentialsTidakMencetakRahasia(t *testing.T) {
	s := fmt.Sprintf("%v %+v", Credentials{ClientID: "c", Secret: "s3cr3t"}, Credentials{Secret: "s3cr3t"})
	if strings.Contains(s, "s3cr3t") {
		t.Fatalf("rahasia tercetak: %s", s)
	}
}

func TestNewMenolakPenyediaTakDikenal(t *testing.T) {
	if _, err := New("", Credentials{}); !IsPermanent(err) {
		t.Fatalf("penyedia kosong: %v", err)
	}
	if _, err := New("pajakku", Credentials{}); !IsPermanent(err) {
		t.Fatalf("penyedia asing: %v", err)
	}
	if _, err := New(string(contract.EfakturProviderPjap), Credentials{}); !IsPermanent(err) {
		t.Fatalf("pjap tanpa kredensial: %v", err)
	}
	p, err := New(string(contract.EfakturProviderMock), Credentials{})
	if err != nil || p.Name() != contract.EfakturProviderMock {
		t.Fatalf("mock: %v %v", p, err)
	}
}

func TestPJAPKerangkaGagalPermanen(t *testing.T) {
	p, err := New(string(contract.EfakturProviderPjap), Credentials{ClientID: "c", Secret: "s"})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	_, e1 := p.Submit(ctx, SubmitRequest{IdempotencyKey: "k", XML: []byte("<TaxInvoiceBulk/>")})
	_, e2 := p.Status(ctx, "r")
	_, e3 := p.Cancel(ctx, "r", "x")
	_, e4 := p.DownloadPDF(ctx, "r")
	for i, e := range []error{e1, e2, e3, e4} {
		if !IsPermanent(e) || !errors.Is(e, ErrPJAPBelumDipilih) {
			t.Errorf("metode %d: %v", i, e)
		}
	}
}

const xmlUji = `<TaxInvoiceBulk><TIN>0012345678901000</TIN><BuyerName>PT Contoh</BuyerName></TaxInvoiceBulk>`

func TestMockAlurLengkap(t *testing.T) {
	ctx := context.Background()
	m := Mock{}
	r, err := m.Submit(ctx, SubmitRequest{IdempotencyKey: "sai-3-inv41-r1", XML: []byte(xmlUji)})
	if err != nil || r.Outcome != contract.EfakturStatusSubmitted || r.ProviderRef != "MOCK-sai-3-inv41-r1" {
		t.Fatalf("submit: %+v %v", r, err)
	}
	// Tanpa keadaan: kunci yang sama → rujukan yang sama (idempotensi).
	r2, _ := m.Submit(ctx, SubmitRequest{IdempotencyKey: "sai-3-inv41-r1", XML: []byte(xmlUji)})
	if r2.ProviderRef != r.ProviderRef {
		t.Fatalf("rujukan berbeda untuk kunci yang sama: %s vs %s", r.ProviderRef, r2.ProviderRef)
	}
	s, err := m.Status(ctx, r.ProviderRef)
	if err != nil || s.Outcome != contract.EfakturStatusApproved || len(s.TaxInvoiceNumber) != 17 || !strings.HasPrefix(s.TaxInvoiceNumber, "99") {
		t.Fatalf("status: %+v %v", s, err)
	}
	c, err := m.Cancel(ctx, r.ProviderRef, "salah harga")
	if err != nil || c.Outcome != contract.EfakturStatusCanceled {
		t.Fatalf("cancel: %+v %v", c, err)
	}
	pdf, err := m.DownloadPDF(ctx, r.ProviderRef)
	if err != nil || !strings.HasPrefix(string(pdf), "%PDF-") {
		t.Fatalf("pdf: %v", err)
	}
}

func TestMockMenolakDanMemeriksaMasukan(t *testing.T) {
	ctx := context.Background()
	m := Mock{}
	r, err := m.Submit(ctx, SubmitRequest{IdempotencyKey: "k", XML: []byte(strings.Replace(xmlUji, "PT Contoh", "TOLAK Saja", 1))})
	if err != nil || r.Outcome != contract.EfakturStatusRejected || r.Message == "" {
		t.Fatalf("tolak: %+v %v", r, err)
	}
	if _, err := m.Submit(ctx, SubmitRequest{XML: []byte(xmlUji)}); !IsPermanent(err) {
		t.Fatalf("tanpa kunci: %v", err)
	}
	if _, err := m.Submit(ctx, SubmitRequest{IdempotencyKey: "k", XML: []byte("<x/>")}); !IsPermanent(err) {
		t.Fatalf("bukan coretax: %v", err)
	}
	if _, err := m.Status(ctx, "PJAP-1"); !IsPermanent(err) {
		t.Fatalf("rujukan asing: %v", err)
	}
	for _, o := range []contract.EfakturStatus{contract.EfakturStatusSubmitted, contract.EfakturStatusApproved, contract.EfakturStatusRejected, contract.EfakturStatusCanceled} {
		if !contract.EfakturOutcomes[o] {
			t.Fatalf("hasil mock %q di luar EfakturOutcomes", o)
		}
	}
}
