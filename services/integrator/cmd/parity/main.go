// PERKAKAS PARITAS — sisi Go dari pembuktian tahap 1d (09 §9).
//
//	parity trial-balance -database <nama_basis_data> -as-of <RFC3339>
//	parity trial-balance-xlsx -database <nama> -as-of <RFC3339> -as-of-date <YYYY-MM-DD> \
//	       -registry-name <nama registry> -out <berkas.xlsx>
//	parity balance-sheet -database <nama> -as-of <RFC3339>
//	parity balance-sheet-xlsx -database <nama> -as-of <RFC3339> -as-of-date <YYYY-MM-DD> \
//	       [-compare <mode> -prior-as-of <RFC3339>] -registry-name <nama registry> -out <berkas.xlsx>
//	parity income-statement -database <nama> -from <RFC3339> -to <RFC3339> [-cost-center <mentah>]
//	parity income-statement-xlsx -database <nama> -from <RFC3339> -to <RFC3339> \
//	       -from-date <YYYY-MM-DD> -to-date <YYYY-MM-DD> [-cost-center <mentah>] \
//	       [-compare <mode> -prior-from <RFC3339> -prior-to <RFC3339>] \
//	       -registry-name <nama registry> -out <berkas.xlsx>
//	parity receivables|payables -database <nama> -as-of <RFC3339> [-overdue]
//	parity receivables-xlsx|payables-xlsx -database <nama> -as-of <RFC3339> -as-of-date <YYYY-MM-DD> \
//	       [-overdue] [-cols <id,id>] -registry-name <nama registry> -out <berkas.xlsx>
//
// Umur Piutang & Umur Utang (`go-parity`): pembandingnya
// `scripts/parity-aging.ts` / `scripts/parity-aging-xlsx.ts`
// (`bun run parity:receivables` dst.). `-overdue` = `?overdue=1` halaman,
// `-cols` = `?cols=` — opsi yang sama dengan berkas TS.
//
//	parity cash-flow -database <nama> -from <RFC3339> -to <RFC3339>
//	parity cash-flow-xlsx -database <nama> -from <RFC3339> -to <RFC3339> \
//	       -from-date <YYYY-MM-DD> -to-date <YYYY-MM-DD> -registry-name <nama registry> -out <berkas.xlsx>
//	parity equity-changes -database <nama> -from <RFC3339> -to <RFC3339>
//	parity equity-changes-xlsx -database <nama> -from <RFC3339> -to <RFC3339> \
//	       -from-date <YYYY-MM-DD> -to-date <YYYY-MM-DD> -registry-name <nama registry> -out <berkas.xlsx>
//
// Arus Kas dan Laporan Perubahan Ekuitas (tahap 1d, 23 Okt 2026) membuka
// bukunya lewat registry kendali (`openFromRegistry`) seperti Neraca Saldo —
// instans tempat buku itu hidup, bukan instans bawaan. Varian -xlsx Laporan
// Perubahan Ekuitas lahir bersama berkasnya di TS (keputusan pemilik 23 Okt
// 2026); pembandingnya `scripts/parity-equity-changes-xlsx.ts`.
//
// `-compare` (#557, kolom pembanding): mode `?compare=` dan instan pembanding
// yang dihitung PENERBIT TS (`goExportPayloadShape` → `comparisonRange` /
// `comparisonDate`) — perkakas ini, seperti pelari, tidak menghitung "tahun
// lalu" sendiri.
//
// Laba Rugi dan Neraca (`go-parity` di `src/lib/report-engine.ts`) memakai
// pola yang sama: pembandingnya `scripts/parity-income-statement*.ts` dan
// `scripts/parity-balance-sheet*.ts`.
//
// `trial-balance` mencetak SATU laporan sebagai JSON ke stdout;
// `trial-balance-xlsx` menulis lembar sebarnya — lewat `internal/document`, kode
// yang SAMA dengan pelari `cmd/interactive` — ke `-out`. Tidak menilai apa
// pun: pembandingnya `scripts/parity-trial-balance.ts` dan
// `scripts/parity-trial-balance-xlsx.ts`
// (`bun run parity:trial-balance`), yang menjalankan TypeScript dan perkakas
// ini terhadap buku yang sama lalu membandingkan baris demi baris. Pembanding
// di sisi TS disengaja — dari sanalah implementasi pembandingnya bisa dipanggil
// LANGSUNG, bukan disalin.
//
// ══ BUKAN LAYANAN ══════════════════════════════════════════════════════════
// Tidak ada pelari, tidak ada antrean, tidak ada tahap Dockerfile: ia dibangun
// sesi yang membuktikan paritas (`go build ./cmd/parity`), dipakai, lalu
// dibuang. Begitu sebuah laporan berpindah ke `go` di `src/lib/report-engine.ts`,
// yang menghitung berkasnya pelari jalur `interactive`, bukan perkakas ini.
//
// ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
// Setiap pembacaan lewat `internal/ledgerread`, di dalam transaksi READ ONLY.
// Aman diarahkan ke buku produksi.
//
// ══ INSTANS DISELESAIKAN SEPERTI PELARI (tahap 4) ═════════════════════════
// `-database` hanya NAMA. Instans tempat buku itu hidup dibaca dari registry
// kendali (`companies.db_instance_key` → `db_instances.url_env_var`, lewat
// `registry.LookupByDatabase`) lalu dibuka dengan `ledgerread.OpenAt` — jalan
// yang sama dengan pelari `cmd/interactive`. Sampai 22 Okt 2026 perkakas ini
// selalu membuka instans bawaan, dan untuk PT yang sudah dipindah itu berarti
// membandingkan salinan LAMA di server bawaan: paritas yang lolos atas buku
// yang salah tidak membuktikan apa pun. Kini nama yang tidak terdaftar, atau
// instans yang env var-nya tidak diset, MELEMPAR. Butuh `CONTROL_DATABASE_URL`
// — skrip pembandingnya sudah mewajibkannya.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/document"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// companyLookup menyelesaikan nama basis data → baris registry (dengan
// instansnya). Disuntik supaya penyelesaiannya teruji tanpa basis data.
type companyLookup func(ctx context.Context, databaseName string) (*registry.Company, error)

// bookOpener membuka buku di instansnya — `ledgerread.OpenAt` saat berjalan.
type bookOpener func(ctx context.Context, databaseName, urlEnvVar string) (*ledgerread.Reader, error)

// registryLookup membuka kolam kecil ke basis data kendali.
func registryLookup(ctx context.Context) (companyLookup, func(), error) {
	kolam, err := db.Kendali(ctx, 1)
	if err != nil {
		return nil, nil, err
	}
	return func(c context.Context, nama string) (*registry.Company, error) {
		return registry.LookupByDatabase(c, kolam, nama)
	}, kolam.Close, nil
}

// openBook membuka buku `databaseName` di instans yang dicatat registry —
// tidak pernah di instans bawaan karena registry diam.
func openBook(ctx context.Context, databaseName string, lookup companyLookup, open bookOpener) (*ledgerread.Reader, *registry.Company, error) {
	if databaseName == "" {
		return nil, nil, errors.New("-database wajib — nama basis data perusahaan (companies.database_name)")
	}
	company, err := lookup(ctx, databaseName)
	if err != nil {
		return nil, nil, err
	}
	if company.DatabaseName != databaseName {
		return nil, nil, fmt.Errorf("registry memulangkan %q untuk %q", company.DatabaseName, databaseName)
	}
	r, err := open(ctx, company.DatabaseName, company.InstanceURLEnvVar)
	if err != nil {
		return nil, nil, err
	}
	return r, company, nil
}

// openFromRegistry: openBook dengan registry kendali sungguhan.
func openFromRegistry(ctx context.Context, databaseName string) (*ledgerread.Reader, *registry.Company, error) {
	lookup, tutup, err := registryLookup(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tutup()
	return openBook(ctx, databaseName, lookup, ledgerread.OpenAt)
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "[parity] GAGAL: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("pakai: parity trial-balance|trial-balance-xlsx|balance-sheet|balance-sheet-xlsx|" +
			"income-statement|income-statement-xlsx|cash-flow|cash-flow-xlsx|equity-changes|equity-changes-xlsx|" +
			"receivables|receivables-xlsx|payables|payables-xlsx -database <nama> …")
	}
	switch args[0] {
	case "trial-balance":
		return trialBalance(args[1:])
	case "trial-balance-xlsx":
		return trialBalanceXLSX(args[1:])
	case "balance-sheet":
		return balanceSheet(args[1:], false)
	case "balance-sheet-xlsx":
		return balanceSheet(args[1:], true)
	case "income-statement":
		return incomeStatement(args[1:], false)
	case "income-statement-xlsx":
		return incomeStatement(args[1:], true)
	case "cash-flow":
		return cashFlow(args[1:], false)
	case "cash-flow-xlsx":
		return cashFlow(args[1:], true)
	case "equity-changes":
		return equityChanges(args[1:], false)
	case "equity-changes-xlsx":
		return equityChanges(args[1:], true)
	case "receivables", "payables":
		return aging(args[0], args[1:], false)
	case "receivables-xlsx":
		return aging("receivables", args[1:], true)
	case "payables-xlsx":
		return aging("payables", args[1:], true)
	default:
		return fmt.Errorf("laporan %q belum punya implementasi Go", args[0])
	}
}

func trialBalance(args []string) error {
	fs := flag.NewFlagSet("trial-balance", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	asOfRaw := fs.String("as-of", "", "batas tanggal INKLUSIF sebagai instan RFC3339, mis. 2026-10-22T16:59:59.999Z")
	timeout := fs.Duration("timeout", 2*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *asOfRaw == "" {
		// Tidak ada bawaan "sekarang": dua implementasi yang masing-masing
		// mengambil jamnya sendiri tidak sedang menghitung hal yang sama.
		return errors.New("-as-of wajib — instan yang SAMA dengan yang dipakai sisi TypeScript")
	}
	asOf, err := time.Parse(time.RFC3339Nano, *asOfRaw)
	if err != nil {
		return fmt.Errorf("-as-of: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	r, _, err := openFromRegistry(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	tb, err := r.TrialBalance(ctx, asOf)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	return enc.Encode(tb)
}

// trialBalanceXLSX: lembar sebar Neraca Saldo, dirakit seperti pelari
// `cmd/interactive` merakitnya — identitas perusahaan dari setting wizard,
// lalu nama registry (`-registry-name`, dibaca sisi TS dari kendali).
func trialBalanceXLSX(args []string) error {
	fs := flag.NewFlagSet("trial-balance-xlsx", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	asOfRaw := fs.String("as-of", "", "batas tanggal INKLUSIF sebagai instan RFC3339")
	asOfDate := fs.String("as-of-date", "", "tanggal laporan YYYY-MM-DD (label periode)")
	registryName := fs.String("registry-name", "", "companies.name — cadangan bila setting wizard kosong (kosong = dari registry)")
	out := fs.String("out", "", "berkas .xlsx keluaran")
	timeout := fs.Duration("timeout", 2*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *asOfRaw == "" || *asOfDate == "" || *out == "" {
		return errors.New("-as-of, -as-of-date, dan -out wajib")
	}
	asOf, err := time.Parse(time.RFC3339Nano, *asOfRaw)
	if err != nil {
		return fmt.Errorf("-as-of: %w", err)
	}
	period, err := document.PeriodAsOf(*asOfDate)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	r, company, err := openFromRegistry(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	tb, err := r.TrialBalance(ctx, asOf)
	if err != nil {
		return err
	}
	name, err := r.CompanySettingName(ctx)
	if err != nil {
		return err
	}
	if name = strings.TrimSpace(name); name == "" {
		name = strings.TrimSpace(*registryName)
	}
	if name == "" {
		// Sama dengan pelari: nama registry dari baris yang baru dibaca.
		name = strings.TrimSpace(company.Name)
	}
	if name == "" {
		name = contract.CompanyNameFallback
	}
	data, err := document.TrialBalanceWorkbook(tb, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}

// instant mengurai satu instan RFC3339 wajib — tanpa bawaan "sekarang", alasan
// yang sama dengan `trial-balance`.
func instant(name, raw string) (time.Time, error) {
	if raw == "" {
		return time.Time{}, fmt.Errorf("-%s wajib — instan yang SAMA dengan yang dipakai sisi TypeScript", name)
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("-%s: %w", name, err)
	}
	return t, nil
}

// compareMode memeriksa `-compare`: kosong, atau mode dari kosakata
// `contract.ComparisonModes` — dan hanya untuk lembar sebar (angka periode
// pembanding dibandingkan sebagai periode/tanggal biasa).
func compareMode(mode string, xlsx bool) error {
	if mode == "" {
		return nil
	}
	if !xlsx {
		return errors.New("-compare hanya untuk *-xlsx — angka periode pembanding adalah periode biasa")
	}
	if !contract.ComparisonModes[mode] {
		return fmt.Errorf("-compare %q di luar kosakata (src/lib/statement-compare.ts)", mode)
	}
	return nil
}

// headerName: kop berkas — setting wizard, lalu nama registry, lalu cadangan
// (urutan `pickIdentity()`, sama dengan `trial-balance-xlsx`).
func headerName(ctx context.Context, r *ledgerread.Reader, registryName string) (string, error) {
	name, err := r.CompanySettingName(ctx)
	if err != nil {
		return "", err
	}
	if name = strings.TrimSpace(name); name == "" {
		name = strings.TrimSpace(registryName)
	}
	if name == "" {
		name = contract.CompanyNameFallback
	}
	return name, nil
}

// balanceSheet: Neraca sebagai JSON, atau (xlsx) lembar sebarnya lewat
// `internal/document` — kode yang sama dengan pelari jalur `interactive`.
func balanceSheet(args []string, xlsx bool) error {
	fs := flag.NewFlagSet("balance-sheet", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	asOfRaw := fs.String("as-of", "", "batas tanggal INKLUSIF sebagai instan RFC3339")
	asOfDate := fs.String("as-of-date", "", "xlsx: tanggal laporan YYYY-MM-DD (label periode)")
	compare := fs.String("compare", "", "xlsx: kolom pembanding (#557) — preceding | previous_year")
	priorAsOfRaw := fs.String("prior-as-of", "", "xlsx: tanggal pembanding INKLUSIF sebagai instan RFC3339 (dari penerbit TS)")
	registryName := fs.String("registry-name", "", "xlsx: companies.name — cadangan bila setting wizard kosong")
	out := fs.String("out", "", "xlsx: berkas .xlsx keluaran")
	timeout := fs.Duration("timeout", 2*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	asOf, err := instant("as-of", *asOfRaw)
	if err != nil {
		return err
	}
	if xlsx && (*asOfDate == "" || *out == "") {
		return errors.New("-as-of-date dan -out wajib")
	}
	if err := compareMode(*compare, xlsx); err != nil {
		return err
	}
	var priorAsOf time.Time
	if *compare != "" {
		if priorAsOf, err = instant("prior-as-of", *priorAsOfRaw); err != nil {
			return err
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	r, err := ledgerread.Open(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	bs, err := r.BalanceSheet(ctx, asOf)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(bs)
	}
	period, err := document.PeriodAsOf(*asOfDate)
	if err != nil {
		return err
	}
	name, err := headerName(ctx, r, *registryName)
	if err != nil {
		return err
	}
	var prior *document.BalanceSheetPrior
	if *compare != "" {
		pbs, err := r.BalanceSheet(ctx, priorAsOf)
		if err != nil {
			return err
		}
		label, err := document.PriorPeriodAsOf(priorAsOf)
		if err != nil {
			return err
		}
		prior = &document.BalanceSheetPrior{Statement: pbs, Period: label}
	}
	data, err := document.BalanceSheetWorkbook(bs, prior, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}

// incomeStatement: Laba Rugi sebagai JSON, atau (xlsx) lembar sebarnya.
func incomeStatement(args []string, xlsx bool) error {
	fs := flag.NewFlagSet("income-statement", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	fromRaw := fs.String("from", "", "awal periode INKLUSIF sebagai instan RFC3339")
	toRaw := fs.String("to", "", "akhir periode INKLUSIF sebagai instan RFC3339")
	costCenter := fs.String("cost-center", "", "penyaring pusat biaya MENTAH (`?costCenter=`), mis. 3 atau unassigned")
	fromDate := fs.String("from-date", "", "xlsx: awal periode YYYY-MM-DD (label)")
	toDate := fs.String("to-date", "", "xlsx: akhir periode YYYY-MM-DD (label)")
	compare := fs.String("compare", "", "xlsx: kolom pembanding (#557) — preceding | previous_year")
	priorFromRaw := fs.String("prior-from", "", "xlsx: awal periode pembanding INKLUSIF, instan RFC3339 (dari penerbit TS)")
	priorToRaw := fs.String("prior-to", "", "xlsx: akhir periode pembanding INKLUSIF, instan RFC3339 (dari penerbit TS)")
	registryName := fs.String("registry-name", "", "xlsx: companies.name — cadangan bila setting wizard kosong")
	out := fs.String("out", "", "xlsx: berkas .xlsx keluaran")
	timeout := fs.Duration("timeout", 2*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	from, err := instant("from", *fromRaw)
	if err != nil {
		return err
	}
	to, err := instant("to", *toRaw)
	if err != nil {
		return err
	}
	if xlsx && (*fromDate == "" || *toDate == "" || *out == "") {
		return errors.New("-from-date, -to-date, dan -out wajib")
	}
	if err := compareMode(*compare, xlsx); err != nil {
		return err
	}
	var priorFrom, priorTo time.Time
	if *compare != "" {
		if priorFrom, err = instant("prior-from", *priorFromRaw); err != nil {
			return err
		}
		if priorTo, err = instant("prior-to", *priorToRaw); err != nil {
			return err
		}
	}
	cc, err := ledgerread.ParseCostCenterFilter(*costCenter)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	r, err := ledgerread.Open(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	is, err := r.IncomeStatement(ctx, &from, &to, cc)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(is)
	}
	ccLabel, err := document.CostCenterLabel(*costCenter, cc, func(id int64) (string, string, bool, error) {
		return r.CostCenter(ctx, id)
	})
	if err != nil {
		return err
	}
	period, err := document.PeriodRange(*fromDate, *toDate, ccLabel)
	if err != nil {
		return err
	}
	name, err := headerName(ctx, r, *registryName)
	if err != nil {
		return err
	}
	var prior *document.IncomeStatementPrior
	if *compare != "" {
		// Penyaring pusat biaya yang SAMA dengan periode berjalan.
		pis, err := r.IncomeStatement(ctx, &priorFrom, &priorTo, cc)
		if err != nil {
			return err
		}
		label, err := document.PriorPeriodRange(priorFrom, priorTo)
		if err != nil {
			return err
		}
		prior = &document.IncomeStatementPrior{Statement: pis, Period: label}
	}
	data, err := document.IncomeStatementWorkbook(is, prior, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}

// cashFlow: Arus Kas sebagai JSON, atau (xlsx) lembar sebarnya lewat
// `internal/document` — kode yang sama dengan pelari jalur `interactive`.
// Tanpa `-compare`: halaman Arus Kas tidak membaca `?compare=`.
func cashFlow(args []string, xlsx bool) error {
	fs := flag.NewFlagSet("cash-flow", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	fromRaw := fs.String("from", "", "awal periode INKLUSIF sebagai instan RFC3339")
	toRaw := fs.String("to", "", "akhir periode INKLUSIF sebagai instan RFC3339")
	fromDate := fs.String("from-date", "", "xlsx: awal periode YYYY-MM-DD (label)")
	toDate := fs.String("to-date", "", "xlsx: akhir periode YYYY-MM-DD (label)")
	registryName := fs.String("registry-name", "", "xlsx: companies.name — cadangan bila setting wizard kosong")
	out := fs.String("out", "", "xlsx: berkas .xlsx keluaran")
	timeout := fs.Duration("timeout", 5*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	from, err := instant("from", *fromRaw)
	if err != nil {
		return err
	}
	to, err := instant("to", *toRaw)
	if err != nil {
		return err
	}
	if xlsx && (*fromDate == "" || *toDate == "" || *out == "") {
		return errors.New("-from-date, -to-date, dan -out wajib")
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	r, company, err := openFromRegistry(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	cf, err := r.CashFlow(ctx, &from, &to)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(cf)
	}
	period, err := document.PeriodRange(*fromDate, *toDate, "")
	if err != nil {
		return err
	}
	reg := *registryName
	if strings.TrimSpace(reg) == "" {
		reg = company.Name
	}
	name, err := headerName(ctx, r, reg)
	if err != nil {
		return err
	}
	data, err := document.CashFlowWorkbook(cf, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}

// equityChanges: Laporan Perubahan Ekuitas sebagai JSON, atau (xlsx) lembar
// sebarnya lewat `internal/document` — kode yang sama dengan pelari jalur
// `interactive`.
func equityChanges(args []string, xlsx bool) error {
	fs := flag.NewFlagSet("equity-changes", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	fromRaw := fs.String("from", "", "awal periode INKLUSIF sebagai instan RFC3339")
	toRaw := fs.String("to", "", "akhir periode INKLUSIF sebagai instan RFC3339")
	fromDate := fs.String("from-date", "", "xlsx: awal periode YYYY-MM-DD (label)")
	toDate := fs.String("to-date", "", "xlsx: akhir periode YYYY-MM-DD (label)")
	registryName := fs.String("registry-name", "", "xlsx: companies.name — cadangan bila setting wizard kosong")
	out := fs.String("out", "", "xlsx: berkas .xlsx keluaran")
	timeout := fs.Duration("timeout", 2*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	from, err := instant("from", *fromRaw)
	if err != nil {
		return err
	}
	to, err := instant("to", *toRaw)
	if err != nil {
		return err
	}
	if xlsx && (*fromDate == "" || *toDate == "" || *out == "") {
		return errors.New("-from-date, -to-date, dan -out wajib")
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	r, company, err := openFromRegistry(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	es, err := r.EquityStatement(ctx, from, to)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(es)
	}
	period, err := document.PeriodRange(*fromDate, *toDate, "")
	if err != nil {
		return err
	}
	reg := *registryName
	if strings.TrimSpace(reg) == "" {
		reg = company.Name
	}
	name, err := headerName(ctx, r, reg)
	if err != nil {
		return err
	}
	data, err := document.EquityStatementWorkbook(es, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}

// aging: Umur Piutang / Umur Utang sebagai JSON, atau (xlsx) lembar sebarnya
// lewat `internal/document` — kode yang sama dengan pelari jalur `interactive`.
func aging(kind string, args []string, xlsx bool) error {
	fs := flag.NewFlagSet(kind, flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	asOfRaw := fs.String("as-of", "", "batas tanggal INKLUSIF sebagai instan RFC3339")
	overdue := fs.Bool("overdue", false, "hanya dokumen jatuh tempo (`?overdue=1` halaman)")
	asOfDate := fs.String("as-of-date", "", "xlsx: tanggal laporan YYYY-MM-DD (label periode)")
	cols := fs.String("cols", "", "xlsx: kolom tampil MENTAH (`?cols=`), mis. party,outstanding")
	registryName := fs.String("registry-name", "", "xlsx: companies.name — cadangan bila setting wizard kosong")
	out := fs.String("out", "", "xlsx: berkas .xlsx keluaran")
	timeout := fs.Duration("timeout", 2*time.Minute, "batas waktu satu laporan")
	if err := fs.Parse(args); err != nil {
		return err
	}
	asOf, err := instant("as-of", *asOfRaw)
	if err != nil {
		return err
	}
	if xlsx && (*asOfDate == "" || *out == "") {
		return errors.New("-as-of-date dan -out wajib")
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	r, company, err := openFromRegistry(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	var rep *ledgerread.AgingReport
	if kind == "receivables" {
		rep, err = r.Receivables(ctx, asOf, *overdue)
	} else {
		rep, err = r.Payables(ctx, asOf, *overdue)
	}
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(rep)
	}
	period, err := document.PeriodAsOf(*asOfDate)
	if err != nil {
		return err
	}
	specs, err := document.AgingColumnsFor(kind)
	if err != nil {
		return err
	}
	fallback := strings.TrimSpace(*registryName)
	if fallback == "" {
		fallback = company.Name
	}
	name, err := headerName(ctx, r, fallback)
	if err != nil {
		return err
	}
	data, err := document.AgingWorkbook(rep, document.AgingVisibleColumns(specs, *cols), name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}
