// Package tenantexport menulis EKSPOR DATA MANDIRI tenant (#142, hak akses UU
// PDP) — ZIP berisi CSV setiap tabel di setiap PT milik tenant + berkas
// dokumennya — sebagai ALIRAN, untuk jalur `bulk` (`internal/bulklane`).
//
// ══ PADANAN, BUKAN TERJEMAHAN BEBAS ═══════════════════════════════════════
// Implementasi rujukannya `src/lib/tenant-export.ts` + `src/lib/export-csv.ts`,
// dan isi setiap berkas di dalam arsip WAJIB sama byte demi byte dengannya:
// nama berkas, urutan kolom, BOM, CRLF, escape RFC 4180, dan bentuk JS setiap
// tipe (lihat `csv.go`). Buktinya `bun run parity:tenant-export`, yang
// membangun kedua arsip atas buku yang sama dan membandingkan setiap entri.
// Sakelar pelaksananya `runner:` kind `tenant.data_export` di
// `contract/kinds.yaml`.
//
// ══ HANYA MEMBACA ══════════════════════════════════════════════════════════
// Setiap buku dibaca lewat `ledgerread` (transaksi READ ONLY + REPEATABLE
// READ — satu potret per buku, lebih ketat daripada sisi TS yang membaca per
// potongan); kendali hanya dibaca (`tenants`, `companies`). Jejak audit tenant
// TIDAK ditulis di sini: penerbit Node yang menulisnya saat menerbitkan
// (`tests/services-go.test.ts` menolak tulisan Go di luar `jobs`/`backup_runs`).
//
// ══ DI-STREAM, TIDAK PERNAH DIKUMPULKAN ═══════════════════════════════════
// Jalur `bulk` berpagar memori (`memory_fence_mib`) dan seproses dengan dump
// cadangan. Baris dibaca dari kursor pgx satu per satu dan langsung ditulis ke
// entri ZIP; berkas dokumen disalin dengan `io.Copy`. Puncak memorinya karena
// itu satu baris + penyangga deflate, berapa pun besar bukunya — lebih kecil
// daripada sisi TS, yang menyusun CSV satu tabel utuh di memori.
package tenantexport

import (
	"archive/zip"
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	// Zona bisnis (`Asia/Jakarta`) untuk tanggal di nama berkas — image
	// `debian:bookworm-slim` tidak memuat `tzdata`.
	_ "time/tzdata"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// DocumentsRootDefault: `data/documents` relatif ke direktori kerja — sama
// dengan `DOCUMENTS_ROOT` TS; kedua image ber-WORKDIR `/app`, dan volume
// `documents` dipasang `:ro` di `svc-integrator`. Tidak dibaca dari
// lingkungan, alasan yang sama dengan `document.ResultsRootDefault`.
const DocumentsRootDefault = "data/documents"

// Tenant: baris `tenants` yang dibutuhkan ekspor.
type Tenant struct {
	ID        int32
	Slug      string
	Name      string
	Status    string
	PlanKey   string
	CreatedAt time.Time
}

// companyRow: satu PT yang diekspor.
type companyRow = registry.Company

// Summary: angka yang dicatat log pelari (jejak audit sudah ditulis penerbit).
type Summary struct {
	Companies int
	Tables    int
	Rows      int64
	Documents int
	Missing   int
}

// BookOpener membuka buku satu PT di instansnya — `ledgerread.OpenAt`.
type BookOpener func(ctx context.Context, databaseName, urlEnvVar string) (*ledgerread.Reader, error)

// Options: yang boleh berbeda antara pelari dan perkakas paritas.
type Options struct {
	// DocumentsRoot: akar berkas dokumen; kosong = DocumentsRootDefault.
	DocumentsRoot string
	// GeneratedAt: stempel "Dibuat" — perkakas paritas memakunya supaya
	// `tenant.json`/`BACA-SAYA.txt` bisa dibandingkan byte demi byte.
	GeneratedAt time.Time
	// Progress: 0–100, untuk layar. Boleh nil.
	Progress func(int)
	// Open: kosong = `ledgerread.OpenAt`.
	Open BookOpener
}

// ErrNoTenant: pekerjaan tanpa `tenant_id` yang sah.
var ErrNoTenant = errors.New(
	"pekerjaan ekspor tanpa `tenant_id` yang sah — ia tidak bisa tahu buku siapa. " +
		"Konteks yang hilang MELEMPAR, tidak pernah jatuh ke tenant lain (#104)")

// LoadTenant membaca tenant dan SELURUH PT-nya (termasuk yang nonaktif) dari
// basis data kendali.
func LoadTenant(ctx context.Context, pool *pgxpool.Pool, tenantID *int32) (*Tenant, []registry.Company, error) {
	if tenantID == nil || *tenantID <= 0 {
		return nil, nil, ErrNoTenant
	}
	t := Tenant{ID: *tenantID}
	err := pool.QueryRow(ctx,
		`SELECT slug, name, status, plan_key, created_at FROM tenants WHERE id = $1`, *tenantID,
	).Scan(&t.Slug, &t.Name, &t.Status, &t.PlanKey, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, fmt.Errorf("tenant #%d tidak ada di basis data kendali", *tenantID)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("baca tenant #%d: %w", *tenantID, err)
	}
	companies, err := registry.ListByTenant(ctx, pool, *tenantID)
	if err != nil {
		return nil, nil, err
	}
	return &t, companies, nil
}

// FileName: `ekspor-<slug>-<tanggal bisnis Jakarta>.zip` — nama yang sama
// dengan sisi TS (`businessISODate`).
func FileName(slug string, at time.Time) (string, error) {
	loc, err := time.LoadLocation(contract.BusinessTimeZone)
	if err != nil {
		return "", fmt.Errorf("zona bisnis %s: %w", contract.BusinessTimeZone, err)
	}
	return "ekspor-" + slug + "-" + at.In(loc).Format("2006-01-02") + ".zip", nil
}

// safeIdentifier: `assertSafeIdentifier` TS — nama tabel/kolom dari
// information_schema tetap dipagari sebelum ditanam ke SQL.
var safeIdentifier = regexp.MustCompile(`^[A-Za-z0-9_]+$`)

func assertSafeIdentifier(name string) (string, error) {
	if !safeIdentifier.MatchString(name) {
		return "", fmt.Errorf("identifier tidak aman untuk ekspor: %q", name)
	}
	return name, nil
}

// storageKey: `STORAGE_KEY` di `src/lib/document-storage.ts`.
var storageKey = regexp.MustCompile(
	`^[1-9][0-9]{0,9}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$`)

// Write menulis arsip ekspor satu tenant ke w.
func Write(ctx context.Context, w io.Writer, t Tenant, companies []registry.Company, opts Options) (Summary, error) {
	if opts.DocumentsRoot == "" {
		opts.DocumentsRoot = DocumentsRootDefault
	}
	if opts.Open == nil {
		opts.Open = ledgerread.OpenAt
	}
	if opts.GeneratedAt.IsZero() {
		opts.GeneratedAt = time.Now()
	}
	lapor := opts.Progress
	if lapor == nil {
		lapor = func(int) {}
	}

	zw := zip.NewWriter(w)
	sum := Summary{Companies: len(companies)}
	lapor(5)
	for i, c := range companies {
		perTabel := func(selesai, jumlah int) {
			if jumlah == 0 {
				return
			}
			lapor(5 + 90*(i*jumlah+selesai)/(len(companies)*jumlah))
		}
		if err := writeCompany(ctx, zw, c, opts, &sum, perTabel); err != nil {
			return sum, fmt.Errorf("PT %s (%s): %w", c.Slug, c.DatabaseName, err)
		}
	}

	if err := writeEntry(zw, "tenant.json", opts.GeneratedAt, tenantJSON(t, companies, opts.GeneratedAt)); err != nil {
		return sum, err
	}
	if err := writeEntry(zw, "BACA-SAYA.txt", opts.GeneratedAt, readme(t, companies, opts.GeneratedAt)); err != nil {
		return sum, err
	}
	if err := zw.Close(); err != nil {
		return sum, fmt.Errorf("tutup arsip: %w", err)
	}
	lapor(98)
	return sum, nil
}

func header(name string, at time.Time) *zip.FileHeader {
	return &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: at}
}

func writeEntry(zw *zip.Writer, name string, at time.Time, isi string) error {
	f, err := zw.CreateHeader(header(name, at))
	if err != nil {
		return fmt.Errorf("entri %s: %w", name, err)
	}
	_, err = io.WriteString(f, isi)
	return err
}

func writeFolder(zw *zip.Writer, name string, at time.Time) error {
	_, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store, Modified: at})
	return err
}

type kolom struct {
	name   string
	format formatter
}

func writeCompany(ctx context.Context, zw *zip.Writer, c registry.Company, opts Options, sum *Summary, progress func(selesai, jumlah int)) error {
	r, err := opts.Open(ctx, c.DatabaseName, c.InstanceURLEnvVar)
	if err != nil {
		return err
	}
	defer r.Close()

	at := opts.GeneratedAt
	if err := writeFolder(zw, c.Slug+"/", at); err != nil {
		return err
	}
	return r.ReadOnly(ctx, func(tx pgx.Tx) error {
		for _, s := range setelanSesi {
			if _, err := tx.Exec(ctx, s); err != nil {
				return fmt.Errorf("%s: %w", s, err)
			}
		}

		// `current_schema()`: skema di dalam basis data yang disambungi —
		// kueri yang SAMA dengan sisi TS.
		tables, err := tableNames(ctx, tx)
		if err != nil {
			return err
		}
		for ti, table := range tables {
			progress(ti, len(tables))
			n, err := writeTable(ctx, zw, tx, c.Slug, table, at)
			if err != nil {
				return fmt.Errorf("tabel %s: %w", table, err)
			}
			sum.Tables++
			sum.Rows += n
		}
		progress(len(tables), len(tables))
		return writeDocuments(ctx, zw, tx, c.Slug, opts.DocumentsRoot, at, sum)
	})
}

func tableNames(ctx context.Context, tx pgx.Tx) ([]string, error) {
	rows, err := tx.Query(ctx,
		"SELECT table_name::text FROM information_schema.tables "+
			"WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' "+
			"AND table_name <> '_prisma_migrations' ORDER BY table_name")
	if err != nil {
		return nil, fmt.Errorf("daftar tabel: %w", err)
	}
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("daftar tabel: %w", err)
	}
	for i, n := range names {
		if names[i], err = assertSafeIdentifier(n); err != nil {
			return nil, err
		}
	}
	return names, nil
}

func columnsOf(ctx context.Context, tx pgx.Tx, table string) ([]kolom, error) {
	rows, err := tx.Query(ctx,
		"SELECT column_name::text, data_type::text FROM information_schema.columns "+
			"WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position", table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []kolom
	for rows.Next() {
		var name, dataType string
		if err := rows.Scan(&name, &dataType); err != nil {
			return nil, err
		}
		safe, err := assertSafeIdentifier(name)
		if err != nil {
			return nil, err
		}
		cols = append(cols, kolom{name: safe, format: formatterFor(dataType)})
	}
	return cols, rows.Err()
}

// writeTable menulis `<slug>/<tabel>.csv` dari SATU kursor, urut kolom
// pertama — urutan yang sama dengan potongan `ORDER BY … LIMIT/OFFSET` TS.
func writeTable(ctx context.Context, zw *zip.Writer, tx pgx.Tx, slug, table string, at time.Time) (int64, error) {
	cols, err := columnsOf(ctx, tx, table)
	if err != nil {
		return 0, err
	}
	if len(cols) == 0 {
		return 0, errors.New("tabel tanpa kolom")
	}
	f, err := zw.CreateHeader(header(slug+"/"+table+".csv", at))
	if err != nil {
		return 0, err
	}
	bw := bufio.NewWriterSize(f, 64<<10)
	names := make([]string, len(cols))
	pilih := make([]string, len(cols))
	for i, c := range cols {
		names[i] = c.name
		// Dibaca sebagai TEKS lalu dibentuk ulang per tipe (`csv.go`) — byte
		// nilai `text` sama di format teks maupun biner, jadi mode eksekusi
		// pgx (langsung atau lewat PgBouncer) tidak mengubah apa pun. Urutan
		// memakai kolom ASLI (`src."…"`), bukan alias teksnya — `ORDER BY`
		// dengan nama telanjang akan mengurutkan menurut teks.
		pilih[i] = `src."` + c.name + `"::text`
	}
	if _, err := bw.WriteString(bom); err != nil {
		return 0, err
	}
	if err := writeRow(bw, names); err != nil {
		return 0, err
	}

	rows, err := tx.Query(ctx,
		`SELECT `+strings.Join(pilih, ", ")+` FROM "`+table+`" AS src ORDER BY src."`+cols[0].name+`"`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var n int64
	cells := make([]string, len(cols))
	for rows.Next() {
		raw := rows.RawValues()
		for i, v := range raw {
			if v == nil {
				cells[i] = ""
				continue
			}
			cells[i] = cols[i].format(string(v))
		}
		if err := writeRow(bw, cells); err != nil {
			return n, err
		}
		n++
	}
	if err := rows.Err(); err != nil {
		return n, err
	}
	return n, bw.Flush()
}

// writeDocuments: berkas dokumen PT (#367) sebagai ALIRAN; baris yang
// berkasnya tidak ada dicatat di `BERKAS-TIDAK-DITEMUKAN.txt` — ekspor yang
// diam-diam melewati sesuatu mengaku lengkap padahal tidak.
func writeDocuments(ctx context.Context, zw *zip.Writer, tx pgx.Tx, slug, root string, at time.Time, sum *Summary) error {
	rows, err := tx.Query(ctx, `SELECT id::int8, filename, filepath FROM documents ORDER BY id`)
	if err != nil {
		return fmt.Errorf("baca documents: %w", err)
	}
	defer rows.Close()
	var missing []string
	folderDibuat := false
	for rows.Next() {
		var id int64
		var filename, key string
		if err := rows.Scan(&id, &filename, &key); err != nil {
			return err
		}
		absolute := ""
		if storageKey.MatchString(key) {
			absolute = filepath.Join(root, key)
		}
		if absolute == "" || !isRegularFile(absolute) {
			missing = append(missing, strconv.FormatInt(id, 10)+"\t"+filename+"\t"+key)
			continue
		}
		if !folderDibuat {
			if err := writeFolder(zw, slug+"/documents/", at); err != nil {
				return err
			}
			folderDibuat = true
		}
		if err := copyFile(zw, slug+"/documents/"+archiveEntryName(id, filename), absolute, at); err != nil {
			return err
		}
		sum.Documents++
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(missing) > 0 {
		sum.Missing += len(missing)
		return writeEntry(zw, slug+"/documents/BERKAS-TIDAK-DITEMUKAN.txt", at, missingDocuments(missing))
	}
	return nil
}

func isRegularFile(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.Mode().IsRegular()
}

func copyFile(zw *zip.Writer, name, absolute string, at time.Time) error {
	src, err := os.Open(absolute)
	if err != nil {
		return fmt.Errorf("buka dokumen %s: %w", name, err)
	}
	defer src.Close()
	dst, err := zw.CreateHeader(header(name, at))
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("salin dokumen %s: %w", name, err)
	}
	return nil
}
