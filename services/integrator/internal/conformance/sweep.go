package conformance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

// ══ BATAS SERENTAK & AMBANG — DIBACA PERSIS SEPERTI NODE ══════════════════
// `CONFORMANCE_CONCURRENCY` dan `--ambang-penampung` dibaca dengan `Number()`
// JS di sisi Node. Membacanya dengan `strconv` di sini berarti satu nilai env
// yang SAMA menghasilkan dua batas berbeda pada hari peralihan — dan alasan
// bawaan 3 / plafon 8 (basis data yang juga melayani aplikasi) tertulis di
// `batasSerentak()` TS, satu tempat.

const (
	serentakBawaan = 3
	serentakPlafon = 8
)

func bilanganBulat(n float64) bool {
	return !math.IsNaN(n) && !math.IsInf(n, 0) && n == math.Trunc(n)
}

// Concurrency: padanan `batasSerentak()`. `warn` menerima kalimat yang SAMA.
func Concurrency(raw string, warn func(string)) int {
	if raw == "" {
		return serentakBawaan
	}
	n := jscompat.Number(raw)
	if !bilanganBulat(n) || n < 1 {
		kutip, _ := json.Marshal(raw)
		warn(fmt.Sprintf("⚠ CONFORMANCE_CONCURRENCY=%s bukan bilangan bulat ≥ 1 — memakai %d.", kutip, serentakBawaan))
		return serentakBawaan
	}
	if n > serentakPlafon {
		warn(fmt.Sprintf("⚠ CONFORMANCE_CONCURRENCY=%s di atas plafon %d — memakai %d.",
			strconv.FormatFloat(n, 'f', -1, 64), serentakPlafon, serentakPlafon))
		return serentakPlafon
	}
	return int(n)
}

// Threshold: padanan `ambangPenampung` — `--ambang-penampung=<persen>`
// (nil = tidak diberikan). Persen yang bukan angka hingga positif jatuh ke
// bawaan kontrak, seperti di TS.
func Threshold(persen *string) float64 {
	if persen == nil {
		return contract.MaterialityCatchAllThreshold
	}
	p := jscompat.Number(*persen)
	if !math.IsNaN(p) && !math.IsInf(p, 0) && p > 0 {
		return p / 100
	}
	return contract.MaterialityCatchAllThreshold
}

// BookRecord: satu buku di dalam jejak putaran — padanan `CatatanBuku` TS,
// medan dan urutannya sama (dibaca konsol `/conformance`).
type BookRecord struct {
	Slug         string `json:"slug"`
	DatabaseName string `json:"databaseName"`
	Instance     string `json:"instance"`
	Status       string `json:"status"`
	FindingCount int    `json:"findingCount"`
	DurationMs   int64  `json:"durationMs"`
}

// BookChecker memeriksa SATU buku. Produksi: `OpenAndCheck`.
type BookChecker func(ctx context.Context, c registry.Company) ([]CheckResult, error)

// OpenAndCheck membuka buku di instansnya (registry, tahap 4 — tidak pernah
// server bawaan sebagai gantinya) dan menjalankan seluruh pemeriksaan di satu
// transaksi READ ONLY.
func OpenAndCheck(threshold float64) BookChecker {
	return func(ctx context.Context, c registry.Company) ([]CheckResult, error) {
		r, err := ledgerread.OpenAt(ctx, c.DatabaseName, c.InstanceURLEnvVar)
		if err != nil {
			return nil, err
		}
		// `defer`: kolam yang tidak ditutup pada jalur GAGAL menahan satu
		// koneksi per buku — alasan `finally` di sisi TS.
		defer r.Close()
		var hasil []CheckResult
		err = r.ReadOnly(ctx, func(tx pgx.Tx) error {
			var e error
			hasil, e = RunChecks(ctx, tx, threshold)
			return e
		})
		return hasil, err
	}
}

// Result: satu putaran sapuan — yang dicetak dan yang dicatat.
type Result struct {
	// Status: ok | findings | error — kosakata `conformance_runs.status`.
	Status           string
	CompaniesChecked int
	CompaniesFailed  int
	FindingCount     int
	// Findings: SELURUH kalimat temuan, `<slug> · <judul>: <label>`.
	Findings   []string
	Failures   []string
	PerCompany []BookRecord
	// Lines: laporan yang dicetak, dalam urutan daftar perusahaan.
	Lines []string
}

type hasilBuku struct {
	baris, temuanBaris []string
	jumlahTemuan       int
	gagalPesan         *string
	durasi             int64
}

// Sweep menyapu setiap perusahaan dengan paling banyak `concurrency` buku
// bersamaan. Hasil diindeks menurut URUTAN DAFTAR, bukan urutan selesai —
// laporan yang urutannya berubah tiap putaran membuat diff antar putaran
// berhenti berguna (alasan yang sama di sisi TS).
func Sweep(ctx context.Context, companies []registry.Company, check BookChecker, concurrency int, detail bool) Result {
	instansOf := func(c registry.Company) string {
		if c.InstanceKey == "" {
			return contract.DBInstanceDefaultLabel
		}
		return c.InstanceKey
	}

	periksaSatu := func(c registry.Company) hasilBuku {
		mulai := time.Now()
		instans := instansOf(c)
		label := c.Slug
		if instans != contract.DBInstanceDefaultLabel {
			label += " @" + instans
		}
		if !c.IsActive {
			label += " [nonaktif]"
		}
		temuan, err := check(ctx, c)
		durasi := time.Since(mulai).Milliseconds()
		if err != nil {
			pesan := c.Slug + ": " + err.Error()
			return hasilBuku{gagalPesan: &pesan, durasi: durasi}
		}
		if len(temuan) == 0 {
			return hasilBuku{baris: []string{"✓ " + label + " — bersih"}, durasi: durasi}
		}
		h := hasilBuku{baris: []string{"\n✗ " + label}, durasi: durasi}
		for _, t := range temuan {
			h.jumlahTemuan += len(t.Labels)
			h.baris = append(h.baris, fmt.Sprintf("   %s: %d", t.Judul, len(t.Labels)))
			for _, l := range t.Labels {
				h.temuanBaris = append(h.temuanBaris, c.Slug+" · "+t.Judul+": "+l)
			}
			tampil := t.Labels
			if !detail && len(tampil) > 3 {
				tampil = tampil[:3]
			}
			for _, l := range tampil {
				h.baris = append(h.baris, "      · "+l)
			}
			if !detail && len(t.Labels) > len(tampil) {
				h.baris = append(h.baris, fmt.Sprintf("      … %d lagi (pakai --detail)", len(t.Labels)-len(tampil)))
			}
		}
		return h
	}

	serentak := concurrency
	if serentak > len(companies) {
		serentak = len(companies)
	}
	if serentak < 1 {
		serentak = 1
	}
	res := Result{CompaniesChecked: len(companies)}
	res.Lines = append(res.Lines, fmt.Sprintf("%d buku, %d disapu bersamaan (CONFORMANCE_CONCURRENCY=%d).\n",
		len(companies), serentak, serentak))

	hasil := make([]hasilBuku, len(companies))
	var berikut int
	var kunci sync.Mutex
	var tunggu sync.WaitGroup
	for w := 0; w < serentak; w++ {
		tunggu.Add(1)
		go func() {
			defer tunggu.Done()
			for {
				kunci.Lock()
				i := berikut
				berikut++
				kunci.Unlock()
				if i >= len(companies) {
					return
				}
				hasil[i] = periksaSatu(companies[i])
			}
		}()
	}
	tunggu.Wait()

	for i, r := range hasil {
		c := companies[i]
		res.Lines = append(res.Lines, r.baris...)
		res.Findings = append(res.Findings, r.temuanBaris...)
		res.FindingCount += r.jumlahTemuan
		status := "ok"
		switch {
		case r.gagalPesan != nil:
			res.Failures = append(res.Failures, *r.gagalPesan)
			status = "error"
		case r.jumlahTemuan > 0:
			status = "findings"
		}
		res.PerCompany = append(res.PerCompany, BookRecord{
			Slug: c.Slug, DatabaseName: c.DatabaseName, Instance: instansOf(c),
			Status: status, FindingCount: r.jumlahTemuan, DurationMs: r.durasi,
		})
	}
	res.CompaniesFailed = len(res.Failures)

	ringkas := "Bersih"
	if res.FindingCount > 0 {
		ringkas = fmt.Sprintf("%d temuan", res.FindingCount)
	}
	res.Lines = append(res.Lines, fmt.Sprintf("\n%s di %d perusahaan.", ringkas, len(companies)))

	// Per instans — hanya bila ada lebih dari instans bawaan (sama dengan TS).
	var instansDipakai []string
	lihat := map[string]bool{}
	for _, b := range res.PerCompany {
		if !lihat[b.Instance] {
			lihat[b.Instance] = true
			instansDipakai = append(instansDipakai, b.Instance)
		}
	}
	sortStrings(instansDipakai)
	if len(instansDipakai) > 1 || (len(instansDipakai) == 1 && instansDipakai[0] != contract.DBInstanceDefaultLabel) {
		for _, ins := range instansDipakai {
			var n, galat, bertemuan int
			for _, b := range res.PerCompany {
				if b.Instance != ins {
					continue
				}
				n++
				if b.Status == "error" {
					galat++
				}
				if b.Status == "findings" {
					bertemuan++
				}
			}
			res.Lines = append(res.Lines, fmt.Sprintf("   instans %s: %d buku, %d bertemuan, %d gagal diperiksa", ins, n, bertemuan, galat))
		}
	}
	if len(res.Failures) > 0 {
		res.Lines = append(res.Lines, fmt.Sprintf("\n%d perusahaan gagal diperiksa:", len(res.Failures)))
		for _, g := range res.Failures {
			res.Lines = append(res.Lines, "   "+g)
		}
	}

	switch {
	case res.CompaniesFailed > 0:
		res.Status = "error"
	case res.FindingCount > 0:
		res.Status = "findings"
	default:
		res.Status = "ok"
	}
	return res
}

// sortStrings: urut UTF-16 seperti `Array.prototype.sort()` bawaan — untuk
// kunci instans (`^[a-z][a-z0-9_]*$`, ASCII) sama dengan urut byte.
func sortStrings(xs []string) {
	for i := 1; i < len(xs); i++ {
		for j := i; j > 0 && xs[j] < xs[j-1]; j-- {
			xs[j], xs[j-1] = xs[j-1], xs[j]
		}
	}
}

// TrailFindingsMax: berapa kalimat temuan yang ikut ke jejak — sama dengan
// `findings.slice(0, 200)` TS. Jumlah utuhnya di `finding_count`.
const TrailFindingsMax = 200

// Details: isi kolom `conformance_runs.details` — bentuk yang dibaca konsol
// (`parseConformanceDetails`) dan panel versi layanan (`build`). `runner` dan
// `service` menyebut SIAPA yang menyapu: sejak sakelar `runner:` ada, satu
// tabel ditulis dua kemungkinan pelaksana.
type Details struct {
	Findings   []string     `json:"findings"`
	Failures   []string     `json:"failures"`
	PerCompany []BookRecord `json:"perCompany"`
	Build      string       `json:"build"`
	Runner     string       `json:"runner"`
	Service    string       `json:"service"`
}

// TrailDetails merakit `details` dari hasil putaran.
func TrailDetails(r Result, build, service string) (string, error) {
	f := r.Findings
	if len(f) > TrailFindingsMax {
		f = f[:TrailFindingsMax]
	}
	d := Details{
		Findings: nonNil(f), Failures: nonNil(r.Failures), PerCompany: r.PerCompany,
		Build: build, Runner: string(contract.RunnerGo), Service: service,
	}
	if d.PerCompany == nil {
		d.PerCompany = []BookRecord{}
	}
	// Tanpa pelolosan HTML (`&` → `&`): isinya setara setelah diurai,
	// tapi kolom yang dibaca orang lewat psql sebaiknya sama dengan tulisan
	// `JSON.stringify` Node — "Beban Bunga & Administrasi Bank", bukan kodenya.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(d); err != nil {
		return "", err
	}
	return strings.TrimSuffix(buf.String(), "\n"), nil
}

func nonNil(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}
