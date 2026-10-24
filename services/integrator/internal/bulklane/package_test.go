package bulklane

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

func muatanSah() muatanPaket {
	exp, _ := json.Marshal(map[string]any{"reportId": "trial-balance", "params": map[string]string{"asOf": "2026-01-31"}})
	return muatanPaket{
		Formats:      []string{"pdf", "xlsx"},
		PdfJobID:     7,
		FileName:     "Paket_Laporan_2026-01-01_2026-01-31.zip",
		WorkbookName: "Paket_Laporan_2026-01-01_2026-01-31.xlsx",
		Reports:      []laporanPaket{{ReportID: "trial-balance", Title: "Neraca Saldo", Export: exp}},
	}
}

// Muatan yang tidak mungkin ditulis penerbit hari ini DITOLAK sebelum satu
// buku pun dibuka.
func TestPeriksaMuatanPaket(t *testing.T) {
	m := muatanSah()
	if xlsx, err := periksaMuatan(&m); err != nil || !xlsx {
		t.Fatalf("muatan sah ditolak: %v (xlsx %v)", err, xlsx)
	}
	ubah := map[string]func(*muatanPaket){
		"tanpa laporan":         func(m *muatanPaket) { m.Reports = nil },
		"tanpa format":          func(m *muatanPaket) { m.Formats = nil },
		"format asing":          func(m *muatanPaket) { m.Formats = []string{"docx"} },
		"tanpa anak PDF":        func(m *muatanPaket) { m.PdfJobID = 0 },
		"nama zip menjelajah":   func(m *muatanPaket) { m.FileName = "../x.zip" },
		"nama zip bukan zip":    func(m *muatanPaket) { m.FileName = "x.exe" },
		"buku kerja menjelajah": func(m *muatanPaket) { m.WorkbookName = "../../x.xlsx" },
		"laporan bukan Go":      func(m *muatanPaket) { m.Reports[0].ReportID = "project-profit" },
		"ekspor tak cocok": func(m *muatanPaket) {
			m.Reports[0].Export = json.RawMessage(`{"reportId":"balance-sheet"}`)
		},
	}
	for nama, f := range ubah {
		m := muatanSah()
		f(&m)
		if _, err := periksaMuatan(&m); err == nil {
			t.Errorf("%s: diterima", nama)
		}
	}
	// Hanya PDF: buku kerja tidak dihitung, namanya boleh kosong.
	m = muatanSah()
	m.Formats, m.WorkbookName = []string{"pdf"}, ""
	if xlsx, err := periksaMuatan(&m); err != nil || xlsx {
		t.Fatalf("paket PDF saja: %v (xlsx %v)", err, xlsx)
	}
}

func TestZipEntryNameMenolakZipSlip(t *testing.T) {
	for _, ok := range []string{"00_Ringkasan_Paket.pdf", "PDF/01_Neraca.pdf", "Paket.xlsx"} {
		if !zipEntryName(ok) {
			t.Errorf("%q ditolak", ok)
		}
	}
	for _, bad := range []string{"", "../x.pdf", "/etc/passwd", "a/b/c.pdf", "PDF\\x.pdf", "PDF/../x.pdf", "PDF/.", "a b.pdf"} {
		if zipEntryName(bad) {
			t.Errorf("%q diterima", bad)
		}
	}
}

type antreanPalsu struct{ urutan []jobs.Outcome }

func (a *antreanPalsu) Outcome(_ context.Context, _ int64) (*jobs.Outcome, error) {
	o := a.urutan[0]
	if len(a.urutan) > 1 {
		a.urutan = a.urutan[1:]
	}
	return &o, nil
}

func i32(v int32) *int32 { return &v }

func TestTungguAnak(t *testing.T) {
	jedaTungguAnak = time.Millisecond
	t.Cleanup(func() { jedaTungguAnak = 2 * time.Second })
	ref := "report-package_pdf-7/pdf.zip"
	pt := i32(3)
	ok := &antreanPalsu{urutan: []jobs.Outcome{
		{Kind: contract.KindReportPackagePdf, CompanyID: pt, Status: contract.StatusQueued},
		{Kind: contract.KindReportPackagePdf, CompanyID: pt, Status: contract.StatusClaimed, Progress: 50},
		{Kind: contract.KindReportPackagePdf, CompanyID: pt, Status: contract.StatusDone, ResultRef: &ref},
	}}
	var kemajuan []int
	got, err := tungguAnak(context.Background(), ok, 7, pt, func(p int) { kemajuan = append(kemajuan, p) })
	if err != nil || got != ref {
		t.Fatalf("tungguAnak = %q, %v", got, err)
	}
	if len(kemajuan) != 2 || kemajuan[1] != 50 {
		t.Errorf("kemajuan anak tidak diteruskan: %v", kemajuan)
	}

	gagal := map[string]jobs.Outcome{
		"mati":           {Kind: contract.KindReportPackagePdf, CompanyID: pt, Status: contract.StatusDead, LastError: "percobaan 1\nPDF rusak"},
		"jenis lain":     {Kind: contract.KindReportExportGo, CompanyID: pt, Status: contract.StatusDone, ResultRef: &ref},
		"PT lain":        {Kind: contract.KindReportPackagePdf, CompanyID: i32(4), Status: contract.StatusDone, ResultRef: &ref},
		"selesai kosong": {Kind: contract.KindReportPackagePdf, CompanyID: pt, Status: contract.StatusDone},
	}
	for nama, o := range gagal {
		_, err := tungguAnak(context.Background(), &antreanPalsu{urutan: []jobs.Outcome{o}}, 7, pt, func(int) {})
		if err == nil {
			t.Errorf("%s: diterima", nama)
		}
		if nama == "mati" && (err == nil || !strings.Contains(err.Error(), "PDF rusak")) {
			t.Errorf("sebab anak yang mati tidak terbaca: %v", err)
		}
	}

	// Pembatalan menghentikan penantian.
	ctx, batal := context.WithCancel(context.Background())
	batal()
	menunggu := &antreanPalsu{urutan: []jobs.Outcome{{Kind: contract.KindReportPackagePdf, CompanyID: pt, Status: contract.StatusQueued}}}
	if _, err := tungguAnak(ctx, menunggu, 7, pt, func(int) {}); err == nil {
		t.Error("penantian tidak berhenti saat dibatalkan")
	}
}

// ZIP akhir = entri ZIP anak (disalin apa adanya, urutannya tetap) + buku kerja.
func TestTulisPaket(t *testing.T) {
	dir := t.TempDir()
	anak := filepath.Join(dir, "pdf.zip")
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	for _, n := range []string{"00_Ringkasan_Paket.pdf", "PDF/01_Neraca.pdf", "PDF/02_Laporan_Laba_Rugi.pdf"} {
		w, _ := zw.Create(n)
		_, _ = w.Write([]byte("%PDF-1.3 " + n))
	}
	_ = zw.Close()
	if err := os.WriteFile(anak, b.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	n, err := tulisPaket(&out, anak, "Paket_Laporan.xlsx", []byte("PK-xlsx"), time.Now())
	if err != nil || n != 4 {
		t.Fatalf("tulisPaket = %d, %v", n, err)
	}
	zr, err := zip.NewReader(bytes.NewReader(out.Bytes()), int64(out.Len()))
	if err != nil {
		t.Fatal(err)
	}
	var nama []string
	for _, f := range zr.File {
		nama = append(nama, f.Name)
	}
	want := "00_Ringkasan_Paket.pdf,PDF/01_Neraca.pdf,PDF/02_Laporan_Laba_Rugi.pdf,Paket_Laporan.xlsx"
	if strings.Join(nama, ",") != want {
		t.Fatalf("entri %v", nama)
	}
	rc, _ := zr.File[1].Open()
	isi := new(bytes.Buffer)
	_, _ = isi.ReadFrom(rc)
	_ = rc.Close()
	if isi.String() != "%PDF-1.3 PDF/01_Neraca.pdf" {
		t.Errorf("isi PDF berubah saat disalin: %q", isi.String())
	}

	// Paket PDF saja: tanpa buku kerja.
	out.Reset()
	if n, err := tulisPaket(&out, anak, "", nil, time.Now()); err != nil || n != 3 {
		t.Fatalf("paket PDF saja = %d, %v", n, err)
	}

	// Entri anak yang menjelajah keluar DITOLAK.
	b.Reset()
	zw = zip.NewWriter(&b)
	w, _ := zw.Create("../luar.pdf")
	_, _ = w.Write([]byte("x"))
	_ = zw.Close()
	_ = os.WriteFile(anak, b.Bytes(), 0o600)
	if _, err := tulisPaket(&bytes.Buffer{}, anak, "", nil, time.Now()); err == nil {
		t.Error("entri zip-slip disalin")
	}
}
