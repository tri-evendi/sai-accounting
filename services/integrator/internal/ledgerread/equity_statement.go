package ledgerread

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ LAPORAN PERUBAHAN EKUITAS — PADANAN `getEquityStatement` +
// `buildEquityStatement` (`src/lib/reports.ts`, `src/lib/equity-statement.ts`) ══
//
// Laporan KELIMA tahap 1d. Aturannya DISALIN; `bun run parity:equity-changes`
// membandingkan keduanya atas buku sungguhan:
//
//  1. Saldo AWAL dan AKHIR diturunkan dari Neraca (`BuildBalanceSheet`) pada
//     `from − 1 ms` dan `to` — bukan dari kueri ekuitas sendiri. Itu yang
//     membuat rekonsiliasinya sifat konstruksi, di kedua bahasa.
//  2. Komponen = akun bertipe `equity` (`contract.AccountTypeEquity`), urutan
//     `ORDER BY code`. Saldo awal = jumlah baris ekuitas Neraca awal untuk
//     kode itu (tanda akuntansi: kredit positif), 0 bila tak tercantum.
//  3. Mutasi periode per akun ekuitas atas jurnal [from, to] (INKLUSIF),
//     TERMASUK jurnal penutup: penambahan = kredit, pengurangan = debit —
//     setoran dan prive tidak saling meniadakan.
//  4. Komponen yang awal, tambah, DAN kurang-nya nol dilewati.
//  5. Laba yang BELUM ditutup = komponen tanpa akun: awal/akhir = `netIncome`
//     Neraca di kedua ujung; pergerakannya DITURUNKAN (akhir − awal).
//  6. Total awal/akhir = komponen + laba belum ditutup.
//
// TS membulatkan setiap besaran ke sen (`round2`) atas float; Go sudah sen.

// EquityComponent: satu akun ekuitas sepanjang periode (tanda akuntansi).
type EquityComponent struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	Opening    Cents  `json:"opening"`
	Additions  Cents  `json:"additions"`
	Reductions Cents  `json:"reductions"`
	Closing    Cents  `json:"closing"`
}

// EquityUnclosedIncome: laba belum ditutup sebagai komponen tanpa akun.
type EquityUnclosedIncome struct {
	Opening  Cents `json:"opening"`
	Movement Cents `json:"movement"`
	Closing  Cents `json:"closing"`
}

// EquityStatement: bentuk `EquityStatement` TS.
type EquityStatement struct {
	From           time.Time            `json:"from"`
	To             time.Time            `json:"to"`
	Components     []EquityComponent    `json:"components"`
	UnclosedIncome EquityUnclosedIncome `json:"unclosedIncome"`
	TotalOpening   Cents                `json:"totalOpening"`
	TotalClosing   Cents                `json:"totalClosing"`
	// UnknownTypes: akun bergerak bertipe di luar kontrak di salah satu ujung
	// Neraca — tidak masuk ekuitas maupun laba (seperti TS), dicatat supaya
	// terlihat.
	UnknownTypes []string `json:"unknownTypes"`
}

// EquityStatement menghitung Laporan Perubahan Ekuitas [from, to] (keduanya
// INKLUSIF) di dalam SATU transaksi baca.
func (r *Reader) EquityStatement(ctx context.Context, from, to time.Time) (*EquityStatement, error) {
	before := from.Add(-time.Millisecond) // `new Date(from.getTime() - 1)`
	var atOpening, atClosing, period []accountSums
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		if atOpening, err = r.nets(ctx, tx, netsFilter{to: &before}); err != nil {
			return err
		}
		if atClosing, err = r.nets(ctx, tx, netsFilter{to: &to}); err != nil {
			return err
		}
		period, err = r.nets(ctx, tx, netsFilter{from: &from, to: &to})
		return err
	})
	if err != nil {
		return nil, err
	}
	es := BuildEquityStatement(atOpening, atClosing, period)
	es.From, es.To = from.UTC(), to.UTC()
	return es, nil
}

// BuildEquityStatement menerapkan aturan di atas atas tiga jumlah per akun
// (semua akun, urutan kode): sampai sebelum periode, sampai akhir periode,
// dan di dalam periode. MURNI.
func BuildEquityStatement(atOpening, atClosing, period []accountSums) *EquityStatement {
	// Pecahan #555 tidak dibaca laporan ini — hanya ekuitas & netIncome.
	awal := BuildBalanceSheet(atOpening, nil, false)
	akhir := BuildBalanceSheet(atClosing, nil, false)

	es := &EquityStatement{Components: []EquityComponent{}, UnknownTypes: []string{}}
	openingByCode := map[string]Cents{}
	for _, l := range awal.Equity {
		openingByCode[l.Code] = l.Amount
	}
	for _, a := range period {
		if a.accountType != string(contract.AccountTypeEquity) {
			continue
		}
		c := EquityComponent{
			Code: a.code, Name: a.name,
			Opening:    openingByCode[a.code],
			Additions:  a.credit,
			Reductions: a.debit,
		}
		c.Closing = c.Opening + c.Additions - c.Reductions
		if c.Opening == 0 && c.Additions == 0 && c.Reductions == 0 {
			continue
		}
		es.Components = append(es.Components, c)
		es.TotalOpening += c.Opening
		es.TotalClosing += c.Closing
	}
	es.UnclosedIncome = EquityUnclosedIncome{
		Opening:  awal.NetIncome,
		Movement: akhir.NetIncome - awal.NetIncome,
		Closing:  akhir.NetIncome,
	}
	es.TotalOpening += es.UnclosedIncome.Opening
	es.TotalClosing += es.UnclosedIncome.Closing

	seen := map[string]bool{}
	for _, code := range append(append([]string{}, awal.UnknownTypes...), akhir.UnknownTypes...) {
		if !seen[code] {
			seen[code] = true
			es.UnknownTypes = append(es.UnknownTypes, code)
		}
	}
	return es
}
