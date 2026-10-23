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
	"strconv"
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
// Laporan "per tanggal" membawa AsOfInstant; laporan berperiode (Laba Rugi)
// FromInstant + ToInstant — semuanya dihitung PENERBIT (`resolveAsOf` /
// `resolvePeriod`), tidak pernah di sini. Kolom pembanding (#557):
// `params.compare` + PriorFromInstant/PriorToInstant (Laba Rugi) atau
// PriorAsOfInstant (Neraca), dari `comparisonRange`/`comparisonDate` penerbit.
type muatanEkspor struct {
	ReportID         string            `json:"reportId"`
	Params           map[string]string `json:"params"`
	AsOfInstant      string            `json:"asOfInstant"`
	FromInstant      string            `json:"fromInstant"`
	ToInstant        string            `json:"toInstant"`
	PriorFromInstant string            `json:"priorFromInstant"`
	PriorToInstant   string            `json:"priorToInstant"`
	PriorAsOfInstant string            `json:"priorAsOfInstant"`
}

// comparative memutuskan apakah muatan meminta kolom pembanding, dan MENOLAK
// muatan yang setengah-setengah: mode tanpa instannya, instan tanpa mode, atau
// mode di luar kosakata (`contract.ComparisonModes`). Penerbit TS membuang
// `compare` yang tak dikenal sebelum menerbitkan, jadi muatan seperti itu
// bukan permintaan pengguna — dan mencetak lembar SATU kolom untuknya berarti
// menelan kolom pembanding tanpa satu galat pun.
func comparative(m muatanEkspor, instants ...string) (bool, error) {
	mode := m.Params["compare"]
	present := 0
	for _, v := range instants {
		if v != "" {
			present++
		}
	}
	switch {
	case mode == "" && present == 0:
		return false, nil
	case mode != "" && !contract.ComparisonModes[mode]:
		return false, fmt.Errorf("compare %q di luar kosakata (src/lib/statement-compare.ts)", mode)
	case mode == "" || present != len(instants):
		return false, fmt.Errorf("muatan pembanding tidak lengkap: compare %q, %d dari %d instan", mode, present, len(instants))
	}
	return true, nil
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
		// Laba Rugi & Neraca: penghasilnya SUDAH ada, tetapi selama register
		// menyatakan `go-parity` keduanya tidak pernah sampai ke sini —
		// `GoEngineReports` di atas menolaknya lebih dulu. Cabang ini menunggu
		// paritas produksi, bukan sebaliknya.
		case contract.ReportIncomeStatement:
			data, filename, err = labaRugi(c.Ctx, company, m, c.Progress)
		case contract.ReportBalanceSheet:
			data, filename, err = neraca(c.Ctx, company, m, c.Progress)
		// Arus Kas (tahap 1d): `go` sejak paritas produksi 23 Okt 2026.
		case contract.ReportCashFlow:
			data, filename, err = arusKas(c.Ctx, company, m, c.Progress)
		// Laporan Perubahan Ekuitas (berkas sejak keputusan pemilik 23 Okt
		// 2026, `go-parity`): penghasilnya ADA, tetapi `GoEngineReports`
		// menolaknya lebih dulu sampai paritas produksinya lulus — pola yang
		// sama dengan Arus Kas dulu.
		case contract.ReportEquityChanges:
			data, filename, err = perubahanEkuitas(c.Ctx, company, m, c.Progress)
		// Umur Piutang & Umur Utang (`go-parity`): sama — penghasilnya ada,
		// register yang memutuskan kapan cabang ini terjangkau.
		case contract.ReportReceivables, contract.ReportPayables:
			data, filename, err = umur(c.Ctx, company, m, c.Progress)
		// Gelombang A berikutnya (`go-parity`, 23 Okt 2026): Rekap per Pihak,
		// Laporan Kas & Bank, Realisasi vs Anggaran — penghasilnya ada,
		// `GoEngineReports` di atas yang memutuskan kapan terjangkau.
		case contract.ReportSalesByCustomer, contract.ReportPurchasesBySupplier:
			data, filename, err = rekapPihak(c.Ctx, company, m, c.Progress)
		case contract.ReportCashBank:
			data, filename, err = kasBank(c.Ctx, company, m, c.Progress)
		case contract.ReportBudgetRealization:
			data, filename, err = anggaran(c.Ctx, company, m, c.Progress)
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

func labaRugi(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	from, err := time.Parse(time.RFC3339Nano, m.FromInstant)
	if err != nil {
		return nil, "", fmt.Errorf("fromInstant %q: %w", m.FromInstant, err)
	}
	to, err := time.Parse(time.RFC3339Nano, m.ToInstant)
	if err != nil {
		return nil, "", fmt.Errorf("toInstant %q: %w", m.ToInstant, err)
	}
	raw := m.Params["costCenter"]
	cc, err := ledgerread.ParseCostCenterFilter(raw)
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	is, err := r.IncomeStatement(ctx, &from, &to, cc)
	if err != nil {
		return nil, "", err
	}
	if len(is.UnknownTypes) > 0 {
		log.Printf("[interactive-go] ⚠ %s: akun bertipe di luar kontrak: %s",
			company.Slug, strings.Join(is.UnknownTypes, ", "))
	}
	_ = progress(55)

	ccLabel, err := document.CostCenterLabel(raw, cc, func(id int64) (string, string, bool, error) {
		return r.CostCenter(ctx, id)
	})
	if err != nil {
		return nil, "", err
	}
	period, err := document.PeriodRange(m.Params["from"], m.Params["to"], ccLabel)
	if err != nil {
		return nil, "", err
	}
	prior, err := priorIncomeStatement(ctx, r, m, cc)
	if err != nil {
		return nil, "", err
	}
	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.IncomeStatementWorkbook(is, prior, name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.IncomeStatementTitle, now), nil
}

func neraca(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
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

	bs, err := r.BalanceSheet(ctx, asOf)
	if err != nil {
		return nil, "", err
	}
	if len(bs.UnknownTypes) > 0 {
		log.Printf("[interactive-go] ⚠ %s: akun bertipe di luar kontrak: %s",
			company.Slug, strings.Join(bs.UnknownTypes, ", "))
	}
	prior, err := priorBalanceSheet(ctx, r, m)
	if err != nil {
		return nil, "", err
	}
	_ = progress(55)

	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.BalanceSheetWorkbook(bs, prior, name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.BalanceSheetTitle, now), nil
}

func arusKas(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	// Instan dihitung PENERBIT (`resolvePeriod`), diterima apa adanya. Arus
	// Kas tidak punya kolom pembanding — muatan yang membawanya DITOLAK, bukan
	// dicetak satu kolom diam-diam.
	if m.Params["compare"] != "" || m.PriorFromInstant != "" || m.PriorToInstant != "" || m.PriorAsOfInstant != "" {
		return nil, "", fmt.Errorf("arus kas tidak punya kolom pembanding (compare %q)", m.Params["compare"])
	}
	from, err := time.Parse(time.RFC3339Nano, m.FromInstant)
	if err != nil {
		return nil, "", fmt.Errorf("fromInstant %q: %w", m.FromInstant, err)
	}
	to, err := time.Parse(time.RFC3339Nano, m.ToInstant)
	if err != nil {
		return nil, "", fmt.Errorf("toInstant %q: %w", m.ToInstant, err)
	}
	period, err := document.PeriodRange(m.Params["from"], m.Params["to"], "")
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	cf, err := r.CashFlow(ctx, &from, &to)
	if err != nil {
		return nil, "", err
	}
	if len(cf.UnknownTypes) > 0 {
		log.Printf("[interactive-go] ⚠ %s: akun lawan kas bertipe di luar kontrak: %s",
			company.Slug, strings.Join(cf.UnknownTypes, ", "))
	}
	_ = progress(55)

	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.CashFlowWorkbook(cf, name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.CashFlowTitle, now), nil
}

// perubahanEkuitas: Laporan Perubahan Ekuitas [fromInstant, toInstant].
// Instan dihitung PENERBIT (`resolvePeriod`), diterima apa adanya. Tanpa
// kolom pembanding — muatan yang membawanya DITOLAK, bukan dicetak satu kolom
// diam-diam.
func perubahanEkuitas(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	if m.Params["compare"] != "" || m.PriorFromInstant != "" || m.PriorToInstant != "" || m.PriorAsOfInstant != "" {
		return nil, "", fmt.Errorf("laporan perubahan ekuitas tidak punya kolom pembanding (compare %q)", m.Params["compare"])
	}
	from, err := time.Parse(time.RFC3339Nano, m.FromInstant)
	if err != nil {
		return nil, "", fmt.Errorf("fromInstant %q: %w", m.FromInstant, err)
	}
	to, err := time.Parse(time.RFC3339Nano, m.ToInstant)
	if err != nil {
		return nil, "", fmt.Errorf("toInstant %q: %w", m.ToInstant, err)
	}
	period, err := document.PeriodRange(m.Params["from"], m.Params["to"], "")
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	es, err := r.EquityStatement(ctx, from, to)
	if err != nil {
		return nil, "", err
	}
	if len(es.UnknownTypes) > 0 {
		log.Printf("[interactive-go] ⚠ %s: akun bergerak bertipe di luar kontrak: %s",
			company.Slug, strings.Join(es.UnknownTypes, ", "))
	}
	_ = progress(55)

	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.EquityStatementWorkbook(es, name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.EquityStatementTitle, now), nil
}

// umur: Umur Piutang / Umur Utang per `asOfInstant`. Parameter halaman yang
// ikut muatan: `cols` (kolom tampil, `resolveColumns`) dan `overdue` ("1" =
// hanya jatuh tempo) — keduanya dibaca `buildReportPayload` TS dengan bunyi
// yang sama.
func umur(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	asOf, err := time.Parse(time.RFC3339Nano, m.AsOfInstant)
	if err != nil {
		return nil, "", fmt.Errorf("asOfInstant %q: %w", m.AsOfInstant, err)
	}
	period, err := document.PeriodAsOf(m.Params["asOf"])
	if err != nil {
		return nil, "", err
	}
	specs, err := document.AgingColumnsFor(m.ReportID)
	if err != nil {
		return nil, "", err
	}
	overdue := m.Params["overdue"] == "1"

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	var rep *ledgerread.AgingReport
	if m.ReportID == contract.ReportReceivables {
		rep, err = r.Receivables(ctx, asOf, overdue)
	} else {
		rep, err = r.Payables(ctx, asOf, overdue)
	}
	if err != nil {
		return nil, "", err
	}
	_ = progress(55)

	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.AgingWorkbook(rep, document.AgingVisibleColumns(specs, m.Params["cols"]), name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(document.AgingTitle(m.ReportID), now), nil
}

// tanpaPembanding menolak muatan berperiode yang membawa kolom pembanding —
// laporan-laporan di bawah tidak punya, dan mencetak lembar satu kolom diam-diam
// berarti menelan permintaan itu.
func tanpaPembanding(m muatanEkspor, nama string) error {
	if m.Params["compare"] != "" || m.PriorFromInstant != "" || m.PriorToInstant != "" || m.PriorAsOfInstant != "" {
		return fmt.Errorf("%s tidak punya kolom pembanding (compare %q)", nama, m.Params["compare"])
	}
	return nil
}

// periodeInstan: [fromInstant, toInstant] yang dihitung PENERBIT
// (`resolvePeriod` / `budgetPeriodRange`), diterima apa adanya.
func periodeInstan(m muatanEkspor) (time.Time, time.Time, error) {
	from, err := time.Parse(time.RFC3339Nano, m.FromInstant)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("fromInstant %q: %w", m.FromInstant, err)
	}
	to, err := time.Parse(time.RFC3339Nano, m.ToInstant)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("toInstant %q: %w", m.ToInstant, err)
	}
	return from, to, nil
}

// rekapPihak: Penjualan per Pelanggan / Pembelian per Pemasok [fromInstant,
// toInstant]. Parameter halaman yang ikut: `cols` (`resolveColumns`).
func rekapPihak(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	if err := tanpaPembanding(m, m.ReportID); err != nil {
		return nil, "", err
	}
	from, to, err := periodeInstan(m)
	if err != nil {
		return nil, "", err
	}
	period, err := document.PeriodRange(m.Params["from"], m.Params["to"], "")
	if err != nil {
		return nil, "", err
	}
	specs, err := document.PartyRecapColumnsFor(m.ReportID)
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	rep, err := r.PartyRecap(ctx, m.ReportID, from, to)
	if err != nil {
		return nil, "", err
	}
	_ = progress(55)
	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.PartyRecapWorkbook(rep, document.CatalogVisibleColumns(specs, m.Params["cols"]), name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(document.PartyRecapTitle(m.ReportID), now), nil
}

// kasBank: Laporan Kas & Bank [fromInstant, toInstant] — Arus Kas periode yang
// sama; `cols` ikut seperti halaman.
func kasBank(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	if err := tanpaPembanding(m, "laporan kas & bank"); err != nil {
		return nil, "", err
	}
	from, to, err := periodeInstan(m)
	if err != nil {
		return nil, "", err
	}
	period, err := document.PeriodRange(m.Params["from"], m.Params["to"], "")
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	cb, err := r.CashBank(ctx, from, to)
	if err != nil {
		return nil, "", err
	}
	_ = progress(55)
	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.CashBankWorkbook(cb, document.CatalogVisibleColumns(contract.CashBankColumns, m.Params["cols"]), name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.CashBankTitle, now), nil
}

// anggaran: Realisasi vs Anggaran. `params.year` + `params.month` (0 =
// setahun) sudah diselesaikan penerbit (`resolveBudgetPeriod`), dan
// [fromInstant, toInstant] = `budgetPeriodRange` — batas Laba Rugi realisasinya.
// Nilai di luar bentuk itu DITOLAK: penerbit tidak pernah mengirimnya, jadi
// muatan seperti itu bukan permintaan pengguna.
func anggaran(ctx context.Context, company *registry.Company, m muatanEkspor, progress func(int) error) ([]byte, string, error) {
	if err := tanpaPembanding(m, "realisasi vs anggaran"); err != nil {
		return nil, "", err
	}
	year, month, err := budgetYearMonth(m.Params["year"], m.Params["month"])
	if err != nil {
		return nil, "", err
	}
	from, to, err := periodeInstan(m)
	if err != nil {
		return nil, "", err
	}
	period, err := document.BudgetPeriod(year, month)
	if err != nil {
		return nil, "", err
	}

	r, err := ledgerread.OpenAt(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, "", err
	}
	defer r.Close()

	rep, err := r.BudgetRealization(ctx, year, month, from, to)
	if err != nil {
		return nil, "", err
	}
	if len(rep.UnknownTypes) > 0 {
		log.Printf("[interactive-go] ⚠ %s: akun bergerak bertipe di luar kontrak: %s",
			company.Slug, strings.Join(rep.UnknownTypes, ", "))
	}
	_ = progress(55)
	name := companyName(ctx, r, company)
	_ = progress(70)

	now := time.Now()
	data, err := document.BudgetWorkbook(rep, name, period, now)
	if err != nil {
		return nil, "", err
	}
	return data, document.FileName(contract.BudgetTitle, now), nil
}

// budgetYearMonth: tahun 2000–2100 dan bulan 0–12 dalam bentuk desimal polos —
// bentuk yang ditulis `goExportPayloadShape` (`String(year)`, `String(month ?? 0)`).
func budgetYearMonth(yearRaw, monthRaw string) (int, int, error) {
	year, err := strconv.Atoi(yearRaw)
	if err != nil || year < 2000 || year > 2100 || strconv.Itoa(year) != yearRaw {
		return 0, 0, fmt.Errorf("params.year %q bukan tahun 2000–2100", yearRaw)
	}
	month, err := strconv.Atoi(monthRaw)
	if err != nil || month < 0 || month > 12 || strconv.Itoa(month) != monthRaw {
		return 0, 0, fmt.Errorf("params.month %q bukan bulan 0–12", monthRaw)
	}
	return year, month, nil
}

// priorIncomeStatement: Laba Rugi periode pembanding (#557), atau nil bila
// tidak diminta — penyaring pusat biaya yang SAMA dengan periode berjalan,
// seperti halaman (`getIncomeStatement(prior…, costCenter)`).
func priorIncomeStatement(ctx context.Context, r *ledgerread.Reader, m muatanEkspor, cc ledgerread.CostCenterFilter) (*document.IncomeStatementPrior, error) {
	ok, err := comparative(m, m.PriorFromInstant, m.PriorToInstant)
	if err != nil || !ok {
		return nil, err
	}
	from, err := time.Parse(time.RFC3339Nano, m.PriorFromInstant)
	if err != nil {
		return nil, fmt.Errorf("priorFromInstant %q: %w", m.PriorFromInstant, err)
	}
	to, err := time.Parse(time.RFC3339Nano, m.PriorToInstant)
	if err != nil {
		return nil, fmt.Errorf("priorToInstant %q: %w", m.PriorToInstant, err)
	}
	is, err := r.IncomeStatement(ctx, &from, &to, cc)
	if err != nil {
		return nil, err
	}
	label, err := document.PriorPeriodRange(from, to)
	if err != nil {
		return nil, err
	}
	return &document.IncomeStatementPrior{Statement: is, Period: label}, nil
}

// priorBalanceSheet: Neraca tanggal pembanding (#557), atau nil.
func priorBalanceSheet(ctx context.Context, r *ledgerread.Reader, m muatanEkspor) (*document.BalanceSheetPrior, error) {
	ok, err := comparative(m, m.PriorAsOfInstant)
	if err != nil || !ok {
		return nil, err
	}
	asOf, err := time.Parse(time.RFC3339Nano, m.PriorAsOfInstant)
	if err != nil {
		return nil, fmt.Errorf("priorAsOfInstant %q: %w", m.PriorAsOfInstant, err)
	}
	bs, err := r.BalanceSheet(ctx, asOf)
	if err != nil {
		return nil, err
	}
	label, err := document.PriorPeriodAsOf(asOf)
	if err != nil {
		return nil, err
	}
	return &document.BalanceSheetPrior{Statement: bs, Period: label}, nil
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
