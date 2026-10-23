package ledgerread

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ ARUS KAS — PADANAN `getCashFlow` DI `src/lib/reports.ts` ═══════════════
//
// Laporan KEEMPAT tahap 1d. Aturannya DISALIN, bukan dirancang ulang — `bun
// run parity:cash-flow` membandingkan keduanya atas buku sungguhan. Setiap
// butir di bawah adalah perilaku TS yang wajib sama:
//
//  1. Sisi KAS = akun bertipe `contract.CashAccountType`. Rupiah DASAR saja
//     (`base_debit` / `base_credit`); valas tidak pernah dijumlahkan dalam
//     mata uang aslinya.
//  2. Arus kas adalah pertanyaan PER JURNAL, atas baris yang jurnalnya
//     bertanggal di [from, to] (keduanya INKLUSIF, nil = tanpa batas).
//     Jurnal penutup tahunan TIDAK dibuang — ia tidak menyentuh kas, dan TS
//     tidak menyaringnya.
//  3. netKas jurnal = Σ(debit − kredit) baris kasnya. Nol → jurnal dilewati
//     seluruhnya (tidak ada kas yang menyeberang, atau hanya berpindah antar
//     akun kas).
//  4. Setiap baris BUKAN kas jurnal itu menyumbang bagian = kredit − debit;
//     bagian nol dilewati, positif ke `inflow` akunnya, negatif ke `outflow`.
//     Satu akun bisa punya keduanya.
//  5. Kelompok dari TIPE akun lawan (`contract.CashFlowCategoryOf`) — tipe
//     tak dipetakan jatuh ke kelompok cadangan yang terlihat. Kelompok
//     berurutan `contract.CashFlowCategories`, baris dalam urutan
//     `ORDER BY code` basis data.
//  6. Saldo kas awal = jumlah sebelum `from` (EKSKLUSIF), hanya bila `from`
//     ada; saldo akhir = sampai `to` (INKLUSIF), seluruh buku bila nil. Akun
//     kas yang awal DAN akhirnya nol tidak dirinci.
//  7. `reconciled` = perubahan bersih kelompok sama dengan selisih saldo kas
//     akhir − awal (agregat terpisah, jadi pemeriksaan sungguhan).
//  8. `suspectUnrated` = baris periode (SEMUA baris, bukan hanya yang
//     menggerakkan kas) bermata uang bukan `contract.BaseCurrency` dengan
//     kurs tepat 1.
//
// Bedanya satu, disengaja dan sama dengan laporan lain: TS menjumlahkan float
// (dan memutuskan "nol" lewat `Math.round(x * 100) === 0`), Go menjumlahkan
// sen int64. Paritas membandingkan pada ketelitian sen.

// CashFlowLine: sumbangan satu akun lawan ke arus kas periode.
type CashFlowLine struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Inflow  Cents  `json:"inflow"`
	Outflow Cents  `json:"outflow"`
	Net     Cents  `json:"net"`
}

// CashFlowGroup: satu kelompok (operasi / investasi / pendanaan / cadangan).
type CashFlowGroup struct {
	Category contract.CashFlowCategory `json:"category"`
	Lines    []CashFlowLine            `json:"lines"`
	Inflow   Cents                     `json:"inflow"`
	Outflow  Cents                     `json:"outflow"`
	Net      Cents                     `json:"net"`
}

// CashAccountMovement: gerak satu akun kas & bank, panel rekonsiliasi.
type CashAccountMovement struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Opening Cents  `json:"opening"`
	Closing Cents  `json:"closing"`
	Net     Cents  `json:"net"`
}

// CashFlow: bentuk `CashFlowReport` TS.
type CashFlow struct {
	From           *time.Time            `json:"from"`
	To             *time.Time            `json:"to"`
	Groups         []CashFlowGroup       `json:"groups"`
	TotalInflow    Cents                 `json:"totalInflow"`
	TotalOutflow   Cents                 `json:"totalOutflow"`
	NetChange      Cents                 `json:"netChange"`
	OpeningCash    Cents                 `json:"openingCash"`
	ClosingCash    Cents                 `json:"closingCash"`
	CashAccounts   []CashAccountMovement `json:"cashAccounts"`
	Reconciled     bool                  `json:"reconciled"`
	SuspectUnrated int64                 `json:"suspectUnrated"`
	// UnknownTypes: kode akun LAWAN bertipe di luar kontrak yang menggerakkan
	// kas — barisnya tetap dihitung (kelompok cadangan, seperti TS), dicatat
	// supaya terlihat.
	UnknownTypes []string `json:"unknownTypes"`
}

// CashFlowLineIn: satu baris jurnal periode, bentuk yang dibaca aturan arus
// kas — kode akun (unik), apakah akun itu sisi kas, rupiah dasar, dan apakah
// ia "valas berkurs 1" (butir 8).
type CashFlowLineIn struct {
	JournalID   int64
	AccountCode string
	IsCash      bool
	BaseDebit   Cents
	BaseCredit  Cents
	Suspect     bool
}

type flowSums struct{ inflow, outflow Cents }

// CashFlowTally mengumpulkan bagian arus kas jurnal demi jurnal (butir 2–4,
// 8). Dipakai pembaca basis data DAN berkas emas — aturannya satu.
type CashFlowTally struct {
	byCode  map[string]*flowSums
	suspect int64
}

// NewCashFlowTally: penghitung kosong.
func NewCashFlowTally() *CashFlowTally {
	return &CashFlowTally{byCode: map[string]*flowSums{}}
}

// Journal menerapkan butir 3–4 atas SEMUA baris satu jurnal, dan butir 8
// atas setiap barisnya.
func (t *CashFlowTally) Journal(lines []CashFlowLineIn) {
	var netCash Cents
	for _, l := range lines {
		if l.Suspect {
			t.suspect++
		}
		if l.IsCash {
			netCash += l.BaseDebit - l.BaseCredit
		}
	}
	if netCash == 0 {
		return
	}
	for _, l := range lines {
		if l.IsCash {
			continue
		}
		// Baris lawan berjumlah −netKas, jadi −(debit − kredit) adalah bagian
		// TEPAT baris ini — tanpa taksiran proporsional.
		share := l.BaseCredit - l.BaseDebit
		if share == 0 {
			continue
		}
		s := t.byCode[l.AccountCode]
		if s == nil {
			s = &flowSums{}
			t.byCode[l.AccountCode] = s
		}
		if share > 0 {
			s.inflow += share
		} else {
			s.outflow += -share
		}
	}
}

// cashFlowLinesSQL: baris jurnal periode, BERURUTAN per jurnal supaya
// pembacanya bisa memproses jurnal demi jurnal tanpa menahan seluruh periode
// di memori. Batas tanggal teks UTC `::timestamp` (alasan di
// `trialBalanceSQL`); uang `::text`, diurai tepat. "Valas berkurs 1"
// diputuskan di SQL atas NUMERIC yang tepat (`rate = 1`), padanan
// `Number(l.rate) === 1` TS atas Decimal(18,6).
const cashFlowLinesSQL = `
SELECT jl.journal_id, a.code, a.type = $3::text,
       jl.base_debit::text, jl.base_credit::text,
       (jl.currency <> $4::text AND jl.rate = 1)
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  JOIN accounts a ON a.id = jl.account_id
 WHERE ($1::timestamp IS NULL OR j.date >= $1::timestamp)
   AND ($2::timestamp IS NULL OR j.date <= $2::timestamp)
 ORDER BY jl.journal_id, jl.id`

// CashFlow menghitung Arus Kas [from, to] (INKLUSIF; nil = tanpa batas) di
// dalam SATU transaksi baca — saldo awal, saldo akhir, dan baris periode
// melihat potret buku yang sama.
func (r *Reader) CashFlow(ctx context.Context, from, to *time.Time) (*CashFlow, error) {
	var closing, opening []accountSums
	tally := NewCashFlowTally()
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		if closing, err = r.nets(ctx, tx, netsFilter{to: to}); err != nil {
			return err
		}
		if from != nil {
			if opening, err = r.nets(ctx, tx, netsFilter{before: from}); err != nil {
				return err
			}
		}
		rows, err := tx.Query(ctx, cashFlowLinesSQL,
			tsParam(from), tsParam(to), string(contract.CashAccountType), string(contract.BaseCurrency))
		if err != nil {
			return fmt.Errorf("kueri baris arus kas: %w", err)
		}
		defer rows.Close()
		var journal []CashFlowLineIn
		for rows.Next() {
			var l CashFlowLineIn
			var debit, credit string
			if err := rows.Scan(&l.JournalID, &l.AccountCode, &l.IsCash, &debit, &credit, &l.Suspect); err != nil {
				return fmt.Errorf("baca baris arus kas: %w", err)
			}
			if l.BaseDebit, err = ParseCents(debit); err != nil {
				return fmt.Errorf("jurnal %d akun %s, debit: %w", l.JournalID, l.AccountCode, err)
			}
			if l.BaseCredit, err = ParseCents(credit); err != nil {
				return fmt.Errorf("jurnal %d akun %s, kredit: %w", l.JournalID, l.AccountCode, err)
			}
			if len(journal) > 0 && journal[0].JournalID != l.JournalID {
				tally.Journal(journal)
				journal = journal[:0]
			}
			journal = append(journal, l)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if len(journal) > 0 {
			tally.Journal(journal)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	cf := BuildCashFlow(closing, opening, from != nil, tally)
	cf.From, cf.To = utcPtr(from), utcPtr(to)
	return cf, nil
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

// BuildCashFlow menerapkan butir 5–7. `closing` = jumlah per akun sampai `to`
// (SEMUA akun, urutan kode — juga daftar akun laporan); `opening` = jumlah
// sebelum `from`, dipakai hanya bila hasOpening. MURNI.
func BuildCashFlow(closing, opening []accountSums, hasOpening bool, tally *CashFlowTally) *CashFlow {
	cf := &CashFlow{
		Groups:         make([]CashFlowGroup, len(contract.CashFlowCategories)),
		CashAccounts:   []CashAccountMovement{},
		SuspectUnrated: tally.suspect,
		UnknownTypes:   []string{},
	}
	index := map[contract.CashFlowCategory]int{}
	for i, c := range contract.CashFlowCategories {
		cf.Groups[i] = CashFlowGroup{Category: c, Lines: []CashFlowLine{}}
		index[c] = i
	}

	for _, a := range closing {
		t := tally.byCode[a.code]
		if t == nil || (t.inflow == 0 && t.outflow == 0) {
			continue
		}
		if !contract.IsAccountType(a.accountType) {
			cf.UnknownTypes = append(cf.UnknownTypes, a.code)
		}
		g := &cf.Groups[index[contract.CashFlowCategoryOf(a.accountType)]]
		net := t.inflow - t.outflow
		g.Lines = append(g.Lines, CashFlowLine{
			Code: a.code, Name: a.name, Type: a.accountType,
			Inflow: t.inflow, Outflow: t.outflow, Net: net,
		})
		g.Inflow += t.inflow
		g.Outflow += t.outflow
		g.Net += net
	}
	for _, g := range cf.Groups {
		cf.TotalInflow += g.Inflow
		cf.TotalOutflow += g.Outflow
	}
	cf.NetChange = cf.TotalInflow - cf.TotalOutflow

	openingByCode := map[string]accountSums{}
	if hasOpening {
		for _, a := range opening {
			openingByCode[a.code] = a
		}
	}
	for _, a := range closing {
		if a.accountType != string(contract.CashAccountType) {
			continue
		}
		o := openingByCode[a.code]
		openingBal := o.debit - o.credit
		closingBal := a.debit - a.credit
		cf.OpeningCash += openingBal
		cf.ClosingCash += closingBal
		if openingBal == 0 && closingBal == 0 {
			continue
		}
		cf.CashAccounts = append(cf.CashAccounts, CashAccountMovement{
			Code: a.code, Name: a.name, Opening: openingBal, Closing: closingBal, Net: closingBal - openingBal,
		})
	}
	cf.Reconciled = cf.NetChange == cf.ClosingCash-cf.OpeningCash
	return cf
}
