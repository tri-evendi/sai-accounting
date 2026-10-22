// PERKAKAS PARITAS — sisi Go dari pembuktian tahap 1d (09 §9).
//
//	parity trial-balance -database <nama_basis_data> -as-of <RFC3339>
//	parity trial-balance-xlsx -database <nama> -as-of <RFC3339> -as-of-date <YYYY-MM-DD> \
//	       -registry-name <nama registry> -out <berkas.xlsx>
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
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/document"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "[parity] GAGAL: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("pakai: parity trial-balance|trial-balance-xlsx -database <nama> -as-of <RFC3339> …")
	}
	switch args[0] {
	case "trial-balance":
		return trialBalance(args[1:])
	case "trial-balance-xlsx":
		return trialBalanceXLSX(args[1:])
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

	r, err := ledgerread.Open(ctx, *database)
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
	registryName := fs.String("registry-name", "", "companies.name — cadangan bila setting wizard kosong")
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

	r, err := ledgerread.Open(ctx, *database)
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
		name = contract.CompanyNameFallback
	}
	data, err := document.TrialBalanceWorkbook(tb, name, period, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(*out, data, 0o600)
}
