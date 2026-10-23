package main

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/conformance"
)

// conformanceBook: sebelas pemeriksaan kesesuaian data atas SATU buku, sebagai
// JSON — sisi Go `bun run parity:conformance`.
//
//	parity conformance -database <nama> [-ambang-penampung <persen>]
//
// Kode yang SAMA dengan pelari jalur `tenant` (`conformance.RunChecks`, di
// dalam transaksi READ ONLY `ledgerread`), buku dibuka lewat registry kendali
// seperti pelarinya. `-ambang-penampung` diteruskan sebagai TEKS dan dibaca
// `conformance.Threshold` — aturan `Number()` yang sama dengan argumen Node.
// Tidak menulis apa pun, termasuk jejak putaran: paritas bukan putaran.
func conformanceBook(args []string) error {
	fs := flag.NewFlagSet("conformance", flag.ContinueOnError)
	database := fs.String("database", "", "nama basis data perusahaan (companies.database_name)")
	ambang := fs.String("ambang-penampung", "", "persen ambang akun penampung (kosong = bawaan kontrak)")
	timeout := fs.Duration("timeout", 5*time.Minute, "batas waktu satu buku")
	if err := fs.Parse(args); err != nil {
		return err
	}
	var persen *string
	if *ambang != "" {
		persen = ambang
	}
	threshold := conformance.Threshold(persen)

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	r, _, err := openFromRegistry(ctx, *database)
	if err != nil {
		return err
	}
	defer r.Close()

	var hasil []conformance.CheckResult
	if err := r.ReadOnly(ctx, func(tx pgx.Tx) error {
		var e error
		hasil, e = conformance.RunChecks(ctx, tx, threshold)
		return e
	}); err != nil {
		return err
	}
	if hasil == nil {
		hasil = []conformance.CheckResult{}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	return enc.Encode(struct {
		Threshold float64                   `json:"threshold"`
		Checks    []conformance.CheckResult `json:"checks"`
	}{threshold, hasil})
}
