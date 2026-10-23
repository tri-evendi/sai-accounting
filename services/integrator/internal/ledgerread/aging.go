package ledgerread

import (
	"context"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ══ UMUR PIUTANG & UMUR UTANG — PADANAN `getReceivables` / `getPayables` ═══
//
// Laporan tahap 1d PERTAMA yang tidak membaca baris jurnal, melainkan DOKUMEN
// sub-buku: faktur, kontrak, pembayaran, uang muka yang dikompensasikan, retur,
// dan transaksi pemasok beserta alokasinya. Aturannya disalin dari
// `src/lib/receivables.ts`, bukan dirancang ulang — `bun run parity:receivables`
// dan `parity:payables` membandingkan keduanya baris demi baris.
//
//  1. TIDAK PERNAH menjumlahkan dua mata uang. Setiap jumlah lintas dokumen
//     dalam rupiah DASAR: `base_amount` bila ada (kurs yang benar-benar
//     diposting), kalau tidak `amount` untuk IDR, kalau tidak `amount × rate`.
//     Dokumen valas TANPA kurs tidak punya nilai IDR: dikeluarkan dari
//     jumlah, dihitung di `Unresolved`, dan sel sisanya KOSONG — bukan nol.
//  2. Status pembayaran DITURUNKAN, tidak disimpan: lunas (sisa ≤ setengah
//     sen) mendahului jatuh tempo, yang mendahului sebagian/belum bayar.
//     Dokumen tanpa jatuh tempo tidak pernah "jatuh tempo".
//  3. Umur = hari kalender JAKARTA antara jatuh tempo (atau tanggal dokumen,
//     bila jatuh temponya kosong) dan tanggal laporan; ember dari
//     `contract.AgingBuckets` (`contract/accounting.yaml`).
//  4. Potret historis: dokumen bertanggal > asOf belum menjadi klaim, dan
//     pelunasan bertanggal > asOf belum melunasi apa pun.
//  5. Piutang: faktur + kontrak (dibatalkan dikeluarkan); bagian kontrak yang
//     SUDAH difakturkan (pola Ambil, #15) melunasi kontraknya, diukur dengan
//     penjodohan NAMA barang yang sama dengan `buildContractOutstanding`.
//     Utang: baris `purchase` dilunasi alokasi tercatat dulu, sisanya FIFO
//     (tertua dulu) — `allocatePayments`.
//  6. Urutan: tanggal terbaru dulu, lalu id terbesar (`NEWEST_FIRST` TS).
//
// ══ ARITMETIKA EKSAK, DIBULATKAN DI TITIK YANG SAMA ═════════════════════════
// TS memakai float; Go memakai bilangan RASIONAL eksak (`math/big`) yang
// diurai langsung dari teks NUMERIC, lalu dibulatkan ke sen PERSIS di titik
// `round2` TS (setengah sen ke atas, seperti `Math.round`). Hasil yang
// dilaporkan — sisa, dibayar, ember, total — adalah sen int64. Selisih yang
// muncul HANYA karena float (nilai yang tepat setengah sen di titik pembulatan)
// adalah temuan tentang sisi TS, bukan tentang Go.

// Decimal adalah nilai uang EKSAK yang belum dibulatkan ke sen — nilai dokumen
// dalam mata uangnya sendiri (Σ kuantitas × harga) atau nilai IDR dari
// `amount × rate`. Ditulis ke JSON sebagai STRING desimal tepat.
type Decimal struct{ r *big.Rat }

// MarshalJSON: desimal tepat tanpa nol ekor ("4.995", "1250000").
func (d Decimal) MarshalJSON() ([]byte, error) {
	return []byte(`"` + d.String() + `"`), nil
}

// String menulis rasional berpenyebut 2^a·5^b sebagai desimal TEPAT.
// Nilai nol Decimal (tanpa rasional) adalah 0.
func (d Decimal) String() string {
	if d.r == nil {
		return "0"
	}
	return ratText(d.r)
}

// Rat memulangkan salinan nilainya.
func (d Decimal) Rat() *big.Rat {
	if d.r == nil {
		return new(big.Rat)
	}
	return new(big.Rat).Set(d.r)
}

// ratText: desimal tepat. Semua nilai di laporan ini berasal dari NUMERIC
// berskala ≤ 6 dan perkaliannya, jadi penyebutnya membagi 10^n untuk n kecil;
// 18 digit pecahan lebih dari cukup, dan nol ekor dibuang.
func ratText(r *big.Rat) string {
	s := r.FloatString(18)
	if strings.Contains(s, ".") {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	if s == "-0" {
		return "0"
	}
	return s
}

// parseRat mengurai teks NUMERIC menjadi rasional TEPAT.
//
// Diurai sendiri, bukan `Rat.SetString`: teks NUMERIC PostgreSQL tidak pernah
// berbentuk eksponen, dan SetString menerima "1e1000000000" — bentuk yang
// mestinya ditolak, bukan dimekarkan jadi bilangan raksasa (gosec G113).
func parseRat(s string) (*big.Rat, error) {
	t := strings.TrimSpace(s)
	neg := strings.HasPrefix(t, "-")
	t = strings.TrimPrefix(t, "-")
	whole, frac, _ := strings.Cut(t, ".")
	if whole == "" || !onlyDecimal(whole) || !onlyDecimal(frac) {
		return nil, fmt.Errorf("%q bukan angka desimal", s)
	}
	num, ok := new(big.Int).SetString(whole+frac, 10)
	if !ok {
		return nil, fmt.Errorf("%q bukan angka desimal", s)
	}
	if neg {
		num.Neg(num)
	}
	den := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(len(frac))), nil)
	return new(big.Rat).SetFrac(num, den), nil
}

func onlyDecimal(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// parseRatPtr: kolom NUMERIC yang boleh NULL.
func parseRatPtr(s *string) (*big.Rat, error) {
	if s == nil {
		return nil, nil
	}
	return parseRat(*s)
}

// centScale = 10^MoneyScale; halfCent = setengah sen — `EPSILON` TS (0,005).
var (
	centScale = new(big.Int).Exp(big.NewInt(10), big.NewInt(contract.MoneyScale), nil)
	halfCent  = new(big.Rat).SetFrac(big.NewInt(1), new(big.Int).Mul(big.NewInt(2), centScale))
)

// roundCents: `round2` TS — `Math.round(n × 100) / 100` atas nilai EKSAK:
// floor(n × 10^skala + ½). Setengah sen dibulatkan ke ATAS, juga untuk nilai
// negatif (−0,005 → 0), persis `Math.round`.
func roundCents(r *big.Rat) Cents {
	x := new(big.Rat).Mul(r, new(big.Rat).SetInt(centScale))
	x.Add(x, big.NewRat(1, 2))
	q := new(big.Int).Div(x.Num(), x.Denom()) // Euclid, penyebut positif = floor
	return Cents(q.Int64())
}

// isHalfCent: nilai eksak yang TEPAT di tengah dua sen (…,xx5) — titik di
// mana `Math.round` atas float TS bisa jatuh ke sisi lain, sebab desimal
// seperti 78910,005 tidak terwakili tepat oleh double.
func isHalfCent(r *big.Rat) bool {
	x := new(big.Rat).Mul(r, new(big.Rat).SetInt(centScale))
	x.Sub(x, new(big.Rat).SetInt(new(big.Int).Div(x.Num(), x.Denom())))
	return x.Cmp(big.NewRat(1, 2)) == 0
}

// rounder: `roundCents` yang MENCATAT apakah salah satu pembulatannya jatuh
// tepat di setengah sen. Hasil Go tidak berubah karenanya — yang dibeli
// catatan ini: selisih paritas pada baris bertanda `halfCentTie` adalah float
// TS yang kalah di titik seri, bukan aturan yang berbeda (lihat kepala berkas).
type rounder struct{ tie bool }

func (t *rounder) cents(r *big.Rat) Cents {
	if isHalfCent(r) {
		t.tie = true
	}
	return roundCents(r)
}

// centsRat: sen → rasional rupiah.
func centsRat(c Cents) *big.Rat {
	return new(big.Rat).SetFrac(big.NewInt(int64(c)), centScale)
}

func addRat(a, b *big.Rat) *big.Rat { return new(big.Rat).Add(a, b) }
func subRat(a, b *big.Rat) *big.Rat { return new(big.Rat).Sub(a, b) }
func mulRat(a, b *big.Rat) *big.Rat { return new(big.Rat).Mul(a, b) }

func minRat(a, b *big.Rat) *big.Rat {
	if a.Cmp(b) <= 0 {
		return a
	}
	return b
}

// atMostHalfCent: `x <= EPSILON` TS.
func atMostHalfCent(r *big.Rat) bool { return r.Cmp(halfCent) <= 0 }

// moneyRow: satu baris uang seperti tersimpan — `MoneyRow` TS.
type moneyRow struct {
	amount   *big.Rat
	currency string
	rate     *big.Rat // nil = NULL
	base     *big.Rat // nil = NULL
}

// currencyOr: `currency || BASE_CURRENCY` — string kosong ikut jatuh ke IDR.
func currencyOr(c string) string {
	if c == "" {
		return string(contract.BaseCurrency)
	}
	return c
}

// toBase: nilai IDR dasar sebuah baris uang, atau nil bila ia sungguh tidak
// punya. Urutannya bermakna (lihat `toBase` TS): `base_amount` tersimpan
// menang atas perhitungan ulang dari kurs.
func toBase(m moneyRow) *big.Rat {
	if m.base != nil {
		return m.base
	}
	if currencyOr(m.currency) == string(contract.BaseCurrency) {
		return m.amount
	}
	if m.rate != nil && m.rate.Sign() > 0 {
		return mulRat(m.amount, m.rate)
	}
	return nil
}

// AgeInDays: hari kalender Jakarta dari `date` ke `asOf` — negatif bila `date`
// di masa depan. Padanan `ageInDays` TS (#715): tanggal 00:00 WIB dan
// 07:00 WIB di hari yang sama berumur sama.
func AgeInDays(date, asOf time.Time, loc *time.Location) int {
	a := date.In(loc)
	b := asOf.In(loc)
	da := time.Date(a.Year(), a.Month(), a.Day(), 0, 0, 0, 0, time.UTC)
	db := time.Date(b.Year(), b.Month(), b.Day(), 0, 0, 0, 0, time.UTC)
	return int((db.Unix() - da.Unix()) / 86400)
}

// BucketFor: ember umur dari kontrak — batas atas INKLUSIF, umur <= 0 di ember
// pertama, ember terakhir menampung sisanya.
func BucketFor(days int) contract.AgingBucket {
	for _, b := range contract.AgingBuckets {
		if !b.Bounded || days <= b.MaxDays {
			return b.Key
		}
	}
	return contract.AgingBuckets[len(contract.AgingBuckets)-1].Key
}

// deriveStatus: `deriveStatus` TS. totalBase nil = nilai dokumen tidak
// diketahui, jadi ia tidak pernah "lunas".
func deriveStatus(totalBase *big.Rat, paid Cents, due *time.Time, asOf time.Time, loc *time.Location) contract.PaymentStatus {
	p := centsRat(paid)
	if totalBase != nil && p.Cmp(subRat(totalBase, halfCent)) >= 0 {
		return contract.PaymentStatusPaid
	}
	if due != nil && AgeInDays(*due, asOf, loc) > 0 {
		return contract.PaymentStatusOverdue
	}
	if p.Cmp(halfCent) > 0 {
		return contract.PaymentStatusPartial
	}
	return contract.PaymentStatusUnpaid
}

// AgingDocument adalah satu baris Umur Piutang/Utang.
type AgingDocument struct {
	// Kind: invoice | contract | purchase (sama dengan `kind` TS).
	Kind       string     `json:"kind"`
	ID         int64      `json:"id"`
	DocumentNo string     `json:"documentNo"`
	PartyName  string     `json:"partyName"`
	Date       time.Time  `json:"date"`
	DueDate    *time.Time `json:"dueDate"`
	// Total: nilai dokumen dalam MATA UANGNYA SENDIRI, eksak (belum dibulatkan).
	Total    Decimal `json:"total"`
	Currency string  `json:"currency"`
	// TotalBase: nilai IDR dokumen, eksak; null = valas tanpa kurs.
	TotalBase *Decimal `json:"totalBase"`
	PaidBase  Cents    `json:"paidBase"`
	// OutstandingBase: sisa IDR (≥ 0); null = valas tanpa kurs.
	OutstandingBase     *Cents                 `json:"outstandingBase"`
	Status              contract.PaymentStatus `json:"status"`
	AgeDays             int                    `json:"ageDays"`
	AgeFromIssue        bool                   `json:"ageFromIssue"`
	Bucket              contract.AgingBucket   `json:"bucket"`
	AllocationEstimated bool                   `json:"allocationEstimated"`
	// HalfCentTie: salah satu pembulatan sen dokumen ini (atau, untuk Utang,
	// alokasi pemasoknya) jatuh TEPAT di setengah sen. Informasi untuk
	// paritas — angka Go tidak bergantung padanya.
	HalfCentTie bool `json:"halfCentTie"`
}

// AgingBucketTotal: jumlah sisa IDR satu ember.
type AgingBucketTotal struct {
	Bucket contract.AgingBucket `json:"bucket"`
	Amount Cents                `json:"amount"`
}

// AgingReport adalah Umur Piutang atau Umur Utang per satu tanggal.
type AgingReport struct {
	Kind        string    `json:"kind"`
	AsOf        time.Time `json:"asOf"`
	OverdueOnly bool      `json:"overdueOnly"`
	// Rows: dokumen yang BELUM lunas (atau tanpa nilai IDR), urutan laporan.
	Rows    []AgingDocument    `json:"rows"`
	Buckets []AgingBucketTotal `json:"buckets"`
	Total   Cents              `json:"total"`
	// Unresolved: dokumen tanpa nilai IDR — tidak ikut dijumlahkan.
	Unresolved   int `json:"unresolved"`
	OverdueCount int `json:"overdueCount"`
}

// settleInput: `SettleInput` TS.
type settleInput struct {
	total     *big.Rat
	currency  string
	totalBase *big.Rat
	rate      *big.Rat
	date      time.Time
	dueDate   *time.Time
	payments  []moneyRow
}

// settleDocument: `settleDocument` TS — sisa, status, dan umur satu dokumen.
func settleDocument(in settleInput, asOf time.Time, loc *time.Location, rd *rounder) AgingDocument {
	totalBase := toBase(moneyRow{amount: in.total, currency: in.currency, rate: in.rate, base: in.totalBase})
	paidSum := new(big.Rat)
	for _, p := range in.payments {
		if b := toBase(p); b != nil {
			paidSum.Add(paidSum, b)
		}
	}
	paid := rd.cents(paidSum)
	doc := AgingDocument{
		Total:    Decimal{in.total},
		Currency: in.currency,
		PaidBase: paid,
		DueDate:  in.dueDate,
	}
	if totalBase != nil {
		doc.TotalBase = &Decimal{totalBase}
		out := rd.cents(subRat(totalBase, centsRat(paid)))
		if out < 0 {
			out = 0
		}
		doc.OutstandingBase = &out
	}
	doc.HalfCentTie = rd.tie
	doc.Status = deriveStatus(totalBase, paid, in.dueDate, asOf, loc)
	doc.AgeFromIssue = in.dueDate == nil
	from := in.date
	if in.dueDate != nil {
		from = *in.dueDate
	}
	doc.AgeDays = AgeInDays(from, asOf, loc)
	doc.Bucket = BucketFor(doc.AgeDays)
	return doc
}

// finishLedger: `finishLedger` + `summarizeAging` TS — buang yang lunas,
// saring jatuh tempo bila diminta, jumlahkan per ember.
func finishLedger(kind string, all []AgingDocument, asOf time.Time, overdueOnly bool) *AgingReport {
	rep := &AgingReport{Kind: kind, AsOf: asOf.UTC(), OverdueOnly: overdueOnly, Rows: []AgingDocument{}}
	sums := map[contract.AgingBucket]Cents{}
	for _, r := range all {
		if r.OutstandingBase != nil && *r.OutstandingBase <= 0 {
			continue // ≤ setengah sen, dan sisa sudah sen bulat
		}
		if overdueOnly && r.Status != contract.PaymentStatusOverdue {
			continue
		}
		rep.Rows = append(rep.Rows, r)
		if r.Status == contract.PaymentStatusOverdue {
			rep.OverdueCount++
		}
		if r.OutstandingBase == nil {
			rep.Unresolved++
			continue
		}
		sums[r.Bucket] += *r.OutstandingBase
		rep.Total += *r.OutstandingBase
	}
	for _, b := range contract.AgingBuckets {
		rep.Buckets = append(rep.Buckets, AgingBucketTotal{Bucket: b.Key, Amount: sums[b.Key]})
	}
	return rep
}

// NormalizeItemName: `normalizeItemName` TS — trim JS, huruf kecil, spasi
// beruntun (kelas `\s` JS) jadi satu spasi.
func NormalizeItemName(name string) string {
	t := strings.ToLower(jscompat.Trim(name))
	var b strings.Builder
	space := false
	for _, r := range t {
		if jscompat.IsWhitespace(r) {
			if !space {
				b.WriteRune(' ')
			}
			space = true
			continue
		}
		space = false
		b.WriteRune(r)
	}
	return b.String()
}

// ═══ PIUTANG ═════════════════════════════════════════════════════════════

type invoiceDoc struct {
	id         int64
	no         string
	date       time.Time
	due        *time.Time
	currency   string
	rate, base *big.Rat
	tax        *big.Rat
	party      string
	subtotal   *big.Rat // Σ kuantitas × harga
	settlement []moneyRow
}

type contractLine struct {
	name  string
	value *big.Rat // bags × kg/bag × harga/kg
}

type invoicedLine struct {
	name  string
	value *big.Rat // kuantitas × harga
}

type contractDoc struct {
	id         int64
	no         string
	date       time.Time
	due        *time.Time
	buyer      string
	currency   string
	rate, base *big.Rat
	lines      []contractLine
	invoiced   []invoicedLine
	payments   []moneyRow
}

// receivablesBook: dokumen piutang yang SUDAH dibaca — masukan fungsi murni
// buildReceivables, jadi aturannya teruji tanpa basis data.
type receivablesBook struct {
	invoices  []*invoiceDoc  // urutan tanggal ↓, id ↓
	contracts []*contractDoc // idem
}

// contractInvoicedValue: `buildContractOutstanding(...).totals.invoicedValue`
// sebagaimana `getReceivables` memanggilnya — baris TANPA itemId, jadi kunci
// penjodohannya NAMA yang dinormalkan: Σ per nama baris kontrak dari
// round2(Σ kuantitas × harga faktur bernama sama). Nama faktur yang tidak ada
// di kontrak tidak melunasi apa pun.
func contractInvoicedValue(c *contractDoc, rd *rounder) Cents {
	keys := map[string]bool{}
	for _, l := range c.lines {
		keys[NormalizeItemName(l.name)] = true
	}
	perKey := map[string]*big.Rat{}
	for _, l := range c.invoiced {
		k := NormalizeItemName(l.name)
		if !keys[k] {
			continue
		}
		if perKey[k] == nil {
			perKey[k] = new(big.Rat)
		}
		perKey[k].Add(perKey[k], l.value)
	}
	var total Cents
	for _, v := range perKey {
		total += rd.cents(v)
	}
	return total
}

func buildReceivables(b *receivablesBook, asOf time.Time, overdueOnly bool, loc *time.Location) *AgingReport {
	var rows []AgingDocument
	for _, inv := range b.invoices {
		total := addRat(inv.subtotal, inv.tax)
		if atMostHalfCent(total) {
			continue
		}
		doc := settleDocument(settleInput{
			total: total, currency: currencyOr(inv.currency), totalBase: inv.base, rate: inv.rate,
			date: inv.date, dueDate: inv.due, payments: inv.settlement,
		}, asOf, loc, &rounder{})
		doc.Kind, doc.ID, doc.DocumentNo, doc.PartyName, doc.Date = "invoice", inv.id, inv.no, inv.party, inv.date
		rows = append(rows, doc)
	}
	for _, c := range b.contracts {
		total := new(big.Rat)
		for _, l := range c.lines {
			total.Add(total, l.value)
		}
		if atMostHalfCent(total) {
			continue
		}
		rd := &rounder{}
		settlements := append([]moneyRow(nil), c.payments...)
		if iv := contractInvoicedValue(c, rd); iv > 0 {
			// Dipagu nilai kontrak sendiri; dinilai pada KURS kontrak (bukan
			// base_amount-nya) — persis `getReceivables`.
			settlements = append(settlements, moneyRow{
				amount: minRat(centsRat(iv), total), currency: currencyOr(c.currency), rate: c.rate,
			})
		}
		doc := settleDocument(settleInput{
			total: total, currency: currencyOr(c.currency), totalBase: c.base, rate: c.rate,
			date: c.date, dueDate: c.due, payments: settlements,
		}, asOf, loc, rd)
		doc.Kind, doc.ID, doc.DocumentNo, doc.PartyName, doc.Date = "contract", c.id, c.no, c.buyer, c.date
		rows = append(rows, doc)
	}
	return finishLedger("receivables", rows, asOf, overdueOnly)
}

// ═══ UTANG ═══════════════════════════════════════════════════════════════

type supplierTx struct {
	id          int64
	supplierID  int64
	supplier    string
	date        time.Time
	due         *time.Time
	kind        string // purchase | payment | …
	amount, tax *big.Rat
	currency    string
	rate, base  *big.Rat
	allocations []allocationRow // alokasi yang DIBUAT baris ini (pembayaran)
	settledBy   []moneyRow      // uang muka & retur yang melunasi baris ini (pembelian)
}

type allocationRow struct {
	purchaseID int64
	money      moneyRow
}

// recordedAllocation: `RecordedAllocation` TS — base nil = tanpa nilai IDR.
type recordedAllocation struct {
	purchaseID int64
	base       *big.Rat
}

type fifoPurchase struct {
	id   int64
	date time.Time
	base *big.Rat
}

type allocationResult struct {
	applied   map[int64]Cents
	estimated map[int64]bool
}

// allocatePayments: `allocatePayments` TS — alokasi TERCATAT dulu (dipagu
// nilai pembelian; kelebihannya kembali ke kolam), sisa kolam FIFO tertua
// dulu. Pembulatan sen di titik-titik `round2` yang sama.
func allocatePayments(purchases []fifoPurchase, recorded []recordedAllocation, pool Cents, rd *rounder) allocationResult {
	res := allocationResult{applied: map[int64]Cents{}, estimated: map[int64]bool{}}
	byID := map[int64]fifoPurchase{}
	for _, p := range purchases {
		res.applied[p.id] = 0
		byID[p.id] = p
	}

	for _, a := range recorded {
		p, ok := byID[a.purchaseID]
		if a.base == nil || !ok || p.base == nil {
			continue // tanpa nilai IDR: dihitung TS sebagai unrated, tidak dijumlah
		}
		already := res.applied[a.purchaseID]
		room := rd.cents(subRat(p.base, centsRat(already)))
		if room < 0 {
			room = 0
		}
		take := minRat(a.base, centsRat(room))
		res.applied[a.purchaseID] = rd.cents(addRat(centsRat(already), take))
		if a.base.Cmp(addRat(take, halfCent)) > 0 {
			pool = rd.cents(addRat(centsRat(pool), subRat(a.base, take)))
		}
	}

	ordered := append([]fifoPurchase(nil), purchases...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if !ordered[i].date.Equal(ordered[j].date) {
			return ordered[i].date.Before(ordered[j].date)
		}
		return ordered[i].id < ordered[j].id
	})
	remaining := pool
	for _, p := range ordered {
		if p.base == nil {
			continue
		}
		if remaining <= 0 {
			break
		}
		already := res.applied[p.id]
		room := rd.cents(subRat(p.base, centsRat(already)))
		if room <= 0 {
			continue
		}
		take := room
		if remaining < take {
			take = remaining
		}
		res.applied[p.id] = already + take
		res.estimated[p.id] = true
		remaining -= take
	}
	return res
}

func buildPayables(txs []*supplierTx, asOf time.Time, overdueOnly bool, loc *time.Location) *AgingReport {
	// Kelompok per pemasok, dalam urutan kemunculan pertama (Map TS).
	var order []int64
	groups := map[int64][]*supplierTx{}
	for _, t := range txs {
		if _, ok := groups[t.supplierID]; !ok {
			order = append(order, t.supplierID)
		}
		groups[t.supplierID] = append(groups[t.supplierID], t)
	}

	var rows []AgingDocument
	for _, sid := range order {
		var purchases, payments []*supplierTx
		for _, t := range groups[sid] {
			switch t.kind {
			case "purchase":
				purchases = append(purchases, t)
			case "payment":
				payments = append(payments, t)
			}
		}

		rd := &rounder{} // seri di tingkat pemasok menandai SETIAP barisnya
		var recorded []recordedAllocation
		var pool Cents
		for _, p := range payments {
			payBase := toBase(moneyRow{amount: p.amount, currency: p.currency, rate: p.rate, base: p.base})
			if payBase == nil {
				for _, a := range p.allocations {
					recorded = append(recorded, recordedAllocation{purchaseID: a.purchaseID})
				}
				continue
			}
			allocated := new(big.Rat)
			for _, a := range p.allocations {
				b := toBase(a.money)
				recorded = append(recorded, recordedAllocation{purchaseID: a.purchaseID, base: b})
				if b != nil {
					allocated.Add(allocated, b)
				}
			}
			if rem := rd.cents(subRat(payBase, allocated)); rem > 0 {
				pool += rem
			}
		}
		for _, p := range purchases {
			for _, s := range p.settledBy {
				recorded = append(recorded, recordedAllocation{purchaseID: p.id, base: toBase(s)})
			}
		}

		gross := func(p *supplierTx) moneyRow {
			return moneyRow{
				amount:   centsRat(roundCents(addRat(p.amount, p.tax))),
				currency: currencyOr(p.currency), rate: p.rate, base: p.base,
			}
		}
		fifo := make([]fifoPurchase, len(purchases))
		for i, p := range purchases {
			fifo[i] = fifoPurchase{id: p.id, date: p.date, base: toBase(gross(p))}
		}
		alloc := allocatePayments(fifo, recorded, pool, rd)
		start := len(rows)

		for _, p := range purchases {
			g := gross(p)
			if atMostHalfCent(g.amount) {
				continue
			}
			totalBase := toBase(g)
			applied := alloc.applied[p.id]
			doc := AgingDocument{
				Kind: "purchase", ID: p.id, DocumentNo: fmt.Sprintf(contract.PayablesDocumentNoFormat, p.id),
				PartyName: p.supplier, Date: p.date, DueDate: p.due,
				Total: Decimal{g.amount}, Currency: g.currency, PaidBase: applied,
				Status:              deriveStatus(totalBase, applied, p.due, asOf, loc),
				AgeFromIssue:        p.due == nil,
				AllocationEstimated: alloc.estimated[p.id],
			}
			if totalBase != nil {
				doc.TotalBase = &Decimal{totalBase}
				out := rd.cents(subRat(totalBase, centsRat(applied)))
				if out < 0 {
					out = 0
				}
				doc.OutstandingBase = &out
			}
			from := p.date
			if p.due != nil {
				from = *p.due
			}
			doc.AgeDays = AgeInDays(from, asOf, loc)
			doc.Bucket = BucketFor(doc.AgeDays)
			rows = append(rows, doc)
		}
		for i := start; i < len(rows); i++ {
			rows[i].HalfCentTie = rd.tie
		}
	}
	// `rows.sort((a, b) => b.date - a.date)` — STABIL, seperti sort JS.
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Date.After(rows[j].Date) })
	return finishLedger("payables", rows, asOf, overdueOnly)
}

// ═══ PEMBACAAN ═══════════════════════════════════════════════════════════
//
// Semua kueri satu laporan di dalam SATU transaksi READ ONLY + REPEATABLE
// READ. Batas tanggal dikirim sebagai teks UTC yang di-cast `::timestamp`
// (lihat `trialBalanceSQL`); NUMERIC dibaca sebagai teks dan diurai eksak.

// scanMoney mengurai empat kolom teks uang (amount wajib, sisanya boleh NULL).
func scanMoney(amount string, currency string, rate, base *string) (moneyRow, error) {
	a, err := parseRat(amount)
	if err != nil {
		return moneyRow{}, err
	}
	r, err := parseRatPtr(rate)
	if err != nil {
		return moneyRow{}, err
	}
	b, err := parseRatPtr(base)
	if err != nil {
		return moneyRow{}, err
	}
	return moneyRow{amount: a, currency: currency, rate: r, base: b}, nil
}

// eachRow menjalankan satu kueri dan memanggil fn per baris.
func eachRow(ctx context.Context, tx pgx.Tx, label, sql string, args []any, fn func(pgx.Rows) error) error {
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("kueri %s: %w", label, err)
	}
	defer rows.Close()
	for rows.Next() {
		if err := fn(rows); err != nil {
			return fmt.Errorf("baca %s: %w", label, err)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("kueri %s: %w", label, err)
	}
	return nil
}

// Faktur & kontrak yang dibatalkan BUKAN piutang. Retur yang dibatalkan tidak
// melunasi apa pun — status retur (`posted` / `canceled`) belum dikontrakkan,
// jadi nilainya ditulis di SQL, persis seperti di `receivables.ts`.
//
// Setiap kueri piutang memakai dua parameter: $1 batas tanggal, $2 status
// "dibatalkan" dari kontrak (`invoice_statuses` / `contract_statuses`).
const (
	invoiceFilter  = `i.status <> $2 AND i.date <= $1::timestamp`
	contractFilter = `c.status <> $2 AND c.date <= $1::timestamp`
)

func (r *Reader) loadReceivables(ctx context.Context, tx pgx.Tx, asOfText string) (*receivablesBook, error) {
	args := []any{asOfText, string(contract.InvoiceStatusCanceled)}
	conArgs := []any{asOfText, string(contract.ContractStatusCanceled)}
	book := &receivablesBook{}
	invByID := map[int64]*invoiceDoc{}

	err := eachRow(ctx, tx, "faktur", `
SELECT i.id, i.invoice_no, i.date, i.due_date, i.currency, i.rate::text, i.base_amount::text,
       i.tax_amount::text, c.name,
       COALESCE((SELECT SUM(ii.quantity * ii.price) FROM invoice_items ii WHERE ii.invoice_id = i.id), 0)::text
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
 WHERE `+invoiceFilter+`
 ORDER BY i.date DESC, i.id DESC`, args, func(rows pgx.Rows) error {
		d := &invoiceDoc{}
		var rate, base, party *string
		var tax, subtotal string
		if err := rows.Scan(&d.id, &d.no, &d.date, &d.due, &d.currency, &rate, &base, &tax, &party, &subtotal); err != nil {
			return err
		}
		var err error
		if d.rate, err = parseRatPtr(rate); err != nil {
			return err
		}
		if d.base, err = parseRatPtr(base); err != nil {
			return err
		}
		if d.tax, err = parseRat(tax); err != nil {
			return err
		}
		if d.subtotal, err = parseRat(subtotal); err != nil {
			return err
		}
		d.party = contract.ReceivablesNoCustomer
		if party != nil {
			d.party = *party
		}
		book.invoices = append(book.invoices, d)
		invByID[d.id] = d
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Pelunasan faktur: pembayaran, uang muka yang dikompensasikan (#26), dan
	// retur penjualan yang tidak dibatalkan (#27, senilai subtotal + pajak).
	settle := func(label, sql string) error {
		return eachRow(ctx, tx, label, sql, args, func(rows pgx.Rows) error {
			var id int64
			var amount, currency string
			var rate, base *string
			if err := rows.Scan(&id, &amount, &currency, &rate, &base); err != nil {
				return err
			}
			m, err := scanMoney(amount, currency, rate, base)
			if err != nil {
				return err
			}
			if d := invByID[id]; d != nil {
				d.settlement = append(d.settlement, m)
			}
			return nil
		})
	}
	if err := settle("pembayaran faktur", `
SELECT p.invoice_id, p.amount::text, p.currency, p.rate::text, p.base_amount::text
  FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
 WHERE `+invoiceFilter+` AND p.date <= $1::timestamp
 ORDER BY p.id`); err != nil {
		return nil, err
	}
	if err := settle("uang muka faktur", `
SELECT a.invoice_id, a.amount::text, a.currency, a.rate::text, a.base_amount::text
  FROM advance_applications a JOIN invoices i ON i.id = a.invoice_id
 WHERE `+invoiceFilter+` AND a.date <= $1::timestamp
 ORDER BY a.id`); err != nil {
		return nil, err
	}
	if err := settle("retur penjualan", `
SELECT r.invoice_id, (r.subtotal + r.tax_amount)::text, r.currency, r.rate::text, r.base_amount::text
  FROM sales_returns r JOIN invoices i ON i.id = r.invoice_id
 WHERE `+invoiceFilter+` AND r.status <> 'canceled' AND r.date <= $1::timestamp
 ORDER BY r.id`); err != nil {
		return nil, err
	}

	conByID := map[int64]*contractDoc{}
	err = eachRow(ctx, tx, "kontrak", `
SELECT c.id, c.contract_no, c.date, c.due_date, c.buyer, c.currency, c.rate::text, c.base_amount::text
  FROM contracts c
 WHERE `+contractFilter+`
 ORDER BY c.date DESC, c.id DESC`, conArgs, func(rows pgx.Rows) error {
		d := &contractDoc{}
		var rate, base *string
		if err := rows.Scan(&d.id, &d.no, &d.date, &d.due, &d.buyer, &d.currency, &rate, &base); err != nil {
			return err
		}
		var err error
		if d.rate, err = parseRatPtr(rate); err != nil {
			return err
		}
		if d.base, err = parseRatPtr(base); err != nil {
			return err
		}
		book.contracts = append(book.contracts, d)
		conByID[d.id] = d
		return nil
	})
	if err != nil {
		return nil, err
	}

	err = eachRow(ctx, tx, "baris kontrak", `
SELECT ci.contract_id, ci.item_name, (ci.bags * ci.kg_per_bag * ci.price_per_kg)::text
  FROM contract_items ci JOIN contracts c ON c.id = ci.contract_id
 WHERE `+contractFilter+`
 ORDER BY ci.id`, conArgs, func(rows pgx.Rows) error {
		var id int64
		var name, value string
		if err := rows.Scan(&id, &name, &value); err != nil {
			return err
		}
		v, err := parseRat(value)
		if err != nil {
			return err
		}
		if d := conByID[id]; d != nil {
			d.lines = append(d.lines, contractLine{name: name, value: v})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	err = eachRow(ctx, tx, "pembayaran kontrak", `
SELECT p.contract_id, p.amount::text, p.currency, p.rate::text, p.base_amount::text
  FROM contract_payments p JOIN contracts c ON c.id = p.contract_id
 WHERE `+contractFilter+` AND p.date <= $1::timestamp
 ORDER BY p.id`, conArgs, func(rows pgx.Rows) error {
		var id int64
		var amount, currency string
		var rate, base *string
		if err := rows.Scan(&id, &amount, &currency, &rate, &base); err != nil {
			return err
		}
		m, err := scanMoney(amount, currency, rate, base)
		if err != nil {
			return err
		}
		if d := conByID[id]; d != nil {
			d.payments = append(d.payments, m)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Faktur "tarikan" kontrak (#15): faktur yang tidak dibatalkan dan sudah
	// terbit per asOf — sama dengan `invoices: { where: … }` di TS.
	err = eachRow(ctx, tx, "faktur tarikan kontrak", `
SELECT i.contract_id, ii.item_name, (ii.quantity * ii.price)::text
  FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id
 WHERE `+invoiceFilter+` AND i.contract_id IS NOT NULL
 ORDER BY ii.id`, args, func(rows pgx.Rows) error {
		var id int64
		var name, value string
		if err := rows.Scan(&id, &name, &value); err != nil {
			return err
		}
		v, err := parseRat(value)
		if err != nil {
			return err
		}
		if d := conByID[id]; d != nil {
			d.invoiced = append(d.invoiced, invoicedLine{name: name, value: v})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return book, nil
}

func (r *Reader) loadPayables(ctx context.Context, tx pgx.Tx, asOfText string) ([]*supplierTx, error) {
	args := []any{asOfText}
	var txs []*supplierTx
	byID := map[int64]*supplierTx{}
	err := eachRow(ctx, tx, "transaksi pemasok", `
SELECT t.id, t.supplier_id, s.name, t.date, t.due_date, t.type, t.amount::text, t.tax_amount::text,
       t.currency, t.rate::text, t.base_amount::text
  FROM supplier_transactions t JOIN suppliers s ON s.id = t.supplier_id
 WHERE t.date <= $1::timestamp
 ORDER BY t.date DESC, t.id DESC`, args, func(rows pgx.Rows) error {
		t := &supplierTx{}
		var amount, tax string
		var rate, base *string
		if err := rows.Scan(&t.id, &t.supplierID, &t.supplier, &t.date, &t.due, &t.kind, &amount, &tax,
			&t.currency, &rate, &base); err != nil {
			return err
		}
		m, err := scanMoney(amount, t.currency, rate, base)
		if err != nil {
			return err
		}
		t.amount, t.rate, t.base = m.amount, m.rate, m.base
		if t.tax, err = parseRat(tax); err != nil {
			return err
		}
		txs = append(txs, t)
		byID[t.id] = t
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Alokasi yang DIBUAT pembayaran (migrasi 0009) — tanpa tanggal sendiri;
	// pembayarannya yang dibatasi asOf.
	err = eachRow(ctx, tx, "alokasi pembayaran pemasok", `
SELECT a.payment_id, a.purchase_id, a.amount::text, a.currency, a.rate::text, a.base_amount::text
  FROM supplier_payment_allocations a JOIN supplier_transactions p ON p.id = a.payment_id
 WHERE p.date <= $1::timestamp
 ORDER BY a.id`, args, func(rows pgx.Rows) error {
		var paymentID, purchaseID int64
		var amount, currency string
		var rate, base *string
		if err := rows.Scan(&paymentID, &purchaseID, &amount, &currency, &rate, &base); err != nil {
			return err
		}
		m, err := scanMoney(amount, currency, rate, base)
		if err != nil {
			return err
		}
		if t := byID[paymentID]; t != nil {
			t.allocations = append(t.allocations, allocationRow{purchaseID: purchaseID, money: m})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Uang muka pembelian yang dikompensasikan (#26), lalu retur pembelian
	// yang tidak dibatalkan (#27) — urutan yang sama dengan TS.
	settle := func(label, sql string) error {
		return eachRow(ctx, tx, label, sql, args, func(rows pgx.Rows) error {
			var id int64
			var amount, currency string
			var rate, base *string
			if err := rows.Scan(&id, &amount, &currency, &rate, &base); err != nil {
				return err
			}
			m, err := scanMoney(amount, currency, rate, base)
			if err != nil {
				return err
			}
			if t := byID[id]; t != nil {
				t.settledBy = append(t.settledBy, m)
			}
			return nil
		})
	}
	if err := settle("uang muka pembelian", `
SELECT a.purchase_id, a.amount::text, a.currency, a.rate::text, a.base_amount::text
  FROM advance_applications a JOIN supplier_transactions t ON t.id = a.purchase_id
 WHERE t.date <= $1::timestamp AND a.date <= $1::timestamp
 ORDER BY a.purchase_id, a.id`); err != nil {
		return nil, err
	}
	if err := settle("retur pembelian", `
SELECT r.purchase_id, (r.subtotal + r.tax_amount)::text, r.currency, r.rate::text, r.base_amount::text
  FROM purchase_returns r JOIN supplier_transactions t ON t.id = r.purchase_id
 WHERE t.date <= $1::timestamp AND r.status <> 'canceled' AND r.date <= $1::timestamp
 ORDER BY r.purchase_id, r.id`); err != nil {
		return nil, err
	}
	return txs, nil
}

// Receivables: Umur Piutang per asOf (INKLUSIF), dalam satu transaksi baca.
// overdueOnly = `?overdue=1` halaman (hanya dokumen jatuh tempo).
func (r *Reader) Receivables(ctx context.Context, asOf time.Time, overdueOnly bool) (*AgingReport, error) {
	loc, err := BusinessLocation()
	if err != nil {
		return nil, err
	}
	var book *receivablesBook
	err = r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		book, err = r.loadReceivables(ctx, tx, asOf.UTC().Format(timestampLayout))
		return err
	})
	if err != nil {
		return nil, err
	}
	return buildReceivables(book, asOf, overdueOnly, loc), nil
}

// Payables: Umur Utang per asOf (INKLUSIF), dalam satu transaksi baca.
func (r *Reader) Payables(ctx context.Context, asOf time.Time, overdueOnly bool) (*AgingReport, error) {
	loc, err := BusinessLocation()
	if err != nil {
		return nil, err
	}
	var txs []*supplierTx
	err = r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		txs, err = r.loadPayables(ctx, tx, asOf.UTC().Format(timestampLayout))
		return err
	})
	if err != nil {
		return nil, err
	}
	return buildPayables(txs, asOf, overdueOnly, loc), nil
}
