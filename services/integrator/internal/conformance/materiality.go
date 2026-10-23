// Package conformance: sapuan KESESUAIAN DATA seluruh buku — kembaran Go
// `scripts/check-data-conformance.ts` (09 §3.3, tahap 1d, 23 Okt 2026).
//
// ══ HANYA MEMBACA BUKU ═════════════════════════════════════════════════════
// Sebelas pemeriksaan, semuanya SELECT di dalam transaksi `READ ONLY`
// (`ledgerread.Reader.ReadOnly`). Keputusan "angka mana yang benar" hampir
// selalu butuh dokumen fisik atau pemilik datanya; yang boleh diotomatiskan
// hanya MENEMUKANNYA. Satu-satunya tulisan sapuan ini adalah jejak putarannya
// (`conformance_runs`, basis data KENDALI) — lewat `internal/trail`, bukan dari
// paket ini, dan alasannya di daftar-izin `tests/services-go.test.ts`.
//
// ══ DUA DARI SEBELAS MENGHITUNG — DAN ITULAH SEBABNYA IA BARU PINDAH SEKARANG
// `akun-penampung` dan `beban-tanpa-sifat` tidak cukup ditulis sebagai SQL:
// pagar materialitas (#444/#445) membandingkan tiap akun beban dengan TOTAL
// seluruh akun. Sampai 23 Okt 2026 §3.3 menahan Go di depan garis itu;
// pemiliknya membukanya dengan syarat yang sama dengan laporan tahap 1d —
// konstantanya DIBANGKITKAN (`contract/accounting.yaml` → `materiality`), dan
// kesetaraannya DIBUKTIKAN terhadap buku sungguhan (`bun run
// parity:conformance`), bukan diyakini dari ulasan kode.
//
// Berkas ini kembaran `src/lib/materiality.ts`, baris demi baris, sampai ke
// aritmetika float-nya: jumlah dalam URUTAN baris, `Math.round` (bukan
// `math.Round`), `toFixed` (bukan `FormatFloat`), urut STABIL. Fikstur
// bersama `testdata/materiality_fixtures.json` dibaca kedua bahasa.
package conformance

import (
	"regexp"
	"sort"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ExpenseAccountTotal: satu akun beban beserta nilainya sepanjang buku.
// Padanan `ExpenseAccountTotal` TS.
type ExpenseAccountTotal struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"`
	// Amount: Σ(base_debit − base_credit), dibaca sebagai float64 dari teks
	// NUMERIC — sama dengan `Number(r.amount)` TS (keduanya dibulatkan benar
	// dari teks yang sama).
	Amount float64 `json:"amount"`
	// Nature: sifat beban (#445); nil atau "" = belum ditetapkan.
	Nature *string `json:"nature"`
}

// CatchAllFinding: satu temuan pagar penampung.
type CatchAllFinding struct {
	// Reason: "name" (akun yang menamai dirinya penampung) atau "band"
	// (seluruh band "Beban Lain-lain").
	Reason string  `json:"reason"`
	Code   string  `json:"code"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Share  float64 `json:"share"`
}

// UntaggedExpenseFinding: satu akun beban material yang belum bersifat.
type UntaggedExpenseFinding struct {
	Code   string  `json:"code"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Share  float64 `json:"share"`
}

// namaPenampung: pola kontrak yang SUDAH diterjemahkan ke RE2 oleh generator.
// Dicocokkan tanpa `(?i)` terhadap nama yang huruf ASCII-nya diturunkan —
// lipatan bendera `i` RegExp JS tanpa `u` (lihat `contract/accounting.yaml`).
var namaPenampung = regexp.MustCompile(contract.MaterialityCatchAllNamePattern)

// asciiKecil menurunkan A–Z saja; selebihnya utuh. `strings.ToLower` akan
// menurunkan `K` Kelvin (U+212A) menjadi `k` — JS tidak.
func asciiKecil(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + ('a' - 'A')
		}
	}
	return string(b)
}

// IsCatchAllName: padanan `isCatchAllName`.
func IsCatchAllName(name string) bool {
	return namaPenampung.MatchString(asciiKecil(name))
}

// round2: `Math.round(n * 100) / 100`.
func round2(n float64) float64 { return jscompat.Round(n*100) / 100 }

func total(accounts []ExpenseAccountTotal) float64 {
	jumlah := 0.0
	for _, a := range accounts {
		jumlah += a.Amount
	}
	return round2(jumlah)
}

// AssessCatchAll: padanan `assessCatchAllExpenses` dengan band dan labelnya
// dari kontrak. Pulang total beban dan temuan, yang terbesar lebih dulu.
func AssessCatchAll(accounts []ExpenseAccountTotal, threshold float64) (float64, []CatchAllFinding) {
	totalBeban := total(accounts)
	if totalBeban <= 0 {
		return totalBeban, nil
	}
	var temuan []CatchAllFinding
	for _, a := range accounts {
		if a.Amount <= 0 || !IsCatchAllName(a.Name) {
			continue
		}
		pangsa := a.Amount / totalBeban
		if pangsa <= threshold {
			continue
		}
		temuan = append(temuan, CatchAllFinding{
			Reason: "name", Code: a.Code, Name: a.Name, Amount: round2(a.Amount), Share: pangsa,
		})
	}

	band := 0.0
	for _, a := range accounts {
		if a.Type == string(contract.MaterialityCatchAllExpenseType) {
			band += a.Amount
		}
	}
	band = round2(band)
	if band > 0 {
		if pangsa := band / totalBeban; pangsa > threshold {
			temuan = append(temuan, CatchAllFinding{
				Reason: "band", Name: contract.MaterialityCatchAllTypeLabel, Amount: band, Share: pangsa,
			})
		}
	}
	// Stabil, seperti `Array.prototype.sort` sejak ES2019.
	sort.SliceStable(temuan, func(i, j int) bool { return temuan[i].Share > temuan[j].Share })
	return totalBeban, temuan
}

// FindUntagged: padanan `findUntaggedMaterialExpenses`.
func FindUntagged(accounts []ExpenseAccountTotal, threshold float64) (float64, []UntaggedExpenseFinding) {
	totalBeban := total(accounts)
	if totalBeban <= 0 {
		return totalBeban, nil
	}
	var temuan []UntaggedExpenseFinding
	for _, a := range accounts {
		if a.Amount <= 0 || (a.Nature != nil && *a.Nature != "") {
			continue
		}
		pangsa := a.Amount / totalBeban
		if pangsa > threshold {
			temuan = append(temuan, UntaggedExpenseFinding{
				Code: a.Code, Name: a.Name, Amount: round2(a.Amount), Share: pangsa,
			})
		}
	}
	sort.SliceStable(temuan, func(i, j int) bool { return temuan[i].Share > temuan[j].Share })
	return totalBeban, temuan
}

// persenDanNominal: `(share * 100).toFixed(1)` dan
// `Math.round(amount).toLocaleString("id-ID")`.
func persenDanNominal(share, amount float64) (string, string) {
	return jscompat.ToFixed(share*100, 1), jscompat.FormatNumberID(jscompat.Round(amount))
}

// DescribeCatchAll: padanan `describeCatchAllFinding` — kalimatnya SAMA PERSIS.
func DescribeCatchAll(f CatchAllFinding) string {
	persen, nominal := persenDanNominal(f.Share, f.Amount)
	if f.Reason == "band" {
		return `seluruh band "` + f.Name + `" = Rp ` + nominal + " (" + persen + "% dari total beban)"
	}
	return f.Code + " " + f.Name + " = Rp " + nominal + " (" + persen + "% dari total beban)"
}

// DescribeUntagged: padanan `describeUntaggedExpense`.
func DescribeUntagged(f UntaggedExpenseFinding) string {
	persen, nominal := persenDanNominal(f.Share, f.Amount)
	return f.Code + " " + f.Name + " = Rp " + nominal + " (" + persen + "% dari total beban)"
}
