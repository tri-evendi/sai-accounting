package ledgerread

import (
	"context"
	"fmt"
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

// EquityPartner: satu pemilik/sekutu (bentuk usaha, 24 Okt 2026) — padanan
// `EquityPartnerRow` TS. Angka GABUNGAN akun Modal + Prive miliknya, tanda
// akuntansi:
//
//	modal akhir = modal awal + bagian laba + setoran − prive
//
// `ProfitShare` = mutasi bersih jurnal PENUTUP (`contract.ClosingJournalType`)
// atas gabungan Modal+Prive — penutupan prive (D Modal, K Prive) saling
// meniadakan di gabungannya, jadi sisanya tepat bagian laba. `Contributions`
// / `Drawings` = kredit / debit jurnal BUKAN penutup. Pemilik yang keempat
// besarannya nol dilewati (aturan komponen).
type EquityPartner struct {
	Name          string  `json:"name"`
	Role          *string `json:"role"`
	ShareBp       int     `json:"shareBp"`
	IsActive      bool    `json:"isActive"`
	Opening       Cents   `json:"opening"`
	ProfitShare   Cents   `json:"profitShare"`
	Contributions Cents   `json:"contributions"`
	Drawings      Cents   `json:"drawings"`
	Closing       Cents   `json:"closing"`
}

// EquityPartnerRef: satu baris `company_partners` beserta KODE akun Modal &
// Prive-nya (urutan `sort_order, id`). DrawingCode kosong = tanpa akun prive.
type EquityPartnerRef struct {
	Name        string
	Role        *string
	ShareBp     int
	IsActive    bool
	CapitalCode string
	DrawingCode string
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
	// Partners: rincian per pemilik/sekutu — RINGKASAN atas akun Modal &
	// Prive yang sudah ada di Components, tidak ikut total. `omitempty`: buku
	// PT tidak punya baris, dan keluarannya (termasuk berkas emas) tetap
	// persis seperti sebelum bentuk usaha.
	Partners []EquityPartner `json:"partners,omitempty"`
}

// partnersSQL: pemilik/sekutu + kode akun Modal & Prive-nya, urutan TS
// (`orderBy: [{ sortOrder: "asc" }, { id: "asc" }]`).
const partnersSQL = `
SELECT p.name, p.role, p.share_bp, p.is_active, c.code, COALESCE(d.code, '')
  FROM company_partners p
  JOIN accounts c ON c.id = p.capital_account_id
  LEFT JOIN accounts d ON d.id = p.drawing_account_id
 ORDER BY p.sort_order, p.id`

func (r *Reader) partners(ctx context.Context, tx pgx.Tx) ([]EquityPartnerRef, error) {
	rows, err := tx.Query(ctx, partnersSQL)
	if err != nil {
		return nil, fmt.Errorf("kueri pemilik/sekutu: %w", err)
	}
	defer rows.Close()
	var out []EquityPartnerRef
	for rows.Next() {
		var p EquityPartnerRef
		if err := rows.Scan(&p.Name, &p.Role, &p.ShareBp, &p.IsActive, &p.CapitalCode, &p.DrawingCode); err != nil {
			return nil, fmt.Errorf("baca pemilik/sekutu: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// EquityStatement menghitung Laporan Perubahan Ekuitas [from, to] (keduanya
// INKLUSIF) di dalam SATU transaksi baca.
func (r *Reader) EquityStatement(ctx context.Context, from, to time.Time) (*EquityStatement, error) {
	before := from.Add(-time.Millisecond) // `new Date(from.getTime() - 1)`
	var atOpening, atClosing, period, periodNonClosing []accountSums
	var partners []EquityPartnerRef
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		if atOpening, err = r.nets(ctx, tx, netsFilter{to: &before}); err != nil {
			return err
		}
		if atClosing, err = r.nets(ctx, tx, netsFilter{to: &to}); err != nil {
			return err
		}
		if period, err = r.nets(ctx, tx, netsFilter{from: &from, to: &to}); err != nil {
			return err
		}
		if partners, err = r.partners(ctx, tx); err != nil {
			return err
		}
		// Mutasi BUKAN-penutup hanya bila ada pemilik/sekutu — buku PT tidak
		// menjalankan kueri tambahan apa pun (sama dengan TS).
		if len(partners) > 0 {
			periodNonClosing, err = r.nets(ctx, tx, netsFilter{from: &from, to: &to, excludeClosing: true})
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	es := BuildEquityStatement(atOpening, atClosing, period, periodNonClosing, partners)
	es.From, es.To = from.UTC(), to.UTC()
	return es, nil
}

// BuildEquityStatement menerapkan aturan di atas atas tiga jumlah per akun
// (semua akun, urutan kode): sampai sebelum periode, sampai akhir periode,
// dan di dalam periode. MURNI.
//
// periodNonClosing (jumlah per akun di dalam periode TANPA jurnal penutup) dan
// partners hanya dibaca untuk rincian per pemilik/sekutu; keduanya nil untuk
// buku PT.
func BuildEquityStatement(atOpening, atClosing, period, periodNonClosing []accountSums, partners []EquityPartnerRef) *EquityStatement {
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
	es.Partners = buildEquityPartners(openingByCode, period, periodNonClosing, partners)
	return es
}

// buildEquityPartners: padanan `buildEquityPartners` + penyusun di
// `getEquityStatement` TS. Hanya akun bertipe `equity` yang dihitung — TS
// membaca mutasi lewat kueri berpenyaring tipe ekuitas, jadi akun sekutu yang
// tipenya diubah orang menjadi bukan-ekuitas bernilai nol di kedua bahasa.
func buildEquityPartners(openingByCode map[string]Cents, period, periodNonClosing []accountSums, partners []EquityPartnerRef) []EquityPartner {
	if len(partners) == 0 {
		return nil
	}
	type sums struct{ debit, credit Cents }
	index := func(list []accountSums) map[string]sums {
		m := map[string]sums{}
		for _, a := range list {
			if a.accountType == string(contract.AccountTypeEquity) {
				m[a.code] = sums{a.debit, a.credit}
			}
		}
		return m
	}
	all, nonClosing := index(period), index(periodNonClosing)
	equityCodes := map[string]bool{}
	for _, a := range period {
		if a.accountType == string(contract.AccountTypeEquity) {
			equityCodes[a.code] = true
		}
	}

	var out []EquityPartner
	for _, p := range partners {
		var opening, debit, credit, ncDebit, ncCredit Cents
		for _, code := range []string{p.CapitalCode, p.DrawingCode} {
			if code == "" || !equityCodes[code] {
				continue
			}
			opening += openingByCode[code]
			debit += all[code].debit
			credit += all[code].credit
			ncDebit += nonClosing[code].debit
			ncCredit += nonClosing[code].credit
		}
		row := EquityPartner{
			Name: p.Name, Role: p.Role, ShareBp: p.ShareBp, IsActive: p.IsActive,
			Opening:       opening,
			ProfitShare:   (credit - ncCredit) - (debit - ncDebit),
			Contributions: ncCredit,
			Drawings:      ncDebit,
		}
		if row.Opening == 0 && row.ProfitShare == 0 && row.Contributions == 0 && row.Drawings == 0 {
			continue
		}
		row.Closing = row.Opening + row.ProfitShare + row.Contributions - row.Drawings
		out = append(out, row)
	}
	return out
}
