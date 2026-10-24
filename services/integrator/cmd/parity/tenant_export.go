package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/tenantexport"
)

// tenantExport: arsip ekspor data mandiri SATU tenant — sisi Go
// `bun run parity:tenant-export`.
//
//	parity tenant-export -tenant-id <id> -generated-at <RFC3339> -documents-root <dir> -out <berkas.zip>
//
// Kode yang SAMA dengan pelari jalur `bulk` (`tenantexport.Write`), tenant dan
// PT-nya dibaca dari registry kendali seperti pelarinya, buku lewat
// `ledgerread` (READ ONLY). `-generated-at` memaku stempel "Dibuat" supaya
// `tenant.json`/`BACA-SAYA.txt` sebanding byte demi byte dengan sisi TS.
// Tidak menulis apa pun selain `-out`: tanpa baris `jobs`, tanpa jejak audit.
func tenantExport(args []string) error {
	fs := flag.NewFlagSet("tenant-export", flag.ContinueOnError)
	tenantID := fs.String("tenant-id", "", "tenants.id")
	generatedRaw := fs.String("generated-at", "", "stempel pembuatan sebagai instan RFC3339 (yang SAMA dengan sisi TS)")
	docsRoot := fs.String("documents-root", tenantexport.DocumentsRootDefault, "akar berkas dokumen (data/documents)")
	out := fs.String("out", "", "berkas ZIP keluaran")
	timeout := fs.Duration("timeout", 2*time.Hour, "batas waktu satu tenant")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *tenantID == "" || *out == "" || *generatedRaw == "" {
		return errors.New("-tenant-id, -generated-at, dan -out wajib")
	}
	id64, err := strconv.ParseInt(*tenantID, 10, 32)
	if err != nil || id64 <= 0 {
		return fmt.Errorf("-tenant-id %q bukan id tenant", *tenantID)
	}
	id := int32(id64)
	generatedAt, err := time.Parse(time.RFC3339Nano, *generatedRaw)
	if err != nil {
		return fmt.Errorf("-generated-at: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	kolam, err := db.Kendali(ctx, 1)
	if err != nil {
		return err
	}
	defer kolam.Close()

	tenant, companies, err := tenantexport.LoadTenant(ctx, kolam, &id)
	if err != nil {
		return err
	}
	f, err := os.Create(*out)
	if err != nil {
		return err
	}
	bw := bufio.NewWriterSize(f, 256<<10)
	sum, err := tenantexport.Write(ctx, bw, *tenant, companies, tenantexport.Options{
		DocumentsRoot: *docsRoot,
		GeneratedAt:   generatedAt,
	})
	if err == nil {
		err = bw.Flush()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	name, err := tenantexport.FileName(tenant.Slug, generatedAt)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{
		"filename":  name,
		"companies": sum.Companies,
		"tables":    sum.Tables,
		"rows":      sum.Rows,
		"documents": sum.Documents,
		"missing":   sum.Missing,
	})
}

// zipEntry: satu BERKAS (bukan folder) di dalam arsip.
type zipEntry struct {
	size   int64
	digest string
	file   *zip.File
}

func zipEntries(r *zip.Reader) (map[string]zipEntry, error) {
	hasil := map[string]zipEntry{}
	for _, f := range r.File {
		if strings.HasSuffix(f.Name, "/") {
			continue
		}
		if _, ganda := hasil[f.Name]; ganda {
			return nil, fmt.Errorf("entri ganda %q", f.Name)
		}
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("buka %s: %w", f.Name, err)
		}
		h := sha256.New()
		// Arsip yang dibaca adalah keluaran kedua penulis di mesin yang sama,
		// bukan unggahan orang — bom dekompresi bukan ancaman di perkakas ini.
		n, err := io.Copy(h, rc) //nolint:gosec // G110: arsip buatan sendiri
		_ = rc.Close()
		if err != nil {
			return nil, fmt.Errorf("baca %s: %w", f.Name, err)
		}
		hasil[f.Name] = zipEntry{size: n, digest: hex.EncodeToString(h.Sum(nil)), file: f}
	}
	return hasil, nil
}

// firstDifference: baris pertama yang berbeda di dua entri teks — keterangan
// selisih untuk manusia; kesetaraannya sudah diputuskan SHA-256.
func firstDifference(a, b *zip.File) string {
	ra, err := a.Open()
	if err != nil {
		return err.Error()
	}
	defer ra.Close()
	rb, err := b.Open()
	if err != nil {
		return err.Error()
	}
	defer rb.Close()
	sa, sb := bufio.NewScanner(ra), bufio.NewScanner(rb)
	sa.Buffer(make([]byte, 1<<20), 64<<20)
	sb.Buffer(make([]byte, 1<<20), 64<<20)
	for baris := 1; ; baris++ {
		okA, okB := sa.Scan(), sb.Scan()
		if !okA && !okB {
			return "isi berbeda di luar batas baris (mis. akhir berkas)"
		}
		ta, tb := sa.Bytes(), sb.Bytes()
		if okA != okB || !bytes.Equal(ta, tb) {
			return fmt.Sprintf("baris %d: TS %q ≠ Go %q", baris, potong(ta, okA), potong(tb, okB))
		}
	}
}

func potong(b []byte, ada bool) string {
	if !ada {
		return "(tidak ada)"
	}
	if len(b) > 300 {
		return string(b[:300]) + "…"
	}
	return string(b)
}

// zipCompare: bandingkan dua arsip BERKAS demi BERKAS (SHA-256 isi yang sudah
// diekstrak), dan cetak hasilnya sebagai JSON. Folder diabaikan — JSZip dan
// `archive/zip` boleh berbeda dalam entri folder dan cara memampatkan; yang
// diterima pengguna adalah isi berkasnya.
//
//	parity zip-compare -ts <berkas.zip> -go <berkas.zip>
func zipCompare(args []string) error {
	fs := flag.NewFlagSet("zip-compare", flag.ContinueOnError)
	tsPath := fs.String("ts", "", "arsip sisi TS")
	goPath := fs.String("go", "", "arsip sisi Go")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *tsPath == "" || *goPath == "" {
		return errors.New("-ts dan -go wajib")
	}
	ra, err := zip.OpenReader(*tsPath)
	if err != nil {
		return fmt.Errorf("-ts: %w", err)
	}
	defer ra.Close()
	rb, err := zip.OpenReader(*goPath)
	if err != nil {
		return fmt.Errorf("-go: %w", err)
	}
	defer rb.Close()
	ea, err := zipEntries(&ra.Reader)
	if err != nil {
		return fmt.Errorf("-ts: %w", err)
	}
	eb, err := zipEntries(&rb.Reader)
	if err != nil {
		return fmt.Errorf("-go: %w", err)
	}

	type selisih struct {
		Name   string `json:"name"`
		Detail string `json:"detail"`
	}
	hasil := struct {
		Same    int       `json:"same"`
		Bytes   int64     `json:"bytes"`
		OnlyTS  []string  `json:"onlyTs"`
		OnlyGo  []string  `json:"onlyGo"`
		Differ  []selisih `json:"differ"`
		TSFiles int       `json:"tsFiles"`
		GoFiles int       `json:"goFiles"`
	}{OnlyTS: []string{}, OnlyGo: []string{}, Differ: []selisih{}, TSFiles: len(ea), GoFiles: len(eb)}

	names := make([]string, 0, len(ea))
	for n := range ea {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		a := ea[n]
		b, ada := eb[n]
		switch {
		case !ada:
			hasil.OnlyTS = append(hasil.OnlyTS, n)
		case a.digest == b.digest && a.size == b.size:
			hasil.Same++
			hasil.Bytes += a.size
		default:
			hasil.Differ = append(hasil.Differ, selisih{n,
				fmt.Sprintf("%d byte ≠ %d byte · %s", a.size, b.size, firstDifference(a.file, b.file))})
		}
	}
	for n := range eb {
		if _, ada := ea[n]; !ada {
			hasil.OnlyGo = append(hasil.OnlyGo, n)
		}
	}
	sort.Strings(hasil.OnlyGo)
	return json.NewEncoder(os.Stdout).Encode(hasil)
}
