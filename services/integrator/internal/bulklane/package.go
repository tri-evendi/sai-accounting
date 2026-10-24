package bulklane

// ══ `report.package` — PAKET LAPORAN (09 §5, keputusan pemilik 24 Okt 2026) ═
//
// Banyak laporan satu periode satu PT menjadi SATU berkas ZIP:
//
//	00_Ringkasan_Paket.pdf          ← halaman ringkasan (Node)
//	PDF/01_Neraca.pdf …             ← satu PDF per laporan (Node)
//	Paket_Laporan_<periode>.xlsx    ← satu buku kerja, satu lembar per laporan (Go, di sini)
//
// ══ KENAPA GO MERANGKAI, DAN NODE MENGGAMBAR PDF ═══════════════════════════
// Dua penghasil berkas laporan hidup di dua bahasa, dan keduanya SUDAH ADA:
// lembar sebar laporan ber-`engine: "go"` hanya boleh dihasilkan Go (register
// `src/lib/report-engine.ts`: "versi TS untuk jalur berkas dicabut"), dan PDF
// hanya punya generator TypeScript (09 §5). Paket ini karena itu tidak menulis
// satu baris aritmetika laporan pun:
//
//   - lembar: `interactivelane.LembarLaporan` — fungsi yang SAMA dengan
//     `report.export_go`, dengan muatan yang SAMA bentuknya (dihitung penerbit
//     TS lewat `goExportPayloadShape`, termasuk instan batas periode Jakarta);
//   - PDF: pekerjaan anak `report.package_pdf` di jalur `interactive` Node,
//     diterbitkan BERSAMA induknya oleh penerbit TS (`src/lib/report-package-job.ts`)
//     — Go tidak menerbitkan apa pun. Anak menulis ZIP antara berisi ringkasan
//     + PDF; di sini entri-entrinya DISALIN mentah (`zip.Writer.Copy`, tanpa
//     dekompresi) ke berkas akhir.
//
// Induk di jalur `bulk` karena ia MENUNGGU anaknya dan menghitung belasan
// laporan berurutan: menahan pelari `interactive` Go selama itu membuat setiap
// ekspor satu laporan ikut mengantre. Di sini ia juga di bawah pagar memori
// per pekerjaan. Lembar sebar dihitung SELAGI Node menggambar PDF — dua proses,
// dua jalur, berjalan bersamaan.
//
// ══ MEMORI ═════════════════════════════════════════════════════════════════
// Laporan dihitung BERURUTAN; yang ditahan hanya model lembar (sel) sampai
// buku kerjanya dirakit sekali. PDF tidak pernah utuh di memori Go: entri ZIP
// anak disalin berkas-ke-berkas, dan ZIP akhir ditulis mengalir ke volume
// `hasil` (`document.WriteResultStream`, `.partial` lalu rename).

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/document"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/interactivelane"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// muatanPaket: bentuk `ReportPackagePayload` di `src/lib/report-package.ts`.
type muatanPaket struct {
	RequestedBy  string                      `json:"requestedBy"`
	From         string                      `json:"from"`
	To           string                      `json:"to"`
	PeriodLabel  string                      `json:"periodLabel"`
	Formats      []string                    `json:"formats"`
	PdfJobID     int64                       `json:"pdfJobId"`
	FileName     string                      `json:"fileName"`
	WorkbookName string                      `json:"workbookName"`
	Reports      []laporanPaket              `json:"reports"`
	Excluded     []document.PackageExclusion `json:"excluded"`
	Summary      document.PackageSummaryText `json:"summary"`
}

type laporanPaket struct {
	ReportID string          `json:"reportId"`
	Title    string          `json:"title"`
	Export   json.RawMessage `json:"export"`
}

// Ketahanan menunggu anak. Batasnya bukan perkiraan durasi PDF — ia batas
// "pelari Node tampaknya tidak pernah mengambilnya": 20 menit jauh di atas
// paket terbesar yang masuk akal (belasan PDF), dan sesudahnya induk GAGAL
// dengan sebab yang terbaca alih-alih memegang pelari `bulk` selamanya.
var (
	jedaTungguAnak  = 2 * time.Second
	batasTungguAnak = 20 * time.Minute
)

// zipEntryName: nama entri di dalam ZIP — huruf, angka, `._-` per segmen,
// paling banyak satu folder. Nama datang dari muatan (penerbit TS) dan dari
// ZIP anak; yang di luar bentuk ini DITOLAK (zip-slip: `../`, jalur absolut).
func zipEntryName(n string) bool {
	if n == "" || len(n) > 200 || strings.HasPrefix(n, "/") || strings.Contains(n, "\\") {
		return false
	}
	bagian := strings.Split(n, "/")
	if len(bagian) > 2 {
		return false
	}
	for _, b := range bagian {
		if !document.ValidResultFilename(b) {
			return false
		}
	}
	return path.Clean(n) == n
}

// periksaMuatan menolak muatan yang tidak mungkin ditulis penerbit hari ini.
func periksaMuatan(m *muatanPaket) (xlsx bool, err error) {
	if len(m.Reports) == 0 {
		return false, errors.New("paket tanpa satu laporan pun")
	}
	if len(m.Formats) == 0 {
		return false, errors.New("paket tanpa format")
	}
	for _, f := range m.Formats {
		switch f {
		case "xlsx":
			xlsx = true
		case "pdf":
		default:
			return false, fmt.Errorf("format %q di luar pdf/xlsx", f)
		}
	}
	if m.PdfJobID <= 0 {
		return false, errors.New("muatan tanpa `pdfJobId` — ringkasan & PDF-nya tidak punya sumber")
	}
	if !document.ValidResultFilename(m.FileName) || !strings.HasSuffix(m.FileName, ".zip") {
		return false, fmt.Errorf("nama berkas paket tidak sah: %q", m.FileName)
	}
	if xlsx && (!zipEntryName(m.WorkbookName) || !strings.HasSuffix(m.WorkbookName, ".xlsx")) {
		return false, fmt.Errorf("nama buku kerja tidak sah: %q", m.WorkbookName)
	}
	for _, r := range m.Reports {
		if !contract.GoEngineReports[r.ReportID] {
			return false, fmt.Errorf("laporan %q bukan milik mesin Go di src/lib/report-engine.ts", r.ReportID)
		}
		var inner struct {
			ReportID string `json:"reportId"`
		}
		if err := json.Unmarshal(r.Export, &inner); err != nil || inner.ReportID != r.ReportID {
			return false, fmt.Errorf("muatan ekspor laporan %q tidak cocok dengan id-nya", r.ReportID)
		}
	}
	return xlsx, nil
}

// pembacaAnak: yang dibutuhkan penunggu dari antrean — seam untuk tes.
type pembacaAnak interface {
	Outcome(ctx context.Context, id int64) (*jobs.Outcome, error)
}

// tungguAnak menunggu `report.package_pdf` selesai dan memulangkan
// `result_ref`-nya. Anak WAJIB berjenis itu dan milik PT yang sama — id di
// muatan tidak dipercaya begitu saja.
func tungguAnak(ctx context.Context, q pembacaAnak, id int64, companyID *int32, lapor func(int)) (string, error) {
	batas := time.Now().Add(batasTungguAnak)
	for {
		o, err := q.Outcome(ctx, id)
		if err != nil {
			return "", err
		}
		if o.Kind != contract.KindReportPackagePdf {
			return "", fmt.Errorf("pekerjaan #%d berjenis %s, bukan %s", id, o.Kind, contract.KindReportPackagePdf)
		}
		if o.CompanyID == nil || companyID == nil || *o.CompanyID != *companyID {
			return "", fmt.Errorf("pekerjaan #%d bukan milik PT paket ini", id)
		}
		switch o.Status {
		case contract.StatusDone:
			if o.ResultRef == nil || *o.ResultRef == "" {
				return "", fmt.Errorf("bagian PDF #%d selesai tanpa berkas", id)
			}
			return *o.ResultRef, nil
		case contract.StatusDead:
			pesan := strings.TrimSpace(o.LastError)
			if i := strings.LastIndex(pesan, "\n"); i >= 0 {
				pesan = pesan[i+1:]
			}
			return "", fmt.Errorf("bagian PDF #%d gagal: %s", id, pesan)
		}
		lapor(o.Progress)
		if time.Now().After(batas) {
			return "", fmt.Errorf("bagian PDF #%d belum selesai sesudah %s — pelari `interactive` Node mungkin mati", id, batasTungguAnak)
		}
		t := time.NewTimer(jedaTungguAnak)
		select {
		case <-ctx.Done():
			t.Stop()
			return "", ctx.Err()
		case <-t.C:
		}
	}
}

// tulisPaket menulis ZIP akhir: entri ZIP anak disalin mentah, lalu buku kerja.
func tulisPaket(w io.Writer, anakPath string, workbookName string, workbook []byte, now time.Time) (int, error) {
	zr, err := zip.OpenReader(anakPath)
	if err != nil {
		return 0, fmt.Errorf("buka bagian PDF: %w", err)
	}
	defer zr.Close()

	zw := zip.NewWriter(w)
	n := 0
	for _, f := range zr.File {
		if !zipEntryName(f.Name) {
			return 0, fmt.Errorf("entri bagian PDF tidak sah: %q", f.Name)
		}
		if err := zw.Copy(f); err != nil {
			return 0, fmt.Errorf("salin %s: %w", f.Name, err)
		}
		n++
	}
	if workbook != nil {
		// Store, bukan Deflate: XLSX sudah ZIP terkompresi; mengompresnya lagi
		// hanya membakar CPU.
		fw, err := zw.CreateHeader(&zip.FileHeader{Name: workbookName, Method: zip.Store, Modified: now})
		if err != nil {
			return 0, err
		}
		if _, err := fw.Write(workbook); err != nil {
			return 0, err
		}
		n++
	}
	if err := zw.Close(); err != nil {
		return 0, err
	}
	return n, nil
}

func handlerPaket(kolam *pgxpool.Pool, q pembacaAnak, hasilRoot string) jobs.Handler {
	return func(c jobs.Ctx) (*string, error) {
		var m muatanPaket
		if err := json.Unmarshal(c.Payload, &m); err != nil {
			return nil, fmt.Errorf("muatan tidak terbaca: %w", err)
		}
		xlsx, err := periksaMuatan(&m)
		if err != nil {
			return nil, err
		}
		company, err := registry.Lookup(c.Ctx, kolam, c.Job.CompanyID)
		if err != nil {
			return nil, err
		}
		_ = c.Progress(5)
		now := time.Now()

		// ── 1. Lembar sebar — berurutan, selagi Node menggambar PDF ────────
		var workbook []byte
		if xlsx {
			entries := make([]document.PackageEntry, 0, len(m.Reports))
			name := ""
			for i, r := range m.Reports {
				if c.Ctx.Err() != nil {
					return nil, c.Ctx.Err()
				}
				l, err := interactivelane.LembarLaporan(c.Ctx, company, r.Export, now, nil)
				if err != nil {
					return nil, fmt.Errorf("%s: %w", r.ReportID, err)
				}
				name = l.Company
				entries = append(entries, document.PackageEntry{Title: r.Title, Sheet: l.Sheet})
				_ = c.Progress(5 + 55*(i+1)/len(m.Reports))
			}
			workbook, err = document.PackageWorkbook(m.Summary, name, m.PeriodLabel, entries, m.Excluded, now)
			if err != nil {
				return nil, err
			}
		}

		// ── 2. Bagian PDF dari Node ─────────────────────────────────────────
		terakhir := -1
		ref, err := tungguAnak(c.Ctx, q, m.PdfJobID, c.Job.CompanyID, func(p int) {
			persen := 60 + 30*p/100
			if persen != terakhir {
				terakhir = persen
				_ = c.Progress(persen)
			}
		})
		if err != nil {
			return nil, err
		}
		anakDir, err := document.ResultDir(contract.KindReportPackagePdf, m.PdfJobID)
		if err != nil {
			return nil, err
		}
		if !strings.HasPrefix(ref, anakDir+"/") {
			return nil, fmt.Errorf("berkas bagian PDF %q di luar putaran #%d", ref, m.PdfJobID)
		}
		anakPath, err := document.ResultPath(hasilRoot, ref)
		if err != nil {
			return nil, err
		}

		// ── 3. ZIP akhir, mengalir ke volume `hasil` ───────────────────────
		if c.Ctx.Err() != nil {
			return nil, c.Ctx.Err()
		}
		_ = c.Progress(92)
		var entri int
		out, err := document.WriteResultStream(hasilRoot, c.Job.Kind, c.Job.ID, m.FileName, func(w io.Writer) error {
			n, err := tulisPaket(w, anakPath, m.WorkbookName, workbook, now)
			entri = n
			return err
		})
		if err != nil {
			return nil, err
		}
		// Berkas antara tidak diunduh siapa pun (pintunya `null`); dibuang
		// sesudah paket tertulis. Gagal membuangnya bukan kegagalan paket —
		// pembersih hasil di upkeep menyapunya.
		if err := os.RemoveAll(filepath.Join(hasilRoot, anakDir)); err != nil {
			log.Printf("[bulk] #%d ⚠ bagian PDF #%d tidak terbuang: %v", c.Job.ID, m.PdfJobID, err)
		}
		log.Printf("[bulk] #%d paket laporan %s: %d laporan · %d dikecualikan · %d entri ZIP",
			c.Job.ID, company.Slug, len(m.Reports), len(m.Excluded), entri)
		_ = c.Progress(100)
		return &out, nil
	}
}
