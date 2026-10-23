package ledgerread

import (
	"context"
	"fmt"
	"math/big"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ══ REKAP PER PIHAK — PADANAN `getSalesByCustomer` / `getPurchasesBySupplier` ═
//
// "Penjualan per Pelanggan" & "Pembelian per Pemasok" (`src/lib/party-recap.ts`)
// — laporan tahap 1d yang membaca DOKUMEN sumber, bukan baris jurnal. Aturannya
// DISALIN, bukan dirancang ulang; `bun run parity:sales-by-customer` dan
// `parity:purchases-by-supplier` membandingkan keduanya baris demi baris:
//
//  1. Periode = rentang TANGGAL DOKUMEN [from, to], keduanya INKLUSIF (instan
//     yang dihitung penerbit TS, `resolvePeriod`).
//  2. Penjualan: faktur yang TIDAK dibatalkan (`contract.InvoiceStatusCanceled`),
//     nilai kotor = Σ(kuantitas × harga) + PPN dalam mata uangnya sendiri;
//     retur penjualan yang tidak dibatalkan, nilai = subtotal + PPN.
//     Pembelian: SEMUA baris `supplier_transactions` bertipe `purchase` (tanpa
//     saringan status — TS tidak menyaringnya), nilai = amount + PPN; retur
//     pembelian yang tidak dibatalkan, pemasoknya jatuh ke pemasok pembelian
//     asalnya bila kolomnya sendiri kosong.
//  3. Setiap nilai dalam rupiah DASAR lewat `toBase` (aging.go): `base_amount`
//     tersimpan, lalu IDR 1:1, lalu amount × rate. Dokumen valas TANPA kurs
//     tidak punya nilai IDR: tidak dijumlahkan, dihitung di `UnratedCount`.
//  4. Dikelompokkan per id pihak; dokumen tanpa pihak (faktur lama) satu
//     kelompok ber-nama nil — lembar sebarnya yang memberi nama.
//  5. Per kelompok: kotor, retur, dan bersih (kotor − retur) dibulatkan ke sen
//     di titik `round2` TS — atas nilai EKSAK (rasional), bukan float.
//  6. Urutan: bersih menurun, lalu nama (`localeCompare`, nil = "").
//  7. Total: jumlah baris yang SUDAH dibulatkan.
//
// Bedanya satu, disengaja (sama dengan Umur Piutang/Utang): TS menjumlahkan
// float dulu baru membulatkan; Go menjumlahkan rasional eksak. Hasilnya hanya
// bisa berbeda pada nilai yang TEPAT setengah sen di titik pembulatan — temuan
// tentang float TS, bukan tentang aturan.

// PartyRecapRow: satu pihak — `PartyRecapRow` TS.
type PartyRecapRow struct {
	PartyID *int64 `json:"partyId"`
	// PartyName nil = kelompok "tanpa pihak tercatat".
	PartyName    *string `json:"partyName"`
	DocCount     int     `json:"docCount"`
	GrossBase    Cents   `json:"grossBase"`
	ReturnCount  int     `json:"returnCount"`
	ReturnBase   Cents   `json:"returnBase"`
	NetBase      Cents   `json:"netBase"`
	UnratedCount int     `json:"unratedCount"`
}

// PartyRecapTotals: kaki laporan — `PartyRecapResult.totals` TS.
type PartyRecapTotals struct {
	DocCount     int   `json:"docCount"`
	GrossBase    Cents `json:"grossBase"`
	ReturnCount  int   `json:"returnCount"`
	ReturnBase   Cents `json:"returnBase"`
	NetBase      Cents `json:"netBase"`
	UnratedCount int   `json:"unratedCount"`
}

// PartyRecap: hasil satu rekap — `PartyRecapResult` TS, ditambah periodenya.
type PartyRecap struct {
	Kind   string           `json:"kind"`
	From   time.Time        `json:"from"`
	To     time.Time        `json:"to"`
	Rows   []PartyRecapRow  `json:"rows"`
	Totals PartyRecapTotals `json:"totals"`
}

// PartyDoc: satu dokumen (atau retur) yang sudah diringkas ke pihak + nilai
// IDR-nya — `PartyDoc` TS. GrossBase nil = valas tanpa kurs.
type PartyDoc struct {
	PartyID   *int64
	PartyName *string
	GrossBase *big.Rat
}

// SummarizeParties: `summarizeParties` TS — MURNI, diuji tanpa basis data.
func SummarizeParties(kind string, docs, returns []PartyDoc) *PartyRecap {
	type acc struct {
		id                     *int64
		name                   *string
		docs, returns, unrated int
		gross, ret             *big.Rat
	}
	byParty := map[string]*acc{}
	var order []string
	entry := func(d PartyDoc) *acc {
		k := "none"
		if d.PartyID != nil {
			k = fmt.Sprintf("p%d", *d.PartyID)
		}
		a := byParty[k]
		if a == nil {
			a = &acc{id: d.PartyID, name: d.PartyName, gross: new(big.Rat), ret: new(big.Rat)}
			byParty[k] = a
			order = append(order, k)
		}
		// Baris lama bisa kehilangan nama di satu dokumen tetapi membawanya di
		// dokumen lain — sama dengan TS.
		if a.name == nil && d.PartyName != nil {
			a.name = d.PartyName
		}
		return a
	}
	for _, d := range docs {
		a := entry(d)
		a.docs++
		if d.GrossBase == nil {
			a.unrated++
		} else {
			a.gross.Add(a.gross, d.GrossBase)
		}
	}
	for _, r := range returns {
		a := entry(r)
		a.returns++
		if r.GrossBase == nil {
			a.unrated++
		} else {
			a.ret.Add(a.ret, r.GrossBase)
		}
	}

	rep := &PartyRecap{Kind: kind, Rows: []PartyRecapRow{}}
	for _, k := range order {
		a := byParty[k]
		rep.Rows = append(rep.Rows, PartyRecapRow{
			PartyID:      a.id,
			PartyName:    a.name,
			DocCount:     a.docs,
			GrossBase:    roundCents(a.gross),
			ReturnCount:  a.returns,
			ReturnBase:   roundCents(a.ret),
			NetBase:      roundCents(subRat(a.gross, a.ret)),
			UnratedCount: a.unrated,
		})
	}
	name := func(r PartyRecapRow) string {
		if r.PartyName == nil {
			return ""
		}
		return *r.PartyName
	}
	// Stabil, seperti `Array.prototype.sort`: dua pihak yang bersih DAN namanya
	// sama tetap dalam urutan pertemuannya.
	sort.SliceStable(rep.Rows, func(i, j int) bool {
		a, b := rep.Rows[i], rep.Rows[j]
		if a.NetBase != b.NetBase {
			return a.NetBase > b.NetBase
		}
		return jscompat.LocaleCompare(name(a), name(b)) < 0
	})
	for _, r := range rep.Rows {
		rep.Totals.DocCount += r.DocCount
		rep.Totals.GrossBase += r.GrossBase
		rep.Totals.ReturnCount += r.ReturnCount
		rep.Totals.ReturnBase += r.ReturnBase
		rep.Totals.NetBase += r.NetBase
		rep.Totals.UnratedCount += r.UnratedCount
	}
	return rep
}

// ═══ PEMBACAAN ═══════════════════════════════════════════════════════════
//
// Kedua kueri satu rekap di dalam SATU transaksi READ ONLY + REPEATABLE READ.
// $1/$2 = batas periode (teks UTC `::timestamp`, lihat `trialBalanceSQL`).
// Urutan baris tidak bermakna bagi hasil (pengelompokan per id, lalu diurutkan),
// tetapi `ORDER BY id` membuat urutan pertemuan — dan karena itu seri yang
// sempurna — deterministik.

const salesInvoicesSQL = `
SELECT i.customer_id, c.name, i.currency, i.rate::text, i.base_amount::text,
       (COALESCE((SELECT SUM(ii.quantity * ii.price) FROM invoice_items ii WHERE ii.invoice_id = i.id), 0)
        + i.tax_amount)::text
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
 WHERE i.date >= $1::timestamp AND i.date <= $2::timestamp AND i.status <> $3
 ORDER BY i.id`

// Status retur (`posted` / `canceled`) belum dikontrakkan — nilainya ditulis
// di SQL, persis seperti `party-recap.ts` (dan `aging.go`).
const salesReturnsSQL = `
SELECT r.customer_id, c.name, r.currency, r.rate::text, r.base_amount::text,
       (r.subtotal + r.tax_amount)::text
  FROM sales_returns r
  LEFT JOIN customers c ON c.id = r.customer_id
 WHERE r.date >= $1::timestamp AND r.date <= $2::timestamp AND r.status <> 'canceled'
 ORDER BY r.id`

// Tipe `purchase` belum dikontrakkan (kolom `type` supplier_transactions:
// purchase | payment) — ditulis di SQL seperti `aging.go`.
const purchasesSQL = `
SELECT t.supplier_id, s.name, t.currency, t.rate::text, t.base_amount::text,
       (t.amount + t.tax_amount)::text
  FROM supplier_transactions t
  JOIN suppliers s ON s.id = t.supplier_id
 WHERE t.type = 'purchase' AND t.date >= $1::timestamp AND t.date <= $2::timestamp
 ORDER BY t.id`

const purchaseReturnsSQL = `
SELECT COALESCE(r.supplier_id, p.supplier_id), COALESCE(rs.name, ps.name),
       r.currency, r.rate::text, r.base_amount::text, (r.subtotal + r.tax_amount)::text
  FROM purchase_returns r
  JOIN supplier_transactions p ON p.id = r.purchase_id
  JOIN suppliers ps ON ps.id = p.supplier_id
  LEFT JOIN suppliers rs ON rs.id = r.supplier_id
 WHERE r.date >= $1::timestamp AND r.date <= $2::timestamp AND r.status <> 'canceled'
 ORDER BY r.id`

// scanPartyDocs: id pihak, nama, lalu empat kolom uang (amount wajib).
func scanPartyDocs(ctx context.Context, tx pgx.Tx, label, sql string, args []any) ([]PartyDoc, error) {
	var out []PartyDoc
	err := eachRow(ctx, tx, label, sql, args, func(rows pgx.Rows) error {
		var d PartyDoc
		var currency, amount string
		var rate, base *string
		if err := rows.Scan(&d.PartyID, &d.PartyName, &currency, &rate, &base, &amount); err != nil {
			return err
		}
		m, err := scanMoney(amount, currency, rate, base)
		if err != nil {
			return err
		}
		d.GrossBase = toBase(m)
		out = append(out, d)
		return nil
	})
	return out, err
}

// PartyRecap: rekap `sales-by-customer` atau `purchases-by-supplier` untuk
// [from, to] (keduanya INKLUSIF), dalam satu transaksi baca.
func (r *Reader) PartyRecap(ctx context.Context, kind string, from, to time.Time) (*PartyRecap, error) {
	var docSQL, retSQL string
	args := []any{from.UTC().Format(timestampLayout), to.UTC().Format(timestampLayout)}
	docArgs := args
	switch kind {
	case contract.ReportSalesByCustomer:
		docSQL, retSQL = salesInvoicesSQL, salesReturnsSQL
		docArgs = append(append([]any(nil), args...), string(contract.InvoiceStatusCanceled))
	case contract.ReportPurchasesBySupplier:
		docSQL, retSQL = purchasesSQL, purchaseReturnsSQL
	default:
		return nil, fmt.Errorf("rekap pihak %q tidak dikenal", kind)
	}
	var docs, returns []PartyDoc
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		if docs, err = scanPartyDocs(ctx, tx, "dokumen "+kind, docSQL, docArgs); err != nil {
			return err
		}
		returns, err = scanPartyDocs(ctx, tx, "retur "+kind, retSQL, args)
		return err
	})
	if err != nil {
		return nil, err
	}
	rep := SummarizeParties(kind, docs, returns)
	rep.From, rep.To = from.UTC(), to.UTC()
	return rep, nil
}
