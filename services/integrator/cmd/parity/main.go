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
//	parity stock-value|stock-movement|opname-history -database <nama> -from <RFC3339> -to <RFC3339>
//	parity stock-value-xlsx|stock-movement-xlsx|opname-history-xlsx -database <nama> \
//	       -from <RFC3339> -to <RFC3339> -from-date <YYYY-MM-DD> -to-date <YYYY-MM-DD> \
//	       [-cols <id,id>] -registry-name <nama registry> -out <berkas.xlsx>
//
// Laporan stok (tahap 1d, `go-parity`): pembandingnya `scripts/parity-stock.ts`
// / `scripts/parity-stock-xlsx.ts` (`bun run parity:stock-value` dst.). Angka
// float64 dicetak sebagai JSON yang membulat-balik ke double yang SAMA, jadi
// pembandingnya eksak. `-cols` = `?cols=` (Riwayat Hitung Ulang Stok tanpa
// pilihan kolom).
//
//	parity sales-by-customer|purchases-by-supplier -database <nama> -from <RFC3339> -to <RFC3339>
//	parity sales-by-customer-xlsx|purchases-by-supplier-xlsx -database <nama> -from <RFC3339> -to <RFC3339> \
//	       -from-date <YYYY-MM-DD> -to-date <YYYY-MM-DD> [-cols <id,id>] -registry-name <nama registry> -out <berkas.xlsx>
//	parity cash-bank -database <nama> -from <RFC3339> -to <RFC3339>
//	parity cash-bank-xlsx -database <nama> -from <RFC3339> -to <RFC3339> \
//	       -from-date <YYYY-MM-DD> -to-date <YYYY-MM-DD> [-cols <id,id>] -registry-name <nama registry> -out <berkas.xlsx>
//	parity budget-realization -database <nama> -year <YYYY> -month <0–12> -from <RFC3339> -to <RFC3339>
//	parity budget-realization-xlsx -database <nama> -year <YYYY> -month <0–12> -from <RFC3339> -to <RFC3339> \
//	       -registry-name <nama registry> -out <berkas.xlsx>
//
// Gelombang A berikutnya (`go-parity`, 23 Okt 2026): Rekap per Pihak, Laporan
// Kas & Bank, Realisasi vs Anggaran. Pembandingnya `scripts/parity-party-recap*.ts`,
// `scripts/parity-cash-bank*.ts`, `scripts/parity-budget*.ts`. Instan periode
// (dan, untuk anggaran, tahun/bulan + `budgetPeriodRange`) dihitung PENERBIT TS
// (`goExportPayloadShape`) — perkakas ini tidak menghitungnya sendiri.
//
// Arus Kas dan Laporan Perubahan Ekuitas (tahap 1d, 23 Okt 2026) membuka
// bukunya lewat registry kendali (`openFromRegistry`) seperti Neraca Saldo —
// instans tempat buku itu hidup, bukan instans bawaan. Varian -xlsx Laporan
// Perubahan Ekuitas lahir bersama berkasnya di TS (keputusan pemilik 23 Okt
// 2026); pembandingnya `scripts/parity-equity-changes-xlsx.ts`.
//
//	parity tenant-export -tenant-id <id> -generated-at <RFC3339> -documents-root <dir> -out <berkas.zip>
//	parity zip-compare -ts <berkas.zip> -go <berkas.zip>
//
// Ekspor data mandiri tenant (#142, jalur `bulk`): pembandingnya
// `scripts/parity-tenant-export.ts` (`bun run parity:tenant-export`), yang
// membangun arsip TS (`buildTenantExport`) dan arsip Go atas tenant yang sama
// lalu memanggil `zip-compare` — SHA-256 setiap berkas yang diekstrak.
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
			"receivables|receivables-xlsx|payables|payables-xlsx|" +
			"stock-value|stock-value-xlsx|stock-movement|stock-movement-xlsx|opname-history|opname-history-xlsx|" +
			"sales-by-customer[-xlsx]|purchases-by-supplier[-xlsx]|cash-bank[-xlsx]|budget-realization[-xlsx]|conformance -database <nama> …" +
			" | tenant-export -tenant-id <id> … | zip-compare -ts <zip> -go <zip>")
	}
	switch args[0] {
	case "tenant-export":
		return tenantExport(args[1:])
	case "zip-compare":
		return zipCompare(args[1:])
	case "conformance":
		return conformanceBook(args[1:])
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
	case "sales-by-customer", "purchases-by-supplier":
		return partyRecap(args[0], args[1:], false)
	case "sales-by-customer-xlsx", "purchases-by-supplier-xlsx":
		return partyRecap(strings.TrimSuffix(args[0], "-xlsx"), args[1:], true)
	case "cash-bank":
		return cashBank(args[1:], false)
	case "cash-bank-xlsx":
		return cashBank(args[1:], true)
	case "budget-realization":
		return budgetRealization(args[1:], false)
	case "budget-realization-xlsx":
		return budgetRealization(args[1:], true)
	case "stock-value", "stock-movement", "opname-history":
		return stock(args[0], args[1:], false)
	case "stock-value-xlsx", "stock-movement-xlsx", "opname-history-xlsx":
		return stock(strings.TrimSuffix(args[0], "-xlsx"), args[1:], true)
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

// stock: laporan stok sebagai JSON, atau (xlsx) lembar sebarnya lewat
// `internal/document` — kode yang sama dengan pelari jalur `interactive`.
func stock(kind string, args []string, xlsx bool) error {
	fs := flag.NewFlagSet(kind, flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	fromRaw := fs.String("from", "", "awal periode INKLUSIF sebagai instan RFC3339")
	toRaw := fs.String("to", "", "akhir periode INKLUSIF sebagai instan RFC3339")
	fromDate := fs.String("from-date", "", "xlsx: awal periode YYYY-MM-DD (label)")
	toDate := fs.String("to-date", "", "xlsx: akhir periode YYYY-MM-DD (label)")
	cols := fs.String("cols", "", "xlsx: kolom tampil MENTAH (`?cols=`)")
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

	var name string
	if xlsx {
		reg := *registryName
		if strings.TrimSpace(reg) == "" {
			reg = company.Name
		}
		if name, err = headerName(ctx, r, reg); err != nil {
			return err
		}
	}
	var report any
	var data []byte
	switch kind {
	case contract.ReportStockValue:
		rep, err := r.StockValue(ctx, from, to)
		if err != nil {
			return err
		}
		report = rep
		if xlsx {
			period, err := document.StockValuePeriod(*fromDate, *toDate)
			if err != nil {
				return err
			}
			if data, err = document.StockValueWorkbook(rep, *cols, name, period, time.Now()); err != nil {
				return err
			}
		}
	case contract.ReportStockMovement:
		rep, err := r.StockMovement(ctx, from, to)
		if err != nil {
			return err
		}
		report = rep
		if xlsx {
			period, err := document.PeriodRange(*fromDate, *toDate, "")
			if err != nil {
				return err
			}
			if data, err = document.StockMovementWorkbook(rep, *cols, name, period, time.Now()); err != nil {
				return err
			}
		}
	case contract.ReportOpnameHistory:
		h, err := r.OpnameHistory(ctx, from, to)
		if err != nil {
			return err
		}
		report = h
		if xlsx {
			period, err := document.PeriodRange(*fromDate, *toDate, "")
			if err != nil {
				return err
			}
			if data, err = document.OpnameHistoryWorkbook(h, name, period, time.Now()); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("laporan stok %q tidak dikenal", kind)
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(report)
	}
	return os.WriteFile(*out, data, 0o600)
}

// registryFallback: `-registry-name`, lalu nama registry yang baru dibaca.
func registryFallback(flagValue string, company *registry.Company) string {
	if strings.TrimSpace(flagValue) != "" {
		return flagValue
	}
	return company.Name
}

// periodFlags: -from/-to wajib, dan (xlsx) -from-date/-to-date/-out.
type periodFlags struct {
	database, fromRaw, toRaw, fromDate, toDate, cols, registryName, out *string
	timeout                                                             *time.Duration
}

func newPeriodFlags(fs *flag.FlagSet) periodFlags {
	return periodFlags{
		database:     fs.String("database", "", "nama basis data perusahaan (companies.database_name)"),
		fromRaw:      fs.String("from", "", "awal periode INKLUSIF sebagai instan RFC3339"),
		toRaw:        fs.String("to", "", "akhir periode INKLUSIF sebagai instan RFC3339"),
		fromDate:     fs.String("from-date", "", "xlsx: awal periode YYYY-MM-DD (label)"),
		toDate:       fs.String("to-date", "", "xlsx: akhir periode YYYY-MM-DD (label)"),
		cols:         fs.String("cols", "", "xlsx: kolom tampil MENTAH (`?cols=`)"),
		registryName: fs.String("registry-name", "", "xlsx: companies.name — cadangan bila setting wizard kosong"),
		out:          fs.String("out", "", "xlsx: berkas .xlsx keluaran"),
		timeout:      fs.Duration("timeout", 5*time.Minute, "batas waktu satu laporan"),
	}
}

func (p periodFlags) parse(xlsx bool) (time.Time, time.Time, error) {
	from, err := instant("from", *p.fromRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	to, err := instant("to", *p.toRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if xlsx && (*p.fromDate == "" || *p.toDate == "" || *p.out == "") {
		return time.Time{}, time.Time{}, errors.New("-from-date, -to-date, dan -out wajib")
	}
	return from, to, nil
}

// partyRecap: Penjualan per Pelanggan / Pembelian per Pemasok sebagai JSON,
// atau (xlsx) lembar sebarnya lewat `internal/document` — kode pelari.
func partyRecap(kind string, args []string, xlsx bool) error {
	fs := flag.NewFlagSet(kind, flag.ContinueOnError)
	p := newPeriodFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	from, to, err := p.parse(xlsx)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), *p.timeout)
	defer cancel()
	r, company, err := openFromRegistry(ctx, *p.database)
	if err != nil {
		return err
	}
	defer r.Close()

	rep, err := r.PartyRecap(ctx, kind, from, to)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(rep)
	}
	period, err := document.PeriodRange(*p.fromDate, *p.toDate, "")
	if err != nil {
		return err
	}
	specs, err := document.PartyRecapColumnsFor(kind)
	if err != nil {
		return err
	}
	name, err := headerName(ctx, r, registryFallback(*p.registryName, company))
	if err != nil {
		return err
	}
	data, err := document.PartyRecapWorkbook(rep, document.CatalogVisibleColumns(specs, *p.cols), name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*p.out, data, 0o600)
}

// cashBank: Laporan Kas & Bank sebagai JSON, atau (xlsx) lembar sebarnya.
func cashBank(args []string, xlsx bool) error {
	fs := flag.NewFlagSet("cash-bank", flag.ContinueOnError)
	p := newPeriodFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	from, to, err := p.parse(xlsx)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), *p.timeout)
	defer cancel()
	r, company, err := openFromRegistry(ctx, *p.database)
	if err != nil {
		return err
	}
	defer r.Close()

	cb, err := r.CashBank(ctx, from, to)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(cb)
	}
	period, err := document.PeriodRange(*p.fromDate, *p.toDate, "")
	if err != nil {
		return err
	}
	name, err := headerName(ctx, r, registryFallback(*p.registryName, company))
	if err != nil {
		return err
	}
	data, err := document.CashBankWorkbook(cb, document.CatalogVisibleColumns(contract.CashBankColumns, *p.cols), name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*p.out, data, 0o600)
}

// budgetRealization: Realisasi vs Anggaran sebagai JSON, atau (xlsx) lembar
// sebarnya. -year/-month = `params.year`/`params.month` penerbit; -from/-to =
// `fromInstant`/`toInstant`-nya (`budgetPeriodRange`).
func budgetRealization(args []string, xlsx bool) error {
	fs := flag.NewFlagSet("budget-realization", flag.ContinueOnError)
	p := newPeriodFlags(fs)
	year := fs.Int("year", 0, "tahun anggaran (params.year)")
	month := fs.Int("month", -1, "bulan 1–12, atau 0 = setahun penuh (params.month)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	from, err := instant("from", *p.fromRaw)
	if err != nil {
		return err
	}
	to, err := instant("to", *p.toRaw)
	if err != nil {
		return err
	}
	if *year == 0 || *month < 0 || *month > 12 {
		return errors.New("-year dan -month (0–12) wajib")
	}
	if xlsx && *p.out == "" {
		return errors.New("-out wajib")
	}
	ctx, cancel := context.WithTimeout(context.Background(), *p.timeout)
	defer cancel()
	r, company, err := openFromRegistry(ctx, *p.database)
	if err != nil {
		return err
	}
	defer r.Close()

	rep, err := r.BudgetRealization(ctx, *year, *month, from, to)
	if err != nil {
		return err
	}
	if !xlsx {
		return json.NewEncoder(os.Stdout).Encode(rep)
	}
	period, err := document.BudgetPeriod(*year, *month)
	if err != nil {
		return err
	}
	name, err := headerName(ctx, r, registryFallback(*p.registryName, company))
	if err != nil {
		return err
	}
	data, err := document.BudgetWorkbook(rep, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*p.out, data, 0o600)
}
