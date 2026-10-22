// Package interactivelane: pelari jalur `interactive` sisi Go — berkas
// laporan yang dihitung Go (tahap 1d, 09 §9).
//
// Dijalankan `cmd/integrator` (service `svc-integrator`, bersama jalur
// `tenant` di proses yang sama) dan `cmd/interactive` saat mengembangkan.
//
// ══ SATU JALUR, DUA BAHASA — POLA YANG SAMA DENGAN `tenant` ═══════════════
// Jalur `interactive` dilayani DUA pelari selama tahap 1d: `workers/interactive.ts`
// (Node, peran `interactive` di `svc-worker`) mengklaim `report.export`, pelari
// ini mengklaim `report.export_go`. Laporan mana yang masuk ke sini diputuskan
// register `src/lib/report-engine.ts` (`engine: "go"`), dan penerbitnya satu:
// `src/lib/report-export-go.ts`. Satu `kind` dengan dua pengklaim ditolak
// `tests/kind-punya-pengklaim.test.ts`.
//
// ══ HANYA MEMBACA BUKU ═════════════════════════════════════════════════════
// Buku PT dibaca lewat `internal/ledgerread` (transaksi READ ONLY), registry
// lewat `internal/registry`; satu-satunya tabel yang ditulis pelari ini adalah
// `jobs` (lewat `internal/jobs`). Berkasnya mendarat di volume `hasil` dengan
// bentuk yang dibaca rute unduhan TS (`internal/document/result.go`).
//
// ══ SEPROSES DENGAN RAHASIA CADANGAN — DIPUTUSKAN, BUKAN KEBETULAN ════════
// Jalur ini MEMPROSES MASUKAN PENGGUNA (parameter laporan). Sampai 22 Okt 2026
// ia sengaja tidak berbagi proses dengan `BACKUP_ENCRYPTION_KEY`; sejak
// keputusan pemilik "1 image = 1 container" ia berbagi proses dengan
// `tenantlane`, yang membaca kunci itu dan punya sambungan langsung ke `pg`.
// Yang tersisa sebagai batas: paket ini TIDAK membaca variabel cadangan apa
// pun dan tidak mengimpor `internal/backup`, dan muatan pekerjaan diurai ke
// struktur bertipe sempit (`muatanEkspor`) — tidak pernah dirangkai ke SQL
// atau perintah. Risiko yang diterima dan syarat memisahkannya lagi:
// docs/arsitektur/09-RANCANGAN-LAYANAN.md §3.2.
//
// Koneksinya lewat `CONTROL_DATABASE_URL` (PgBouncer): satu buku per
// pekerjaan, bukan pencacahan seluruh server.
package interactivelane

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
	// Basis data zona waktu di DALAM biner: image `debian:bookworm-slim`
	// tidak memuat `tzdata`, dan tanpanya `TZ=Asia/Jakarta` diam-diam menjadi
	// UTC — baris "Dicetak" bergeser tujuh jam tanpa satu galat pun.
	_ "time/tzdata"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/document"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// Run menguras jalur `interactive` (kind Go) sampai SIGTERM/SIGINT atau
// sampai `stop` selesai (boleh nil).
func Run(ctx, stop context.Context) error {
	// Dua koneksi kendali: satu untuk pelari, satu untuk pembacaan registry.
	// Jalur ini BUKAN tunggal-instans (`single_instance: false`), jadi tidak
	// ada advisory lock yang menahan satu koneksi.
	kolam, err := db.Kendali(ctx, 2)
	if err != nil {
		return err
	}
	defer kolam.Close()

	// Akar TIDAK dibaca dari lingkungan — alasan yang sama dengan
	// `RESULTS_ROOT` di sisi TS: akar yang bisa disetel `.env` adalah akar yang
	// bisa salah disetel, dan pembacanya (rute unduhan) tidak ikut berpindah.
	root := document.ResultsRootDefault

	pelari := &jobs.Runner{
		Lane:  contract.LaneInteractive,
		Queue: jobs.New(kolam),
		Handlers: map[contract.JobKind]jobs.Handler{
			contract.KindReportExportGo: handlerEkspor(kolam, root),
		},
		Stop: stop,
	}
	return pelari.Run(ctx)
}

// muatanEkspor: bentuk `GoExportPayload` di `src/lib/report-export-go.ts`.
type muatanEkspor struct {
	ReportID    string            `json:"reportId"`
	Params      map[string]string `json:"params"`
	AsOfInstant string            `json:"asOfInstant"`
}

func handlerEkspor(kolam *pgxpool.Pool, root string) jobs.Handler {
	return func(c jobs.Ctx) (*string, error) {
		var m muatanEkspor
		if err := json.Unmarshal(c.Payload, &m); err != nil {
			return nil, fmt.Errorf("muatan tidak terbaca: %w", err)
		}
		if m.ReportID == "" {
			return nil, errors.New("muatan tanpa `reportId` — pekerjaan ini tidak bisa tahu laporan mana")
		}
		if !contract.GoEngineReports[m.ReportID] {
			// Register sudah tidak menyatakan laporan ini milik Go (atau tak
			// pernah). Melempar — bukan menghasilkan berkas dari mesin yang
			// register-nya sendiri sudah dicabut.
			return nil, fmt.Errorf("laporan %q bukan milik mesin Go di src/lib/report-engine.ts", m.ReportID)
		}

		company, err := registry.Lookup(c.Ctx, kolam, c.Job.CompanyID)
		if err != nil {
			return nil, err
		}
		// Perusahaan NONAKTIF tetap dikerjakan — alasan yang sama dengan sisi
		// Node: jalur ini hanya MEMBACA, dan mengekspor buku yang akan
		// diarsipkan justru alasan orang menonaktifkannya.

		_ = c.Progress(10)
		var data []byte
		var filename string
		switch m.ReportID {
		case contract.ReportTrialBalance:
			data, filename, err = neracaSaldo(c.Ctx, company, m, c.Progress)
		default:
			err = fmt.Errorf("laporan %q belum punya penghasil berkas Go", m.ReportID)
		}
		if err != nil {
			return nil, err
		}
		if c.Ctx.Err() != nil {
			// Dibatalkan / lease hilang SESUDAH perhitungan: tidak meninggalkan
			// berkas yang tidak akan diunduh siapa pun.
			return nil, c.Ctx.Err()
		}

		_ = c.Progress(90)
		ref, err := document.WriteResult(root, c.Job.Kind, c.Job.ID, filename, data)
		if err != nil {
			return nil, err
		}
		return &ref, nil
	}
}

func neracaSaldo(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	// Instan dihitung PENERBIT (`resolveAsOf`, zona proses Node) dan diterima
	// apa adanya — lihat kepala `src/lib/report-export-go.ts`.
	asOf, err := time.Parse(time.RFC3339Nano, m.AsOfInstant)
	if err != nil {
		return nil, "", fmt.Errorf("asOfInstant %q: %w", m.AsOfInstant, err)
	}
	period, err := document.PeriodAsOf(m.Params["asOf"])
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	tb, err := r.TrialBalance(ctx, asOf)
	if err != nil {
		return nil, "", err
	}
	if len(tb.UnknownTypes) > 0 {
		log.Printf("[interactive-go] ⚠ %s: akun bertipe di luar kontrak: %s",
			company.Slug, strings.Join(tb.UnknownTypes, ", "))
	}
	_ = progress(55)

	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.TrialBalanceWorkbook(tb, name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.TrialBalanceTitle, now), nil
}

// companyName: urutan `pickIdentity()` — setting wizard, lalu nama registry,
// lalu nama cadangan. Galat pembacaan setting DITELAN, seperti
// `getCompanyIdentity()` yang tidak pernah melempar: kop berkas yang memakai
// nama registry jauh lebih baik daripada ekspor yang gagal karena kop.
func companyName(ctx context.Context, r *ledgerread.Reader, company *registry.Company) string {
	setting, err := r.CompanySettingName(ctx)
	if err != nil {
		log.Printf("[interactive-go] ⚠ %s: %v — memakai nama registry", company.Slug, err)
	}
	if s := strings.TrimSpace(setting); s != "" {
		return s
	}
	if s := strings.TrimSpace(company.Name); s != "" {
		return s
	}
	return contract.CompanyNameFallback
}
