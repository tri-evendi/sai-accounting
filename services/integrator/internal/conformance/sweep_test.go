package conformance

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// Kalimat & angka harapan diambil dari `batasSerentak()` TS.
func TestConcurrencySepertiNode(t *testing.T) {
	kasus := []struct {
		raw  string
		mau  int
		warn string
	}{
		{"", 3, ""},
		{"1", 1, ""},
		{" 5 ", 5, ""},
		{"8", 8, ""},
		{"4.0", 4, ""},
		{"0x4", 4, ""},
		{"9", 8, "⚠ CONFORMANCE_CONCURRENCY=9 di atas plafon 8 — memakai 8."},
		{"0", 3, `⚠ CONFORMANCE_CONCURRENCY="0" bukan bilangan bulat ≥ 1 — memakai 3.`},
		{"2.5", 3, `⚠ CONFORMANCE_CONCURRENCY="2.5" bukan bilangan bulat ≥ 1 — memakai 3.`},
		{"banyak", 3, `⚠ CONFORMANCE_CONCURRENCY="banyak" bukan bilangan bulat ≥ 1 — memakai 3.`},
		{"Infinity", 3, `⚠ CONFORMANCE_CONCURRENCY="Infinity" bukan bilangan bulat ≥ 1 — memakai 3.`},
	}
	for _, k := range kasus {
		var dapat string
		if got := Concurrency(k.raw, func(s string) { dapat = s }); got != k.mau || dapat != k.warn {
			t.Errorf("Concurrency(%q) = %d, %q; mau %d, %q", k.raw, got, dapat, k.mau, k.warn)
		}
	}
}

func TestThresholdSepertiNode(t *testing.T) {
	s := func(v string) *string { return &v }
	kasus := []struct {
		persen *string
		mau    float64
	}{
		{nil, contract.MaterialityCatchAllThreshold},
		{s("10"), 0.1},
		{s("0.5"), 0.005},
		{s(" 7 "), 0.07},
		{s("0"), contract.MaterialityCatchAllThreshold},
		{s("-5"), contract.MaterialityCatchAllThreshold},
		{s("lima"), contract.MaterialityCatchAllThreshold},
		{s(""), contract.MaterialityCatchAllThreshold}, // Number("") = 0 → bawaan
	}
	for _, k := range kasus {
		if got := Threshold(k.persen); got != k.mau {
			t.Errorf("Threshold(%v) = %v, mau %v", k.persen, got, k.mau)
		}
	}
}

func TestSweepUrutDaftarBukanUrutSelesai(t *testing.T) {
	buku := []registry.Company{
		{Slug: "pt-a", DatabaseName: "sai_a", IsActive: true},
		{Slug: "pt-b", DatabaseName: "sai_b", IsActive: false},
		{Slug: "pt-c", DatabaseName: "sai_c", IsActive: true, InstanceKey: "kedua"},
		{Slug: "pt-d", DatabaseName: "sai_d", IsActive: true},
	}
	var serentak, puncak int32
	periksa := func(_ context.Context, c registry.Company) ([]CheckResult, error) {
		n := atomic.AddInt32(&serentak, 1)
		for {
			p := atomic.LoadInt32(&puncak)
			if n <= p || atomic.CompareAndSwapInt32(&puncak, p, n) {
				break
			}
		}
		defer atomic.AddInt32(&serentak, -1)
		// Buku pertama paling LAMA — selesai terakhir.
		if c.Slug == "pt-a" {
			time.Sleep(30 * time.Millisecond)
		}
		switch c.Slug {
		case "pt-a":
			return []CheckResult{{Key: "jurnal-timpang", Judul: "Jurnal yang debit ≠ kredit",
				Labels: []string{"J1", "J2", "J3", "J4"}}}, nil
		case "pt-c":
			return nil, errors.New("COMPANY_KEDUA_DATABASE_URL_TEMPLATE tidak diset")
		}
		return nil, nil
	}
	r := Sweep(context.Background(), buku, periksa, 2, false)

	if puncak > 2 {
		t.Errorf("serentak %d melewati batas 2", puncak)
	}
	if r.Status != "error" || r.CompaniesChecked != 4 || r.CompaniesFailed != 1 || r.FindingCount != 4 {
		t.Fatalf("ringkasan salah: %+v", r)
	}
	mauFindings := []string{
		"pt-a · Jurnal yang debit ≠ kredit: J1", "pt-a · Jurnal yang debit ≠ kredit: J2",
		"pt-a · Jurnal yang debit ≠ kredit: J3", "pt-a · Jurnal yang debit ≠ kredit: J4",
	}
	if !reflect.DeepEqual(r.Findings, mauFindings) {
		t.Errorf("findings %q", r.Findings)
	}
	var slug []string
	for _, b := range r.PerCompany {
		slug = append(slug, b.Slug+":"+b.Status+"@"+b.Instance)
	}
	if got := strings.Join(slug, " "); got != "pt-a:findings@default pt-b:ok@default pt-c:error@kedua pt-d:ok@default" {
		t.Errorf("perCompany %s", got)
	}
	teks := strings.Join(r.Lines, "\n")
	for _, mau := range []string{
		"4 buku, 2 disapu bersamaan (CONFORMANCE_CONCURRENCY=2).\n",
		"\n✗ pt-a\n   Jurnal yang debit ≠ kredit: 4\n      · J1\n      · J2\n      · J3\n      … 1 lagi (pakai --detail)",
		"✓ pt-b [nonaktif] — bersih",
		"\n4 temuan di 4 perusahaan.",
		"   instans default: 3 buku, 1 bertemuan, 0 gagal diperiksa",
		"   instans kedua: 1 buku, 0 bertemuan, 1 gagal diperiksa",
		"\n1 perusahaan gagal diperiksa:\n   pt-c: COMPANY_KEDUA_DATABASE_URL_TEMPLATE tidak diset",
	} {
		if !strings.Contains(teks, mau) {
			t.Errorf("laporan tidak memuat %q:\n%s", mau, teks)
		}
	}
	if strings.Index(teks, "pt-a") > strings.Index(teks, "pt-b") {
		t.Error("laporan mengikuti urutan SELESAI, bukan urutan daftar")
	}
}

func TestTrailDetailsBentukYangDibacaKonsol(t *testing.T) {
	r := Result{Findings: make([]string, 250), PerCompany: nil}
	for i := range r.Findings {
		r.Findings[i] = "pt · Beban Bunga & Administrasi Bank"
	}
	d, err := TrailDetails(r, "v0.18.0+abc1234", "svc-integrator")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(d, `\u0026`) {
		t.Error("`&` diloloskan HTML — bentuk JSON.stringify Node tidak begitu")
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(d), &m); err != nil {
		t.Fatal(err)
	}
	if n := len(m["findings"].([]any)); n != TrailFindingsMax {
		t.Errorf("findings %d, mau dipangkas %d", n, TrailFindingsMax)
	}
	for _, k := range []string{"failures", "perCompany"} {
		if _, ok := m[k].([]any); !ok {
			t.Errorf("%s bukan larik: %v", k, m[k])
		}
	}
	if m["runner"] != "go" || m["service"] != "svc-integrator" || m["build"] != "v0.18.0+abc1234" {
		t.Errorf("stempel pelaksana salah: %v", m)
	}
}
